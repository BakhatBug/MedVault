import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import * as emergencyService from "../services/emergency.js";

const PatientCodeParams = z.object({
  patientCode: z.string().regex(/^MVK-\d{4}-\d{5,}$/),
});

function ctx(req: FastifyRequest) {
  return { ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null };
}

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof emergencyService.EmergencyError) {
    return reply.code(err.status).send({ error: err.code, message: err.message });
  }
  throw err;
}

// Spec §4.2.6 — the ONE unauthenticated route besides /auth.
// Returns patient-disclosed critical info for use during emergencies.
export async function emergencyRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/emergency/:patientCode",
    {
      // Tighter rate limit than the global default. A real ambulance scanner
      // hits this once per patient; anything more is enumeration.
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const { patientCode } = PatientCodeParams.parse(req.params);
      try {
        const result = await emergencyService.getEmergencyView({ patientCode }, ctx(req));
        return reply.send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );
}
