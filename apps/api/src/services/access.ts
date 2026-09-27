import {
  AccessDuration,
  AccessPermissionStatus,
  AuditAction,
  DoctorVerificationStatus,
  NotificationKind,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { recordAudit } from "../lib/audit.js";

// ──────────────────────────────────────────────────────────────────────────────
// State machine (per spec §4.2.5, §4.3, §16.3)
//
//   REQUESTED ──(patient approve)──▶ APPROVED ──(patient revoke)──▶ REVOKED
//      │                                │
//      │  (patient deny)                │  (clock past expires_at)
//      ▼                                ▼
//    DENIED                          EXPIRED
//      │
//      │  (48h since request, no response)
//      ▼
//    EXPIRED
//
// EXPIRED is reached lazily — checked on every read of an APPROVED row.
// A nightly sweeper backfills EXPIRED so dashboards stay consistent.
// ──────────────────────────────────────────────────────────────────────────────

export class AccessError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
    this.name = "AccessError";
  }
}

const errors = {
  doctorNotVerified: () => new AccessError("doctor_not_verified", 403, "Your doctor account is not verified yet"),
  patientNotFound: () => new AccessError("patient_not_found", 404, "No patient found with this ID"),
  notFound: () => new AccessError("access_not_found", 404, "Access permission not found"),
  notOwner: () => new AccessError("forbidden", 403, "Not authorized to act on this access permission"),
  badState: (got: AccessPermissionStatus) =>
    new AccessError("bad_state", 409, `Access permission is ${got}; action not allowed in this state`),
  noActiveAccess: () => new AccessError("no_active_access", 403, "No active access permission for this patient"),
  duplicateRequest: () =>
    new AccessError("duplicate_request", 409, "An active or pending access request already exists for this patient"),
};

export type RequestContext = { ipAddress: string | null; userAgent: string | null };

// ──────────────────────────────────────────────────────────────────────────────
// REQUEST — doctor asks a patient for access
// ──────────────────────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 48 * 60 * 60 * 1000; // spec §16.3 — auto-expire in 48h

