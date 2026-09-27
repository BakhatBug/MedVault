import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { allowedMimeTypes, fileSizeBytes, recordCategory } from "@medivault/shared";
import * as recordsService from "../services/records.js";

// ──────────────────────────────────────────────────────────────────────────────
// Body schemas
// ──────────────────────────────────────────────────────────────────────────────

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

const ListQuery = z.object({
  category: recordCategory.optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  cursor: z.string().uuid().optional(),
});

const RecordIdParams = z.object({
  id: z.string().uuid(),
});

function ctx(req: FastifyRequest) {
  return { ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null };
}

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof recordsService.RecordsError) {
    return reply.code(err.status).send({ error: err.code, message: err.message });
  }
  throw err;
}

// ──────────────────────────────────────────────────────────────────────────────
// Routes — all require auth. v0.2 limits to PATIENT role; doctor / caregiver
// access lands in v0.3 with the access-permission flow.
// ──────────────────────────────────────────────────────────────────────────────

export async function recordsRoutes(app: FastifyInstance): Promise<void> {
  app.post("/records/presign", { preHandler: [app.requireAuth, app.requireRole("PATIENT")] }, async (req, reply) => {
    const body = PresignBody.parse(req.body);
    try {
      const result = await recordsService.presignUploadForUser({ userId: req.user!.id, ...body });
      return reply.code(200).send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/records/confirm", { preHandler: [app.requireAuth, app.requireRole("PATIENT")] }, async (req, reply) => {
    const body = ConfirmBody.parse(req.body);
    try {
      const result = await recordsService.confirmUpload({ userId: req.user!.id, ...body }, ctx(req));
      return reply.code(201).send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.get("/records", { preHandler: [app.requireAuth, app.requireRole("PATIENT")] }, async (req, reply) => {
    const query = ListQuery.parse(req.query);
    try {
      const result = await recordsService.listOwnRecords({ userId: req.user!.id, ...query });
      return reply.send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.get("/records/:id", { preHandler: [app.requireAuth, app.requireRole("PATIENT")] }, async (req, reply) => {
    const params = RecordIdParams.parse(req.params);
    try {
      const result = await recordsService.getRecordForUser({ userId: req.user!.id, recordId: params.id });
      return reply.send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.get("/records/:id/view-url", { preHandler: [app.requireAuth, app.requireRole("PATIENT")] }, async (req, reply) => {
    const params = RecordIdParams.parse(req.params);
    try {
      const result = await recordsService.viewUrlForUser({ userId: req.user!.id, recordId: params.id }, ctx(req));
      return reply.send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.delete("/records/:id", { preHandler: [app.requireAuth, app.requireRole("PATIENT")] }, async (req, reply) => {
    const params = RecordIdParams.parse(req.params);
    try {
      await recordsService.deleteRecordForUser({ userId: req.user!.id, recordId: params.id }, ctx(req));
      return reply.code(204).send();
    } catch (err) {
      return handleError(err, reply);
    }
  });
}
