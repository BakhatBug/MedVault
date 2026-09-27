import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { recordCategory } from "@medivault/shared";
import * as recordsService from "../services/records.js";
import * as accessService from "../services/access.js";
import * as medsService from "../services/medications.js";
import * as summaryService from "../services/ai/summary.js";
import * as qaService from "../services/ai/qa.js";
import * as interactionsService from "../services/ai/interactions.js";
import { AIRateLimitError } from "../services/ai/limits.js";

// Per spec §8.6 — every AI-generated user-visible string must include a disclaimer.
const AI_DISCLAIMER = "AI-generated summary — verify with original documents.";
const AI_QA_DISCLAIMER = "AI-generated answer — verify with original documents before acting on this information.";

// Doctor-side patient view. All endpoints require an active access grant for
// the requested patient — enforced inside the service layer via
// assertActivePermission.

const PatientCodeParams = z.object({
  patientCode: z.string().regex(/^MVK-\d{4}-\d{5,}$/),
});

const RecordIdParams = z.object({
  patientCode: z.string().regex(/^MVK-\d{4}-\d{5,}$/),
  recordId: z.string().uuid(),
});

const ListQuery = z.object({
  category: recordCategory.optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  cursor: z.string().uuid().optional(),
});

const MedsListQuery = z.object({
  includeInactive: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  cursor: z.string().uuid().optional(),
});

const AskBody = z.object({
  question: z.string().min(3).max(1000),
});

function ctx(req: FastifyRequest) {
  return { ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null };
}

function handleError(err: unknown, reply: FastifyReply) {
  if (
    err instanceof recordsService.RecordsError ||
    err instanceof accessService.AccessError ||
    err instanceof medsService.MedicationError ||
    err instanceof summaryService.SummaryError ||
    err instanceof qaService.QaError ||
    err instanceof interactionsService.InteractionsError ||
    err instanceof AIRateLimitError
  ) {
    return reply.code(err.status).send({ error: err.code, message: err.message });
  }
  throw err;
}

export async function patientsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/patients/:patientCode",
    { preHandler: [app.requireAuth, app.requireRole("DOCTOR")] },
    async (req, reply) => {
      const { patientCode } = PatientCodeParams.parse(req.params);
      try {
        const result = await recordsService.getPatientForDoctor({
          doctorUserId: req.user!.id,
          patientCode,
        });
        return reply.send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // Drug-interaction view for the doctor — same cached value the patient sees.
  // Doctors don't get a refresh button: forcing a recompute would count against
  // their AI rate limit and the patient is the system of record for med edits.
  app.get(
    "/patients/:patientCode/drug-interactions",
    { preHandler: [app.requireAuth, app.requireRole("DOCTOR")] },
    async (req, reply) => {
      const { patientCode } = PatientCodeParams.parse(req.params);
      try {
        const { patientId } = await recordsService.getSummaryContextForDoctor({
          doctorUserId: req.user!.id,
          patientCode,
        });
        const result = await interactionsService.getCachedInteractions(patientId);
        if (!result) {
          return reply.send({
            status: "no_check_yet",
            disclaimer:
              "AI-generated interaction list — verify with clinical references and do not modify treatment based on this alone.",
          });
        }
        return reply.send({
          ...result,
          disclaimer:
            "AI-generated interaction list — verify with clinical references and do not modify treatment based on this alone.",
        });
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  app.get(
    "/patients/:patientCode/medications",
    { preHandler: [app.requireAuth, app.requireRole("DOCTOR")] },
    async (req, reply) => {
      const { patientCode } = PatientCodeParams.parse(req.params);
      const query = MedsListQuery.parse(req.query);
      try {
        const result = await medsService.listMedicationsForDoctor({
          doctorUserId: req.user!.id,
          patientCode,
          ...query,
        });
        return reply.send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  app.get(
    "/patients/:patientCode/records",
    { preHandler: [app.requireAuth, app.requireRole("DOCTOR")] },
    async (req, reply) => {
      const { patientCode } = PatientCodeParams.parse(req.params);
      const query = ListQuery.parse(req.query);
      try {
        const result = await recordsService.listRecordsForDoctor({
          doctorUserId: req.user!.id,
          patientCode,
          ...query,
        });
        return reply.send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  app.get(
    "/patients/:patientCode/records/:recordId",
    { preHandler: [app.requireAuth, app.requireRole("DOCTOR")] },
    async (req, reply) => {
      const params = RecordIdParams.parse(req.params);
      try {
        // Pre-flight: ensure the doctor has access to this patientCode and that
        // the recordId belongs to that patient. The service-layer auth handles
        // the second check via authorizeRecordAccess.
        const result = await recordsService.getRecordForDoctor({
          doctorUserId: req.user!.id,
          recordId: params.recordId,
        });
        return reply.send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  app.get(
    "/patients/:patientCode/records/:recordId/view-url",
    { preHandler: [app.requireAuth, app.requireRole("DOCTOR")] },
    async (req, reply) => {
      const params = RecordIdParams.parse(req.params);
      try {
        const result = await recordsService.viewUrlForDoctor(
          { doctorUserId: req.user!.id, recordId: params.recordId },
          ctx(req),
        );
        return reply.send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // Doctor Q&A — free-form question against the patient's structured data
  // (spec §4.3.3, §8.5). Each call counts against the per-patient/per-doctor
  // AI rate limit. Audit row written via logAiCall.
  app.post(
    "/patients/:patientCode/ask",
    { preHandler: [app.requireAuth, app.requireRole("DOCTOR")] },
    async (req, reply) => {
      const { patientCode } = PatientCodeParams.parse(req.params);
      const body = AskBody.parse(req.body);
      try {
        const { patientId, hipaaTenant } = await recordsService.getSummaryContextForDoctor({
          doctorUserId: req.user!.id,
          patientCode,
        });
        const result = await qaService.askPatientQuestion({
          patientId,
          callerUserId: req.user!.id,
          hipaaTenant,
          question: body.question,
        });
        return reply.send({
          answer: result.answer,
          modelId: result.modelId,
          generatedAt: result.generatedAt,
          tokens: { input: result.inputTokens, output: result.outputTokens },
          disclaimer: AI_QA_DISCLAIMER,
        });
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // AI assessment panel (spec §4.3.3, §8.3). Returns cached summary when the
  // patient's record set hash hasn't changed; regenerates with ?refresh=true.
  app.get(
    "/patients/:patientCode/summary",
    { preHandler: [app.requireAuth, app.requireRole("DOCTOR")] },
    async (req, reply) => {
      const { patientCode } = PatientCodeParams.parse(req.params);
      const refresh = (req.query as { refresh?: string }).refresh === "true";
      try {
        const { patientId, hipaaTenant } = await recordsService.getSummaryContextForDoctor({
          doctorUserId: req.user!.id,
          patientCode,
        });
        const summary = await summaryService.generateOrGetSummary({
          patientId,
          callerUserId: req.user!.id,
          hipaaTenant,
          forceRefresh: refresh,
        });
        return reply.send({
          id: summary.id,
          summaryText: summary.summaryText,
          flags: summary.flags,
          modelId: summary.modelId,
          generatedAt: summary.createdAt,
          cached: summary.cached,
          disclaimer: AI_DISCLAIMER,
        });
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );
}
