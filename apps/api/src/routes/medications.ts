import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import * as medsService from "../services/medications.js";
import * as interactionsService from "../services/ai/interactions.js";
import { prisma } from "../lib/prisma.js";

const AI_INTERACTIONS_DISCLAIMER =
  "AI-generated interaction list — verify with clinical references and do not modify treatment based on this alone.";

const AddBody = z.object({
  name: z.string().min(1).max(200),
  dosage: z.string().max(100).optional(),
  frequency: z.string().max(200).optional(),
  startDate: z.string().date().optional(),
  prescribingDoctor: z.string().max(200).optional(),
  reminderEnabled: z.boolean().optional(),
  reminderSchedule: z
    .object({
      // Free-form schedule shape — we accept a minimal vocabulary up front and
      // can extend later (e.g. RRULE). Keeping it small avoids painting
      // ourselves into a corner.
      timesPerDay: z.number().int().min(1).max(12).optional(),
      times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).max(12).optional(),
      timezone: z.string().max(64).optional(),
    })
    .optional(),
});

const UpdateBody = AddBody.partial();

const DiscontinueBody = z.object({
  endDate: z.string().date().optional(),
  reason: z.string().max(500).optional(),
});

const ListQuery = z.object({
  includeInactive: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  cursor: z.string().uuid().optional(),
});

const MedIdParams = z.object({ id: z.string().uuid() });

function ctx(req: FastifyRequest) {
  return { ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null };
}

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof medsService.MedicationError || err instanceof interactionsService.InteractionsError) {
    return reply.code(err.status).send({ error: err.code, message: err.message });
  }
  throw err;
}

export async function medicationsRoutes(app: FastifyInstance): Promise<void> {
  app.post("/medications", { preHandler: [app.requireAuth, app.requireRole("PATIENT")] }, async (req, reply) => {
    const body = AddBody.parse(req.body);
    try {
      const result = await medsService.addMedication({ patientUserId: req.user!.id, ...body }, ctx(req));
      return reply.code(201).send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.get("/medications", { preHandler: [app.requireAuth, app.requireRole("PATIENT")] }, async (req, reply) => {
    const query = ListQuery.parse(req.query);
    try {
      const result = await medsService.listOwnMedications({ patientUserId: req.user!.id, ...query });
      return reply.send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.get("/medications/:id", { preHandler: [app.requireAuth, app.requireRole("PATIENT")] }, async (req, reply) => {
    const { id } = MedIdParams.parse(req.params);
    try {
      const result = await medsService.getOwnMedication({ patientUserId: req.user!.id, medicationId: id });
      return reply.send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.patch("/medications/:id", { preHandler: [app.requireAuth, app.requireRole("PATIENT")] }, async (req, reply) => {
    const { id } = MedIdParams.parse(req.params);
    const patch = UpdateBody.parse(req.body);
    try {
      const result = await medsService.updateMedication(
        { patientUserId: req.user!.id, medicationId: id, patch },
        ctx(req),
      );
      return reply.send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post(
    "/medications/:id/discontinue",
    { preHandler: [app.requireAuth, app.requireRole("PATIENT")] },
    async (req, reply) => {
      const { id } = MedIdParams.parse(req.params);
      const body = DiscontinueBody.parse(req.body ?? {});
      try {
        await medsService.discontinueMedication(
          { patientUserId: req.user!.id, medicationId: id, ...body },
          ctx(req),
        );
        return reply.code(204).send();
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  app.delete("/medications/:id", { preHandler: [app.requireAuth, app.requireRole("PATIENT")] }, async (req, reply) => {
    const { id } = MedIdParams.parse(req.params);
    try {
      await medsService.deleteMedication({ patientUserId: req.user!.id, medicationId: id }, ctx(req));
      return reply.code(204).send();
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Drug interaction read — returns whatever the latest cached check produced
  // for the patient's current active medications. If null, no check has run
  // for this exact set yet; client may POST /me/drug-interactions/refresh.
  app.get(
    "/me/drug-interactions",
    { preHandler: [app.requireAuth, app.requireRole("PATIENT")] },
    async (req, reply) => {
      const patient = await prisma.patientProfile.findUnique({
        where: { userId: req.user!.id },
        select: { id: true, user: { select: { hipaaTenant: true } } },
      });
      if (!patient) return reply.code(404).send({ error: "patient_not_found" });
      const result = await interactionsService.getCachedInteractions(patient.id);
      if (!result) return reply.send({ status: "no_check_yet", disclaimer: AI_INTERACTIONS_DISCLAIMER });
      return reply.send({ ...result, disclaimer: AI_INTERACTIONS_DISCLAIMER });
    },
  );

  // Manual refresh — patient can force a re-check (rate-limited via shared
  // assertWithinRateLimit). Used when the patient suspects the cache is stale
  // (e.g., they just bulk-imported meds).
  app.post(
    "/me/drug-interactions/refresh",
    { preHandler: [app.requireAuth, app.requireRole("PATIENT")] },
    async (req, reply) => {
      const patient = await prisma.patientProfile.findUnique({
        where: { userId: req.user!.id },
        select: { id: true, user: { select: { hipaaTenant: true } } },
      });
      if (!patient) return reply.code(404).send({ error: "patient_not_found" });
      try {
        const result = await interactionsService.refreshInteractions({
          patientId: patient.id,
          callerUserId: req.user!.id,
          hipaaTenant: patient.user.hipaaTenant,
        });
        return reply.send({ ...result, disclaimer: AI_INTERACTIONS_DISCLAIMER });
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );
}
