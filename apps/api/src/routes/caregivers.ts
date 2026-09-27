import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { phoneE164, recordCategory, allowedMimeTypes, fileSizeBytes } from "@medivault/shared";
import * as caregiversService from "../services/caregivers.js";
import * as recordsService from "../services/records.js";

// ──────────────────────────────────────────────────────────────────────────────
// Body / param schemas
// ──────────────────────────────────────────────────────────────────────────────

const InviteBody = z
  .object({
    caregiverEmail: z.string().email().max(254).optional(),
    caregiverPhoneE164: phoneE164.optional(),
  })
  .refine((b) => !!b.caregiverEmail || !!b.caregiverPhoneE164, {
    message: "Provide caregiverEmail or caregiverPhoneE164",
  });

const LinkIdParams = z.object({ id: z.string().uuid() });

const PatientCodeParams = z.object({
  patientCode: z.string().regex(/^MVK-\d{4}-\d{5,}$/),
});

const ListQuery = z.object({
  category: recordCategory.optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  cursor: z.string().uuid().optional(),
});

const PresignBody = z.object({
  mimeType: allowedMimeTypes,
  sizeBytes: fileSizeBytes,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const ConfirmBody = z.object({
  s3Key: z.string().min(1).max(1024),
  category: recordCategory,
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
  recordedAt: z.string().datetime().optional(),
  mimeType: allowedMimeTypes,
  sizeBytes: fileSizeBytes,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

function ctx(req: FastifyRequest) {
  return { ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null };
}

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof caregiversService.CaregiverError || err instanceof recordsService.RecordsError) {
    return reply.code(err.status).send({ error: err.code, message: err.message });
  }
  throw err;
}

// ──────────────────────────────────────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────────────────────────────────────

export async function caregiversRoutes(app: FastifyInstance): Promise<void> {
  // Patient → invite a caregiver
  app.post(
    "/caregivers/invite",
    { preHandler: [app.requireAuth, app.requireRole("PATIENT")] },
    async (req, reply) => {
      const body = InviteBody.parse(req.body);
      try {
        const result = await caregiversService.inviteCaregiver(
          { patientUserId: req.user!.id, caregiverEmail: body.caregiverEmail, caregiverPhoneE164: body.caregiverPhoneE164 },
          ctx(req),
        );
        return reply.code(201).send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // Patient → list outgoing caregiver invitations and active links
  app.get(
    "/caregivers/outgoing",
    { preHandler: [app.requireAuth, app.requireRole("PATIENT")] },
    async (req, reply) => {
      const items = await caregiversService.listOutgoingForPatient(req.user!.id);
      return reply.send({ items });
    },
  );

  // Caregiver → list incoming invitations + active links
  app.get(
    "/caregivers/incoming",
    { preHandler: [app.requireAuth, app.requireRole("CAREGIVER")] },
    async (req, reply) => {
      const items = await caregiversService.listIncomingForCaregiver(req.user!.id);
      return reply.send({ items });
    },
  );

  // Caregiver → accept pending invitation
  app.post(
    "/caregivers/:id/accept",
    { preHandler: [app.requireAuth, app.requireRole("CAREGIVER")] },
    async (req, reply) => {
      const { id } = LinkIdParams.parse(req.params);
      try {
        await caregiversService.acceptCaregiverLink({ caregiverUserId: req.user!.id, linkId: id }, ctx(req));
        return reply.code(204).send();
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // Caregiver → decline pending invitation
  app.post(
    "/caregivers/:id/decline",
    { preHandler: [app.requireAuth, app.requireRole("CAREGIVER")] },
    async (req, reply) => {
      const { id } = LinkIdParams.parse(req.params);
      try {
        await caregiversService.declineCaregiverLink({ caregiverUserId: req.user!.id, linkId: id }, ctx(req));
        return reply.code(204).send();
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // Either side → revoke
  app.post("/caregivers/:id/revoke", { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = LinkIdParams.parse(req.params);
    try {
      await caregiversService.revokeCaregiverLink({ actorUserId: req.user!.id, linkId: id }, ctx(req));
      return reply.code(204).send();
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Caregiver-scoped data routes — only callable with an ACTIVE link
  // ────────────────────────────────────────────────────────────────────────────

  // Caregiver → list patient's records
  app.get(
    "/caregivers/patients/:patientCode/records",
    { preHandler: [app.requireAuth, app.requireRole("CAREGIVER")] },
    async (req, reply) => {
      const { patientCode } = PatientCodeParams.parse(req.params);
      const query = ListQuery.parse(req.query);
      try {
        const result = await recordsService.listRecordsForCaregiver({
          caregiverUserId: req.user!.id,
          patientCode,
          category: query.category,
          limit: query.limit,
          cursor: query.cursor,
        });
        return reply.send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // Caregiver → presign upload on patient's behalf
  app.post(
    "/caregivers/patients/:patientCode/records/presign",
    { preHandler: [app.requireAuth, app.requireRole("CAREGIVER")] },
    async (req, reply) => {
      const { patientCode } = PatientCodeParams.parse(req.params);
      const body = PresignBody.parse(req.body);
      try {
        const result = await recordsService.presignUploadForCaregiver({
          caregiverUserId: req.user!.id,
          patientCode,
          ...body,
        });
        return reply.send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // Caregiver → confirm upload (persists record + queues AI extraction)
  app.post(
    "/caregivers/patients/:patientCode/records/confirm",
    { preHandler: [app.requireAuth, app.requireRole("CAREGIVER")] },
    async (req, reply) => {
      const { patientCode } = PatientCodeParams.parse(req.params);
      const body = ConfirmBody.parse(req.body);
      try {
        const result = await recordsService.confirmUploadForCaregiver(
          { caregiverUserId: req.user!.id, patientCode, s3Key: body.s3Key, category: body.category, title: body.title, notes: body.notes, recordedAt: body.recordedAt, mimeType: body.mimeType, sizeBytes: body.sizeBytes, sha256: body.sha256 },
          ctx(req),
        );
        return reply.code(201).send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );
}
