import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import * as emergencyService from "../services/emergency.js";

const DisclosurePatchBody = z.object({
  bloodType: z.boolean().optional(),
  allergies: z.boolean().optional(),
  currentMedications: z.boolean().optional(),
  emergencyContact: z.boolean().optional(),
});

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof emergencyService.EmergencyError) {
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
}
