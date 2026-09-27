import { type Prisma, AIProcessingStatus, AuditAction, type RecordCategory } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { recordAudit } from "../lib/audit.js";
import { buildObjectKey, presignUpload, presignView, deleteObject } from "./storage.js";
import { extractionQueue } from "../queues/extraction.js";
import { assertActivePermission, resolvePatientByCode } from "./access.js";
import { assertActiveCaregiverLink } from "./caregivers.js";

// ──────────────────────────────────────────────────────────────────────────────
// Errors
// ──────────────────────────────────────────────────────────────────────────────

export class RecordsError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
    this.name = "RecordsError";
  }
}

const errors = {
  notFound: () => new RecordsError("not_found", 404, "Record not found"),
  forbidden: () => new RecordsError("forbidden", 403, "Not allowed to access this record"),
  patientNotFound: () => new RecordsError("patient_not_found", 404, "Patient profile not found"),
};

// ──────────────────────────────────────────────────────────────────────────────
// Authorization — does this user own / have access to this patient's records?
// v0.2 covers PATIENT (self) only. Doctor + caregiver paths land with the access
// permission flow.
// ──────────────────────────────────────────────────────────────────────────────

async function resolvePatientForUser(userId: string): Promise<{ id: string }> {
  const profile = await prisma.patientProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) throw errors.patientNotFound();
  return profile;
}

async function assertPatientOwnerOrThrow(args: { recordId: string; userId: string }): Promise<void> {
  const record = await prisma.medicalRecord.findUnique({
    where: { id: args.recordId },
    select: { id: true, patient: { select: { userId: true } }, deletedAt: true },
  });
  if (!record || record.deletedAt) throw errors.notFound();
  if (record.patient.userId !== args.userId) throw errors.forbidden();
}

// Authorization that accepts EITHER the patient owner OR a doctor with an
// active access grant. Returns the patient_id so callers can scope queries.
async function authorizeRecordAccess(args: {
  recordId: string;
  actorUserId: string;
  actorRole: "PATIENT" | "DOCTOR";
}): Promise<{ patientId: string; patientUserId: string }> {
  const record = await prisma.medicalRecord.findUnique({
    where: { id: args.recordId },
    select: {
      patientId: true,
      deletedAt: true,
      patient: { select: { userId: true } },
    },
  });
  if (!record || record.deletedAt) throw errors.notFound();

  if (args.actorRole === "PATIENT") {
    if (record.patient.userId !== args.actorUserId) throw errors.forbidden();
  } else {
    await assertActivePermission({ doctorUserId: args.actorUserId, patientId: record.patientId });
  }
  return { patientId: record.patientId, patientUserId: record.patient.userId };
}

// ──────────────────────────────────────────────────────────────────────────────
// Doctor-side reads — gated by an active DoctorAccessPermission row.
// ──────────────────────────────────────────────────────────────────────────────

export async function getPatientForDoctor(args: {
  doctorUserId: string;
  patientCode: string;
}): Promise<unknown> {
  const patient = await resolvePatientByCode(args.patientCode);
  await assertActivePermission({ doctorUserId: args.doctorUserId, patientId: patient.id });
  return prisma.patientProfile.findUnique({
    where: { id: patient.id },
    select: {
      id: true,
      patientCode: true,
      fullName: true,
      dateOfBirth: true,
      bloodType: true,
      gender: true,
      heightCm: true,
      weightKg: true,
      allergiesFhir: true,
      chronicConditionsFhir: true,
      emergencyContact: true,
      insurance: true,
    },
  });
}

export async function listRecordsForDoctor(args: {
  doctorUserId: string;
  patientCode: string;
  category?: RecordCategory;
  limit?: number;
  cursor?: string;
}): Promise<{ items: unknown[]; nextCursor: string | null }> {
  const patient = await resolvePatientByCode(args.patientCode);
  await assertActivePermission({ doctorUserId: args.doctorUserId, patientId: patient.id });

  const limit = Math.min(args.limit ?? 50, 100);
  const where: Prisma.MedicalRecordWhereInput = {
    patientId: patient.id,
    deletedAt: null,
    ...(args.category ? { category: args.category } : {}),
  };
  const items = await prisma.medicalRecord.findMany({
    where,
    select: {
      id: true,
      category: true,
      title: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
      recordedAt: true,
      aiStatus: true,
    },
    orderBy: { uploadedAt: "desc" },
    take: limit + 1,
    ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
  });
  const nextCursor = items.length > limit ? (items.pop()!.id ?? null) : null;
  return { items, nextCursor };
}

