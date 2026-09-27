import { AuditAction, CaregiverLinkStatus, NotificationKind, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { recordAudit } from "../lib/audit.js";

// ──────────────────────────────────────────────────────────────────────────────
// Caregiver linking (spec §4.4, §3.3)
//
// "Caregiver account can be linked to one or more patient accounts. Patient
// sends a 'link request' to the caregiver's account. Caregiver gets read-level
// access to the patient's vault. Can upload documents on the patient's behalf.
// Cannot approve or deny doctor access — that remains with the patient."
//
// State machine:
//   PENDING ──(caregiver accept)──▶ ACTIVE ──(either revoke)──▶ REVOKED
//      │
//      │  (caregiver decline OR patient cancel)
//      ▼
//    REVOKED
// ──────────────────────────────────────────────────────────────────────────────

export class CaregiverError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
    this.name = "CaregiverError";
  }
}

const errors = {
  caregiverNotFound: () => new CaregiverError("caregiver_not_found", 404, "No caregiver account found for that contact"),
  patientNotFound: () => new CaregiverError("patient_not_found", 404, "Patient profile not found"),
  notCaregiverRole: () => new CaregiverError("not_caregiver_role", 400, "Invited user is not registered as a caregiver"),
  notFound: () => new CaregiverError("link_not_found", 404, "Caregiver link not found"),
  forbidden: () => new CaregiverError("forbidden", 403, "Not authorized to act on this caregiver link"),
  duplicate: () =>
    new CaregiverError("duplicate_link", 409, "An active or pending caregiver link already exists for this caregiver"),
  badState: (got: CaregiverLinkStatus) =>
    new CaregiverError("bad_state", 409, `Caregiver link is ${got}; action not allowed in this state`),
  selfLink: () => new CaregiverError("self_link_forbidden", 400, "Cannot invite yourself as a caregiver"),
  noActiveLink: () => new CaregiverError("no_active_link", 403, "No active caregiver link for this patient"),
};

export type RequestContext = { ipAddress: string | null; userAgent: string | null };

// ──────────────────────────────────────────────────────────────────────────────
// INVITE — patient → caregiver
// ──────────────────────────────────────────────────────────────────────────────

