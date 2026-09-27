import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import * as timelineService from "../services/timeline.js";
import * as accessService from "../services/access.js";

const TimelineEventType = z.enum([
  "record_uploaded",
  "diagnosis",
  "lab_result",
  "vaccination",
  "allergy_recorded",
  "medication_started",
  "medication_discontinued",
]);

const TimelineQuery = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  types: z
    .string()
    .transform((s) => s.split(",").map((p) => p.trim()).filter(Boolean))
    .pipe(z.array(TimelineEventType))
    .optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const PatientCodeParams = z.object({
  patientCode: z.string().regex(/^MVK-\d{4}-\d{5,}$/),
});

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof timelineService.TimelineError || err instanceof accessService.AccessError) {
    return reply.code(err.status).send({ error: err.code, message: err.message });
  }
  throw err;
}

export async function timelineRoutes(app: FastifyInstance): Promise<void> {
  // Patient — own timeline
  app.get("/me/timeline", { preHandler: [app.requireAuth, app.requireRole("PATIENT")] }, async (req, reply) => {
    const filters = TimelineQuery.parse(req.query);
    try {
      const result = await timelineService.getTimelineForPatient({ patientUserId: req.user!.id, filters });
      return reply.send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Doctor — patient timeline (requires active access permission)
  app.get(
    "/patients/:patientCode/timeline",
    { preHandler: [app.requireAuth, app.requireRole("DOCTOR")] },
    async (req, reply) => {
      const { patientCode } = PatientCodeParams.parse(req.params);
      const filters = TimelineQuery.parse(req.query);
      try {
        const result = await timelineService.getTimelineForDoctor({
          doctorUserId: req.user!.id,
          patientCode,
          filters,
        });
        return reply.send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );
}