export async function requestAccess(
  args: { doctorUserId: string; patientCode: string; note?: string },
  ctx: RequestContext,
): Promise<{ id: string; patientId: string; requestExpiresAt: string }> {
  const doctor = await prisma.doctorProfile.findUnique({ where: { userId: args.doctorUserId } });
  if (!doctor || doctor.verificationStatus !== DoctorVerificationStatus.APPROVED) {
    throw errors.doctorNotVerified();
  }

  const patient = await prisma.patientProfile.findUnique({
    where: { patientCode: args.patientCode },
    select: { id: true, userId: true },
  });
  if (!patient) throw errors.patientNotFound();

  // Reject if a non-terminal request already exists. Doctors must wait for
  // EXPIRED/DENIED/REVOKED before re-asking.
  const existing = await prisma.doctorAccessPermission.findFirst({
    where: {
      patientId: patient.id,
      doctorUserId: args.doctorUserId,
      status: { in: [AccessPermissionStatus.REQUESTED, AccessPermissionStatus.APPROVED] },
    },
    select: { id: true },
  });
  if (existing) throw errors.duplicateRequest();

  const requestExpiresAt = new Date(Date.now() + REQUEST_TIMEOUT_MS);

  const permission = await prisma.doctorAccessPermission.create({
    data: {
      patientId: patient.id,
      doctorUserId: args.doctorUserId,
      status: AccessPermissionStatus.REQUESTED,
      requestExpiresAt,
      ...(args.note ? { requestNote: args.note } : {}),
    },
    select: { id: true },
  });

  await prisma.notification.create({
    data: {
      userId: patient.userId,
      kind: NotificationKind.ACCESS_REQUEST,
      title: "New doctor access request",
      body: `Dr. ${doctor.fullName} is requesting access to your records.`,
      data: { permissionId: permission.id, doctorUserId: args.doctorUserId },
    },
  });

  await recordAudit({
    action: AuditAction.ACCESS_REQUESTED,
    actorUserId: args.doctorUserId,
    subjectUserId: patient.userId,
    metadata: { permissionId: permission.id, patientCode: args.patientCode },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return { id: permission.id, patientId: patient.id, requestExpiresAt: requestExpiresAt.toISOString() };
}

// ──────────────────────────────────────────────────────────────────────────────
// APPROVE / DENY / REVOKE — patient transitions
// ──────────────────────────────────────────────────────────────────────────────

function expiresAtForDuration(duration: AccessDuration): Date | null {
  const now = Date.now();
  switch (duration) {
    case AccessDuration.HOURS_24: return new Date(now + 24 * 60 * 60 * 1000);
    case AccessDuration.DAYS_7: return new Date(now + 7 * 24 * 60 * 60 * 1000);
    case AccessDuration.DAYS_30: return new Date(now + 30 * 24 * 60 * 60 * 1000);
    case AccessDuration.PERMANENT: return null;
  }
}

async function loadPermissionOwnedByPatient(args: { permissionId: string; patientUserId: string }) {
  const row = await prisma.doctorAccessPermission.findUnique({
    where: { id: args.permissionId },
    include: { patient: { select: { userId: true } }, doctor: { select: { id: true } } },
  });
  if (!row) throw errors.notFound();
  if (row.patient.userId !== args.patientUserId) throw errors.notOwner();
  return row;
}

export async function approveAccess(
  args: { patientUserId: string; permissionId: string; duration: AccessDuration },
  ctx: RequestContext,
): Promise<{ id: string; status: AccessPermissionStatus; expiresAt: string | null }> {
  const row = await loadPermissionOwnedByPatient({
    permissionId: args.permissionId,
    patientUserId: args.patientUserId,
  });
  if (row.status !== AccessPermissionStatus.REQUESTED) throw errors.badState(row.status);
  if (row.requestExpiresAt < new Date()) {
    // Treat as expired — flip the state and reject the action.
    await prisma.doctorAccessPermission.update({
      where: { id: row.id },
      data: { status: AccessPermissionStatus.EXPIRED },
    });
    throw errors.badState(AccessPermissionStatus.EXPIRED);
  }

  const expiresAt = expiresAtForDuration(args.duration);
  const updated = await prisma.doctorAccessPermission.update({
    where: { id: row.id },
    data: {
      status: AccessPermissionStatus.APPROVED,
      duration: args.duration,
      approvedAt: new Date(),
      expiresAt,
    },
    select: { id: true, status: true, expiresAt: true },
  });

  await prisma.notification.create({
    data: {
      userId: row.doctorUserId,
      kind: NotificationKind.ACCESS_APPROVED,
      title: "Access approved",
      body: "A patient has approved your access request.",
      data: { permissionId: row.id },
    },
  });

  await recordAudit({
    action: AuditAction.ACCESS_GRANTED,
    actorUserId: args.patientUserId,
    subjectUserId: args.patientUserId,
    metadata: { permissionId: row.id, doctorUserId: row.doctorUserId, duration: args.duration },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return { id: updated.id, status: updated.status, expiresAt: updated.expiresAt?.toISOString() ?? null };
}

export async function denyAccess(
  args: { patientUserId: string; permissionId: string },
  ctx: RequestContext,
): Promise<void> {
  const row = await loadPermissionOwnedByPatient({
    permissionId: args.permissionId,
    patientUserId: args.patientUserId,
  });
  if (row.status !== AccessPermissionStatus.REQUESTED) throw errors.badState(row.status);

  await prisma.doctorAccessPermission.update({
    where: { id: row.id },
    data: { status: AccessPermissionStatus.DENIED },
  });

  await prisma.notification.create({
    data: {
      userId: row.doctorUserId,
      kind: NotificationKind.ACCESS_DENIED,
      title: "Access denied",
      body: "A patient has declined your access request.",
      data: { permissionId: row.id },
    },
  });

  await recordAudit({
    action: AuditAction.ACCESS_DENIED,
    actorUserId: args.patientUserId,
    subjectUserId: args.patientUserId,
    metadata: { permissionId: row.id, doctorUserId: row.doctorUserId },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

export async function revokeAccess(
  args: { patientUserId: string; permissionId: string },
  ctx: RequestContext,
): Promise<void> {
  const row = await loadPermissionOwnedByPatient({
    permissionId: args.permissionId,
    patientUserId: args.patientUserId,
  });
  if (row.status !== AccessPermissionStatus.APPROVED) throw errors.badState(row.status);

  await prisma.doctorAccessPermission.update({
    where: { id: row.id },
    data: { status: AccessPermissionStatus.REVOKED, revokedAt: new Date() },
  });

  await recordAudit({
    action: AuditAction.ACCESS_REVOKED,
    actorUserId: args.patientUserId,
    subjectUserId: args.patientUserId,
    metadata: { permissionId: row.id, doctorUserId: row.doctorUserId },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// LIST helpers
// ──────────────────────────────────────────────────────────────────────────────

export async function listIncoming(args: { patientUserId: string }): Promise<unknown[]> {
  const patient = await prisma.patientProfile.findUnique({
    where: { userId: args.patientUserId },
    select: { id: true },
  });
  if (!patient) return [];
  return prisma.doctorAccessPermission.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      duration: true,
      approvedAt: true,
      expiresAt: true,
      requestExpiresAt: true,
      requestNote: true,
      createdAt: true,
      doctor: {
        select: {
          id: true,
          doctorProfile: { select: { fullName: true, specialty: true, hospitalAffiliation: true } },
        },
      },
    },
  });
}

export async function listOutgoing(args: { doctorUserId: string }): Promise<unknown[]> {
  return prisma.doctorAccessPermission.findMany({
    where: { doctorUserId: args.doctorUserId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      duration: true,
      approvedAt: true,
      expiresAt: true,
      requestExpiresAt: true,
      createdAt: true,
      patient: { select: { patientCode: true, fullName: true } },
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Authorization helper — used by patient-data routes when a doctor calls them.
// Implements the lazy-expiry rule: an APPROVED row whose expires_at < now() is
// flipped to EXPIRED in-flight and rejected.
// ──────────────────────────────────────────────────────────────────────────────

export async function assertActivePermission(args: {
  doctorUserId: string;
  patientId: string;
}): Promise<{ permissionId: string }> {
  const row = await prisma.doctorAccessPermission.findFirst({
    where: {
      doctorUserId: args.doctorUserId,
      patientId: args.patientId,
      status: AccessPermissionStatus.APPROVED,
    },
    select: { id: true, expiresAt: true },
  });
  if (!row) throw errors.noActiveAccess();
  if (row.expiresAt && row.expiresAt < new Date()) {
    await prisma.doctorAccessPermission.update({
      where: { id: row.id },
      data: { status: AccessPermissionStatus.EXPIRED },
    });
    throw errors.noActiveAccess();
  }
  return { permissionId: row.id };
}

// Helper for the doctor-side routes to load the patient by their public code.
export async function resolvePatientByCode(patientCode: string): Promise<{ id: string }> {
  const p = await prisma.patientProfile.findUnique({
    where: { patientCode },
    select: { id: true },
  });
  if (!p) throw errors.patientNotFound();
  return p;
}

// Re-export for typing convenience in routes.
export type { Prisma };