export async function inviteCaregiver(
  args: { patientUserId: string; caregiverEmail?: string; caregiverPhoneE164?: string },
  ctx: RequestContext,
): Promise<{ id: string; caregiverUserId: string; status: CaregiverLinkStatus }> {
  if (!args.caregiverEmail && !args.caregiverPhoneE164) {
    throw new CaregiverError("missing_contact", 400, "Provide caregiverEmail or caregiverPhoneE164");
  }

  const patient = await prisma.patientProfile.findUnique({
    where: { userId: args.patientUserId },
    select: { id: true, fullName: true },
  });
  if (!patient) throw errors.patientNotFound();

  const caregiver = await prisma.user.findFirst({
    where: {
      ...(args.caregiverEmail ? { email: args.caregiverEmail.toLowerCase() } : {}),
      ...(args.caregiverPhoneE164 ? { phoneE164: args.caregiverPhoneE164 } : {}),
    },
    select: { id: true, role: true, status: true },
  });
  if (!caregiver) throw errors.caregiverNotFound();
  if (caregiver.id === args.patientUserId) throw errors.selfLink();
  if (caregiver.role !== UserRole.CAREGIVER) throw errors.notCaregiverRole();

  // Don't reveal whether a caregiver account is suspended — use the same 404.
  if (caregiver.status === "DELETED" || caregiver.status === "SUSPENDED") {
    throw errors.caregiverNotFound();
  }

  // Block duplicates while pending or active. After REVOKED, a fresh invite is fine.
  const existing = await prisma.caregiverLink.findUnique({
    where: { patientId_caregiverUserId: { patientId: patient.id, caregiverUserId: caregiver.id } },
    select: { id: true, status: true },
  });
  if (existing && (existing.status === "PENDING" || existing.status === "ACTIVE")) {
    throw errors.duplicate();
  }

  const link = existing
    ? await prisma.caregiverLink.update({
        where: { id: existing.id },
        data: {
          status: CaregiverLinkStatus.PENDING,
          invitedAt: new Date(),
          acceptedAt: null,
          revokedAt: null,
        },
        select: { id: true, status: true },
      })
    : await prisma.caregiverLink.create({
        data: {
          patientId: patient.id,
          caregiverUserId: caregiver.id,
          status: CaregiverLinkStatus.PENDING,
        },
        select: { id: true, status: true },
      });

  await prisma.notification.create({
    data: {
      userId: caregiver.id,
      kind: NotificationKind.CAREGIVER_LINK_REQUEST,
      title: "New caregiver invitation",
      body: `${patient.fullName} has invited you to be their caregiver.`,
      data: { linkId: link.id, patientUserId: args.patientUserId },
    },
  });

  await recordAudit({
    action: AuditAction.CAREGIVER_INVITED,
    actorUserId: args.patientUserId,
    subjectUserId: caregiver.id,
    metadata: { linkId: link.id },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return { id: link.id, caregiverUserId: caregiver.id, status: link.status };
}

// ──────────────────────────────────────────────────────────────────────────────
// ACCEPT / DECLINE — caregiver side
// ──────────────────────────────────────────────────────────────────────────────

async function loadCaregiverLink(args: { linkId: string; caregiverUserId: string }) {
  const row = await prisma.caregiverLink.findUnique({
    where: { id: args.linkId },
    select: { id: true, status: true, patientId: true, caregiverUserId: true, patient: { select: { userId: true } } },
  });
  if (!row) throw errors.notFound();
  if (row.caregiverUserId !== args.caregiverUserId) throw errors.forbidden();
  return row;
}

export async function acceptCaregiverLink(
  args: { caregiverUserId: string; linkId: string },
  ctx: RequestContext,
): Promise<void> {
  const link = await loadCaregiverLink({ linkId: args.linkId, caregiverUserId: args.caregiverUserId });
  if (link.status !== CaregiverLinkStatus.PENDING) throw errors.badState(link.status);

  await prisma.caregiverLink.update({
    where: { id: link.id },
    data: { status: CaregiverLinkStatus.ACTIVE, acceptedAt: new Date() },
  });

  await recordAudit({
    action: AuditAction.CAREGIVER_ACCEPTED,
    actorUserId: args.caregiverUserId,
    subjectUserId: link.patient.userId,
    metadata: { linkId: link.id, patientId: link.patientId },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

export async function declineCaregiverLink(
  args: { caregiverUserId: string; linkId: string },
  ctx: RequestContext,
): Promise<void> {
  const link = await loadCaregiverLink({ linkId: args.linkId, caregiverUserId: args.caregiverUserId });
  if (link.status !== CaregiverLinkStatus.PENDING) throw errors.badState(link.status);

  await prisma.caregiverLink.update({
    where: { id: link.id },
    data: { status: CaregiverLinkStatus.REVOKED, revokedAt: new Date() },
  });

  await recordAudit({
    action: AuditAction.CAREGIVER_DECLINED,
    actorUserId: args.caregiverUserId,
    subjectUserId: link.patient.userId,
    metadata: { linkId: link.id, patientId: link.patientId },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// REVOKE — either side can pull the plug
// ──────────────────────────────────────────────────────────────────────────────

export async function revokeCaregiverLink(
  args: { actorUserId: string; linkId: string },
  ctx: RequestContext,
): Promise<void> {
  const row = await prisma.caregiverLink.findUnique({
    where: { id: args.linkId },
    select: {
      id: true,
      status: true,
      patientId: true,
      caregiverUserId: true,
      patient: { select: { userId: true } },
    },
  });
  if (!row) throw errors.notFound();
  const isPatient = row.patient.userId === args.actorUserId;
  const isCaregiver = row.caregiverUserId === args.actorUserId;
  if (!isPatient && !isCaregiver) throw errors.forbidden();
  if (row.status !== CaregiverLinkStatus.ACTIVE && row.status !== CaregiverLinkStatus.PENDING) {
    throw errors.badState(row.status);
  }

  await prisma.caregiverLink.update({
    where: { id: row.id },
    data: { status: CaregiverLinkStatus.REVOKED, revokedAt: new Date() },
  });

  await recordAudit({
    action: AuditAction.CAREGIVER_REVOKED,
    actorUserId: args.actorUserId,
    subjectUserId: isPatient ? row.caregiverUserId : row.patient.userId,
    metadata: { linkId: row.id, patientId: row.patientId, by: isPatient ? "patient" : "caregiver" },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// LIST helpers
// ──────────────────────────────────────────────────────────────────────────────

export async function listOutgoingForPatient(patientUserId: string): Promise<unknown[]> {
  const patient = await prisma.patientProfile.findUnique({
    where: { userId: patientUserId },
    select: { id: true },
  });
  if (!patient) return [];
  return prisma.caregiverLink.findMany({
    where: { patientId: patient.id },
    orderBy: { invitedAt: "desc" },
    select: {
      id: true,
      status: true,
      invitedAt: true,
      acceptedAt: true,
      revokedAt: true,
      permissions: true,
      caregiver: { select: { id: true, email: true } },
    },
  });
}

export async function listIncomingForCaregiver(caregiverUserId: string): Promise<unknown[]> {
  return prisma.caregiverLink.findMany({
    where: { caregiverUserId },
    orderBy: { invitedAt: "desc" },
    select: {
      id: true,
      status: true,
      invitedAt: true,
      acceptedAt: true,
      revokedAt: true,
      permissions: true,
      patient: { select: { patientCode: true, fullName: true } },
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Authorization helper — used by caregiver-scoped data routes.
// Resolves a patientCode + caregiver to an active link or throws.
// ──────────────────────────────────────────────────────────────────────────────

export async function assertActiveCaregiverLink(args: {
  caregiverUserId: string;
  patientCode: string;
}): Promise<{ patientId: string; linkId: string; permissions: Record<string, unknown> }> {
  const patient = await prisma.patientProfile.findUnique({
    where: { patientCode: args.patientCode },
    select: { id: true },
  });
  if (!patient) throw errors.patientNotFound();
  const link = await prisma.caregiverLink.findUnique({
    where: { patientId_caregiverUserId: { patientId: patient.id, caregiverUserId: args.caregiverUserId } },
    select: { id: true, status: true, permissions: true },
  });
  if (!link || link.status !== CaregiverLinkStatus.ACTIVE) throw errors.noActiveLink();
  return {
    patientId: patient.id,
    linkId: link.id,
    permissions: (link.permissions as Record<string, unknown>) ?? {},
  };
}
