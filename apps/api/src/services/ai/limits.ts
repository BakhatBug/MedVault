import { prisma } from "../../lib/prisma.js";
import { config } from "../../config.js";

export class AIRateLimitError extends Error {
  readonly code = "ai_rate_limit_exceeded";
  readonly status = 429;
  constructor() {
    super(`AI call limit reached for this patient (${config.AI_RATE_LIMIT_PER_PATIENT_PER_DOCTOR_PER_DAY}/day per doctor)`);
    this.name = "AIRateLimitError";
  }
}

// Spec §8.6 — max 10 AI calls per (patient, doctor) per rolling 24h.
// Counts both successful and failed calls so a misbehaving caller can't blow
// past the cap by triggering errors.
export async function assertWithinRateLimit(args: { patientId: string; callerUserId: string }): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await prisma.aiCallLog.count({
    where: {
      patientId: args.patientId,
      callerUserId: args.callerUserId,
      createdAt: { gte: since },
    },
  });
  if (count >= config.AI_RATE_LIMIT_PER_PATIENT_PER_DOCTOR_PER_DAY) {
    throw new AIRateLimitError();
  }
}
