import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import * as emergencyService from "../services/emergency.js";
import * as summaryService from "../services/ai/summary.js";
import * as qaService from "../services/ai/qa.js";
import { AIRateLimitError } from "../services/ai/limits.js";

const DisclosurePatchBody = z.object({
  bloodType: z.boolean().optional(),
  allergies: z.boolean().optional(),
  currentMedications: z.boolean().optional(),
  emergencyContact: z.boolean().optional(),
});

const AskBody = z.object({
  question: z.string().min(3).max(1000),
});

const AI_PATIENT_DISCLAIMER =
  "MediVault AI assistant provides informational summaries of your health records. Always consult your doctor for medical diagnoses and treatment plans.";

function handleError(err: unknown, reply: FastifyReply) {
  if (
    err instanceof emergencyService.EmergencyError ||
    err instanceof summaryService.SummaryError ||
    err instanceof qaService.QaError ||
    err instanceof AIRateLimitError
  ) {
    return reply.code(err.status).send({ error: err.code, message: err.message });
  }
  throw err;
}

// Protected sample route — proves the JWT preHandler works end-to-end.
// Returns the authenticated user's own profile (no PHI in the response —
// just identifiers and the patient_code if applicable).
export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get("/me", { preHandler: app.requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        hipaaTenant: true,
        createdAt: true,
        patientProfile: { select: { patientCode: true, fullName: true } },
        doctorProfile: { select: { verificationStatus: true, fullName: true, specialty: true } },
      },
    });
    if (!user) return reply.code(404).send({ error: "user_not_found" });
    return reply.send(user);
  });

  // Patient-controlled emergency disclosure flags. See spec §4.2.6 — the
  // patient decides which of {bloodType, allergies, currentMedications,
  // emergencyContact} appear in the public QR view.
  app.get(
    "/me/emergency-disclosure",
    { preHandler: [app.requireAuth, app.requireRole("PATIENT")] },
    async (req, reply) => {
      try {
        const disclosure = await emergencyService.getDisclosure(req.user!.id);
        return reply.send({ disclosure });
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  app.patch(
    "/me/emergency-disclosure",
    { preHandler: [app.requireAuth, app.requireRole("PATIENT")] },
    async (req, reply) => {
      const patch = DisclosurePatchBody.parse(req.body);
      try {
        const next = await emergencyService.updateDisclosure(
          { patientUserId: req.user!.id, patch },
          { ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null },
        );
        return reply.send({ disclosure: next });
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // Patient AI Health Summary — provides the patient with an intelligent overview of their records
  app.get(
    "/me/summary",
    { preHandler: [app.requireAuth, app.requireRole("PATIENT")] },
    async (req, reply) => {
      const refresh = (req.query as { refresh?: string }).refresh === "true";
      try {
        const patientProfile = await prisma.patientProfile.findUnique({
          where: { userId: req.user!.id },
          select: { id: true, user: { select: { hipaaTenant: true } } },
        });
        if (!patientProfile) return reply.code(404).send({ error: "patient_not_found" });

        const summary = await summaryService.generateOrGetSummary({
          patientId: patientProfile.id,
          callerUserId: req.user!.id,
          hipaaTenant: patientProfile.user.hipaaTenant,
          forceRefresh: refresh,
        });

        return reply.send({
          id: summary.id,
          summaryText: summary.summaryText,
          flags: summary.flags,
          modelId: summary.modelId,
          generatedAt: summary.createdAt,
          cached: summary.cached,
          disclaimer: AI_PATIENT_DISCLAIMER,
        });
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // Patient AI Assistant Q&A — patient asks questions about their medications, tests, and documents
  app.post(
    "/me/ask",
    { preHandler: [app.requireAuth, app.requireRole("PATIENT")] },
    async (req, reply) => {
      const body = AskBody.parse(req.body);
      try {
        const patientProfile = await prisma.patientProfile.findUnique({
          where: { userId: req.user!.id },
          select: { id: true, user: { select: { hipaaTenant: true } } },
        });
        if (!patientProfile) return reply.code(404).send({ error: "patient_not_found" });

        const result = await qaService.askPatientQuestion({
          patientId: patientProfile.id,
          callerUserId: req.user!.id,
          hipaaTenant: patientProfile.user.hipaaTenant,
          question: body.question,
        });

        return reply.send({
          answer: result.answer,
          modelId: result.modelId,
          generatedAt: result.generatedAt,
          tokens: { input: result.inputTokens, output: result.outputTokens },
          disclaimer: AI_PATIENT_DISCLAIMER,
        });
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );
}