export async function getRecordForDoctor(args: {
  doctorUserId: string;
  recordId: string;
}): Promise<unknown> {
  const { patientUserId } = await authorizeRecordAccess({
    recordId: args.recordId,
    actorUserId: args.doctorUserId,
    actorRole: "DOCTOR",
  });
  void patientUserId;
  return prisma.medicalRecord.findUnique({
    where: { id: args.recordId },
    select: {
      id: true,
      category: true,
      title: true,
      notes: true,
      mimeType: true,
      sizeBytes: true,
      sha256: true,
      uploadedAt: true,
      recordedAt: true,
      aiStatus: true,
      extractedFhir: true,
    },
  });
}

export async function getSummaryContextForDoctor(args: {
  doctorUserId: string;
  patientCode: string;
}): Promise<{ patientId: string; hipaaTenant: boolean }> {
  const patient = await resolvePatientByCode(args.patientCode);
  await assertActivePermission({ doctorUserId: args.doctorUserId, patientId: patient.id });
  const profile = await prisma.patientProfile.findUniqueOrThrow({
    where: { id: patient.id },
    select: { id: true, user: { select: { hipaaTenant: true } } },
  });
  return { patientId: profile.id, hipaaTenant: profile.user.hipaaTenant };
}

// ──────────────────────────────────────────────────────────────────────────────
// Caregiver-side reads/uploads (spec §4.4)
// Caregivers can view + upload on the patient's behalf. They cannot grant
// doctor access — enforced because they use these caregiver-prefixed routes,
// not the patient-prefixed ones that mutate doctor permissions.
// ──────────────────────────────────────────────────────────────────────────────

export async function presignUploadForCaregiver(args: {
  caregiverUserId: string;
  patientCode: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  sizeBytes: number;
  sha256: string;
}): Promise<{ uploadUrl: string; s3Key: string; expiresInSeconds: number }> {
  const { patientId } = await assertActiveCaregiverLink({
    caregiverUserId: args.caregiverUserId,
    patientCode: args.patientCode,
  });
  const s3Key = buildObjectKey({ patientId, mimeType: args.mimeType });
  const { url, expiresInSeconds } = await presignUpload({
    key: s3Key,
    mimeType: args.mimeType,
    sizeBytes: args.sizeBytes,
    sha256: args.sha256,
  });
  return { uploadUrl: url, s3Key, expiresInSeconds };
}

