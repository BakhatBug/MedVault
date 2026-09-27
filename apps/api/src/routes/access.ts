import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { accessDuration } from "@medivault/shared";
import * as accessService from "../services/access.js";

const RequestBody = z.object({
  patientCode: z.string().regex(/^MVK-\d{4}-\d{5,}$/),
  note: z.string().max(500).optional(),
});

const ApproveBody = z.object({
  duration: accessDuration,
});

const PermissionIdParams = z.object({ id: z.string().uuid() });

function ctx(req: FastifyRequest) {
  return { ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null };
}

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof accessService.AccessError) {
    return reply.code(err.status).send({ error: err.code, message: err.message });
  }
  throw err;
}

export async function accessRoutes(app: FastifyInstance): Promise<void> {
  // Doctor → request access to a patient
  app.post("/access/request", { preHandler: [app.requireAuth, app.requireRole("DOCTOR")] }, async (req, reply) => {
    const body = RequestBody.parse(req.body);
    try {
      const result = await accessService.requestAccess({ doctorUserId: req.user!.id, patientCode: body.patientCode, note: body.note }, ctx(req));
      return reply.code(201).send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Patient → list incoming requests + grants
  app.get("/access/incoming", { preHandler: [app.requireAuth, app.requireRole("PATIENT")] }, async (req, reply) => {
    const items = await accessService.listIncoming({ patientUserId: req.user!.id });
    return reply.send({ items });
  });

  // Doctor → list own outgoing requests + grants
  app.get("/access/outgoing", { preHandler: [app.requireAuth, app.requireRole("DOCTOR")] }, async (req, reply) => {
    const items = await accessService.listOutgoing({ doctorUserId: req.user!.id });
    return reply.send({ items });
  });

  // Patient → approve a pending request
  app.post("/access/:id/approve", { preHandler: [app.requireAuth, app.requireRole("PATIENT")] }, async (req, reply) => {
    const { id } = PermissionIdParams.parse(req.params);
    const body = ApproveBody.parse(req.body);
    try {
      const result = await accessService.approveAccess(
        { patientUserId: req.user!.id, permissionId: id, duration: body.duration },
        ctx(req),
      );
      return reply.send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Patient → deny a pending request
  app.post("/access/:id/deny", { preHandler: [app.requireAuth, app.requireRole("PATIENT")] }, async (req, reply) => {
    const { id } = PermissionIdParams.parse(req.params);
    try {
      await accessService.denyAccess({ patientUserId: req.user!.id, permissionId: id }, ctx(req));
      return reply.code(204).send();
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Patient → revoke an active grant
  app.post("/access/:id/revoke", { preHandler: [app.requireAuth, app.requireRole("PATIENT")] }, async (req, reply) => {
    const { id } = PermissionIdParams.parse(req.params);
    try {
      await accessService.revokeAccess({ patientUserId: req.user!.id, permissionId: id }, ctx(req));
      return reply.code(204).send();
    } catch (err) {
      return handleError(err, reply);
    }
  });
}
