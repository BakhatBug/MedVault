import type { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { logger } from "./logger.js";

export type AuditEvent = {
  action: AuditAction;
  actorUserId?: string | null;
  subjectUserId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

// Best-effort write — audit must never block the user-facing flow. If the audit
// row fails to insert, we log loudly (so it can be alerted on) and continue.
// In production, swap this for a queue (BullMQ) so the failure is retryable.
export async function recordAudit(event: AuditEvent): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: event.action,
        actorUserId: event.actorUserId ?? null,
        subjectUserId: event.subjectUserId ?? null,
        metadata: event.metadata ?? {},
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, action: event.action }, "audit log write failed");
  }
}