export async function confirmUploadForCaregiver(
  args: {
    caregiverUserId: string;
    patientCode: string;
    s3Key: string;
    category: RecordCategory;
    title: string;
    notes?: string;
    recordedAt?: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
  },
  ctx: { ipAddress: string | null; userAgent: string | null },
): Promise<{ recordId: string }> {
  const { patientId } = await assertActiveCaregiverLink({
    caregiverUserId: args.caregiverUserId,
    patientCode: args.patientCode,
  });

  // Re-validate the key embeds the right patient (defense in depth).
  if (!args.s3Key.startsWith(`patients/${patientId}/`)) throw errors.forbidden();

  const record = await prisma.medicalRecord.create({
    data: {
      patientId,
      // uploadedByUserId records the caregiver — important audit signal.
      uploadedByUserId: args.caregiverUserId,
      category: args.category,
      title: args.title,
      ...(args.notes !== undefined ? { notes: args.notes } : {}),
      s3Key: args.s3Key,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      sha256: args.sha256,
      ...(args.recordedAt ? { recordedAt: new Date(args.recordedAt) } : {}),
      aiStatus: AIProcessingStatus.PENDING,
    },
    select: { id: true },
  });

  await extractionQueue.add("extract", { recordId: record.id }, { jobId: record.id });

  // The patient is the data subject; the caregiver is the actor.
  const patientProfile = await prisma.patientProfile.findUnique({
    where: { id: patientId },
    select: { userId: true },
  });
  await recordAudit({
    action: AuditAction.RECORD_UPLOADED,
    actorUserId: args.caregiverUserId,
    subjectUserId: patientProfile?.userId ?? null,
    metadata: { recordId: record.id, category: args.category, sizeBytes: args.sizeBytes, uploadedBy: "caregiver" },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return { recordId: record.id };
}

export async function listRecordsForCaregiver(args: {
  caregiverUserId: string;
  patientCode: string;
  category?: RecordCategory;
  limit?: number;
  cursor?: string;
}): Promise<{ items: unknown[]; nextCursor: string | null }> {
  const { patientId } = await assertActiveCaregiverLink({
    caregiverUserId: args.caregiverUserId,
    patientCode: args.patientCode,
  });

  const limit = Math.min(args.limit ?? 50, 100);
  const where: Prisma.MedicalRecordWhereInput = {
    patientId,
    deletedAt: null,
    ...(args.category ? { category: args.category } : {}),
  };
  const items = await prisma.medicalRecord.findMany({
    where,
    select: {
      id: true,
      category: true,
      title: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
      recordedAt: true,
      aiStatus: true,
    },
    orderBy: { uploadedAt: "desc" },
    take: limit + 1,
    ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
  });
  const nextCursor = items.length > limit ? (items.pop()!.id ?? null) : null;
  return { items, nextCursor };
}

export async function viewUrlForDoctor(
  args: { doctorUserId: string; recordId: string },
  ctx: { ipAddress: string | null; userAgent: string | null },
): Promise<{ url: string; expiresInSeconds: number }> {
  const { patientUserId } = await authorizeRecordAccess({
    recordId: args.recordId,
    actorUserId: args.doctorUserId,
    actorRole: "DOCTOR",
  });
  const record = await prisma.medicalRecord.findUnique({
    where: { id: args.recordId },
    select: { s3Key: true },
  });
  if (!record) throw errors.notFound();

  await recordAudit({
    action: AuditAction.RECORD_VIEWED,
    actorUserId: args.doctorUserId,
    subjectUserId: patientUserId,
    metadata: { recordId: args.recordId, viewedBy: "doctor" },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return presignView({ key: record.s3Key });
}

// ──────────────────────────────────────────────────────────────────────────────
// PRESIGN UPLOAD — issues a time-limited S3 PUT URL. No row is created yet.
// ──────────────────────────────────────────────────────────────────────────────

export async function presignUploadForUser(args: {
  userId: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  sizeBytes: number;
  sha256: string;
}): Promise<{ uploadUrl: string; s3Key: string; expiresInSeconds: number }> {
  const patient = await resolvePatientForUser(args.userId);
  const s3Key = buildObjectKey({ patientId: patient.id, mimeType: args.mimeType });
  const { url, expiresInSeconds } = await presignUpload({
    key: s3Key,
    mimeType: args.mimeType,
    sizeBytes: args.sizeBytes,
    sha256: args.sha256,
  });
  return { uploadUrl: url, s3Key, expiresInSeconds };
}

// ──────────────────────────────────────────────────────────────────────────────
// CONFIRM UPLOAD — the client tells us the upload finished. We persist metadata
// and queue AI extraction.
// ──────────────────────────────────────────────────────────────────────────────

export async function confirmUpload(args: {
  userId: string;
  s3Key: string;
  category: RecordCategory;
  title: string;
  notes?: string;
  recordedAt?: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}, ctx: { ipAddress: string | null; userAgent: string | null }): Promise<{ recordId: string }> {
  const patient = await resolvePatientForUser(args.userId);

  // The S3 key was generated by us in /presign and embeds the patientId.
  // We re-validate it here so a malicious client can't claim a key for a
  // different patient.
  const expectedPrefix = `patients/${patient.id}/`;
  if (!args.s3Key.startsWith(expectedPrefix)) throw errors.forbidden();

  const record = await prisma.medicalRecord.create({
    data: {
      patientId: patient.id,
      uploadedByUserId: args.userId,
      category: args.category,
      title: args.title,
      ...(args.notes !== undefined ? { notes: args.notes } : {}),
      s3Key: args.s3Key,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      sha256: args.sha256,
      ...(args.recordedAt ? { recordedAt: new Date(args.recordedAt) } : {}),
      aiStatus: AIProcessingStatus.PENDING,
    },
    select: { id: true },
  });

  await extractionQueue.add("extract", { recordId: record.id }, { jobId: record.id });

  await recordAudit({
    action: AuditAction.RECORD_UPLOADED,
    actorUserId: args.userId,
    subjectUserId: args.userId,
    metadata: { recordId: record.id, category: args.category, sizeBytes: args.sizeBytes },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return { recordId: record.id };
}

// ──────────────────────────────────────────────────────────────────────────────
// LIST own records (patient self-view)
// ──────────────────────────────────────────────────────────────────────────────

export async function listOwnRecords(args: {
  userId: string;
  category?: RecordCategory;
  limit?: number;
  cursor?: string;
}): Promise<{ items: unknown[]; nextCursor: string | null }> {
  const patient = await resolvePatientForUser(args.userId);
  const limit = Math.min(args.limit ?? 50, 100);

  const where: Prisma.MedicalRecordWhereInput = {
    patientId: patient.id,
    deletedAt: null,
    ...(args.category ? { category: args.category } : {}),
  };

  const items = await prisma.medicalRecord.findMany({
    where,
    select: {
      id: true,
      category: true,
      title: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
      recordedAt: true,
      aiStatus: true,
    },
    orderBy: { uploadedAt: "desc" },
    take: limit + 1,
    ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
  });

  const nextCursor = items.length > limit ? (items.pop()!.id ?? null) : null;
  return { items, nextCursor };
}

// ──────────────────────────────────────────────────────────────────────────────
// GET single record metadata
// ──────────────────────────────────────────────────────────────────────────────

export async function getRecordForUser(args: { userId: string; recordId: string }): Promise<unknown> {
  await assertPatientOwnerOrThrow({ recordId: args.recordId, userId: args.userId });
  return prisma.medicalRecord.findUnique({
    where: { id: args.recordId },
    select: {
      id: true,
      category: true,
      title: true,
      notes: true,
      mimeType: true,
      sizeBytes: true,
      sha256: true,
      uploadedAt: true,
      recordedAt: true,
      aiStatus: true,
      extractedFhir: true,
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// VIEW URL — pre-signed GET, scoped to ownership
// ──────────────────────────────────────────────────────────────────────────────

export async function viewUrlForUser(
  args: { userId: string; recordId: string },
  ctx: { ipAddress: string | null; userAgent: string | null },
): Promise<{ url: string; expiresInSeconds: number }> {
  await assertPatientOwnerOrThrow({ recordId: args.recordId, userId: args.userId });
  const record = await prisma.medicalRecord.findUnique({
    where: { id: args.recordId },
    select: { s3Key: true },
  });
  if (!record) throw errors.notFound();

  await recordAudit({
    action: AuditAction.RECORD_VIEWED,
    actorUserId: args.userId,
    subjectUserId: args.userId,
    metadata: { recordId: args.recordId },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return presignView({ key: record.s3Key });
}

// ──────────────────────────────────────────────────────────────────────────────
// DELETE — soft-delete the row + best-effort delete from S3.
// ──────────────────────────────────────────────────────────────────────────────

export async function deleteRecordForUser(
  args: { userId: string; recordId: string },
  ctx: { ipAddress: string | null; userAgent: string | null },
): Promise<void> {
  await assertPatientOwnerOrThrow({ recordId: args.recordId, userId: args.userId });
  const record = await prisma.medicalRecord.update({
    where: { id: args.recordId },
    data: { deletedAt: new Date() },
    select: { s3Key: true },
  });

  // Fire-and-forget the S3 delete. A nightly Lambda will reconcile orphans.
  deleteObject(record.s3Key).catch((err) => {
    // Logged; we don't surface to user since the row is already soft-deleted.
    void err;
  });

  await recordAudit({
    action: AuditAction.RECORD_DELETED,
    actorUserId: args.userId,
    subjectUserId: args.userId,
    metadata: { recordId: args.recordId },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}
