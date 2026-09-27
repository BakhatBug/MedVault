import { AuditAction, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { recordAudit } from "../lib/audit.js";
import { logger } from "../lib/logger.js";
import { assertActivePermission, resolvePatientByCode } from "./access.js";
import { refreshInteractions } from "./ai/interactions.js";

// ──────────────────────────────────────────────────────────────────────────────
// Medications CRUD (spec §4.2.3)
//
// Distinctions:
//   - DELETE = soft-delete (deletedAt). Used when the row was created in error.
//   - DISCONTINUE = clinical event. Sets isActive=false + endDate=now. Stays in
//     history so doctors can see "was on Lisinopril 2025-2026".
// ──────────────────────────────────────────────────────────────────────────────

export class MedicationError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
    this.name = "MedicationError";
  }
}

const errors = {
  notFound: () => new MedicationError("medication_not_found", 404, "Medication not found"),
  forbidden: () => new MedicationError("forbidden", 403, "Not allowed to access this medication"),
  patientNotFound: () => new MedicationError("patient_not_found", 404, "Patient profile not found"),
  badState: (msg: string) => new MedicationError("bad_state", 409, msg),
};

export type RequestContext = { ipAddress: string | null; userAgent: string | null };

// ──────────────────────────────────────────────────────────────────────────────
// Patient ownership helpers
// ──────────────────────────────────────────────────────────────────────────────

async function resolvePatient(userId: string): Promise<{ id: string; hipaaTenant: boolean }> {
  const p = await prisma.patientProfile.findUnique({
    where: { userId },
    select: { id: true, user: { select: { hipaaTenant: true } } },
  });
  if (!p) throw errors.patientNotFound();
  return { id: p.id, hipaaTenant: p.user.hipaaTenant };
}

// Fire-and-forget drug interaction refresh. The CRUD response returns
// immediately; the check writes to drug_interaction_checks asynchronously.
// Failures are logged, not surfaced — interactions are advisory, not blocking.
function fireInteractionCheck(args: { patientId: string; callerUserId: string; hipaaTenant: boolean }): void {
  refreshInteractions(args).catch((err) => {
    logger.warn({ err, patientId: args.patientId }, "background drug interaction check failed");
  });
}

async function loadOwnMedicationOrThrow(args: { medicationId: string; patientUserId: string }) {
  const med = await prisma.medication.findUnique({
    where: { id: args.medicationId },
    select: {
      id: true,
      patientId: true,
      isActive: true,
      deletedAt: true,
      patient: { select: { userId: true } },
    },
  });
  if (!med || med.deletedAt) throw errors.notFound();
  if (med.patient.userId !== args.patientUserId) throw errors.forbidden();
  return med;
}

// ──────────────────────────────────────────────────────────────────────────────
// Reusable medication shape returned to clients
// ──────────────────────────────────────────────────────────────────────────────

const PUBLIC_MEDICATION_SELECT = {
  id: true,
  name: true,
  medicationFhir: true,
  dosage: true,
  frequency: true,
  startDate: true,
  endDate: true,
  prescribingDoctor: true,
  reminderEnabled: true,
  reminderSchedule: true,
  isActive: true,
  sourceRecordId: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// CREATE
// ──────────────────────────────────────────────────────────────────────────────

export type AddMedicationInput = {
  name: string;
  dosage?: string;
  frequency?: string;
  startDate?: string;
  prescribingDoctor?: string;
  reminderEnabled?: boolean;
  reminderSchedule?: unknown;
};

export async function addMedication(
  args: { patientUserId: string } & AddMedicationInput,
  ctx: RequestContext,
): Promise<{ id: string }> {
  const patientResolved = await resolvePatient(args.patientUserId);
  const patient = { id: patientResolved.id };

  // Persist a minimal FHIR MedicationRequest alongside the relational fields,
  // so a future move to a real FHIR server (Medplum/HAPI) is a data copy, not
  // a re-extraction. We do NOT fabricate RxNorm codes — only the text label.
  const medicationFhir = {
    resourceType: "MedicationRequest",
    status: "active",
    intent: "plan",
    medicationCodeableConcept: { text: args.name },
    ...(args.dosage || args.frequency
      ? {
          dosageInstruction: [
            {
              text: [args.dosage, args.frequency].filter(Boolean).join(" "),
            },
          ],
        }
      : {}),
    ...(args.startDate ? { authoredOn: args.startDate } : {}),
  };

  const created = await prisma.medication.create({
    data: {
      patientId: patient.id,
      name: args.name,
      medicationFhir: medicationFhir as unknown as Prisma.InputJsonValue,
      ...(args.dosage !== undefined ? { dosage: args.dosage } : {}),
      ...(args.frequency !== undefined ? { frequency: args.frequency } : {}),
      ...(args.startDate ? { startDate: new Date(args.startDate) } : {}),
      ...(args.prescribingDoctor !== undefined ? { prescribingDoctor: args.prescribingDoctor } : {}),
      ...(args.reminderEnabled !== undefined ? { reminderEnabled: args.reminderEnabled } : {}),
      ...(args.reminderSchedule !== undefined
        ? { reminderSchedule: args.reminderSchedule as Prisma.InputJsonValue }
        : {}),
      isActive: true,
    },
    select: { id: true },
  });

  await recordAudit({
    action: AuditAction.MEDICATION_ADDED,
    actorUserId: args.patientUserId,
    subjectUserId: args.patientUserId,
    metadata: { medicationId: created.id, name: args.name },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  // Spec §8.4 — run interaction check on every medication change.
  fireInteractionCheck({
    patientId: patient.id,
    callerUserId: args.patientUserId,
    hipaaTenant: patientResolved.hipaaTenant,
  });

  return created;
}

// ──────────────────────────────────────────────────────────────────────────────
// LIST
// ──────────────────────────────────────────────────────────────────────────────

export type ListMedicationsArgs = {
  patientUserId: string;
  includeInactive?: boolean;
  limit?: number;
  cursor?: string;
};

export async function listOwnMedications(args: ListMedicationsArgs): Promise<{ items: unknown[]; nextCursor: string | null }> {
  const patient = await resolvePatient(args.patientUserId);
  return listForPatient({ patientId: patient.id, ...args });
}

export async function listMedicationsForDoctor(args: {
  doctorUserId: string;
  patientCode: string;
  includeInactive?: boolean;
  limit?: number;
  cursor?: string;
}): Promise<{ items: unknown[]; nextCursor: string | null }> {
  const patient = await resolvePatientByCode(args.patientCode);
  await assertActivePermission({ doctorUserId: args.doctorUserId, patientId: patient.id });
  return listForPatient({ patientId: patient.id, ...args });
}

async function listForPatient(args: {
  patientId: string;
  includeInactive?: boolean;
  limit?: number;
  cursor?: string;
}): Promise<{ items: unknown[]; nextCursor: string | null }> {
  const limit = Math.min(args.limit ?? 50, 100);
  const where: Prisma.MedicationWhereInput = {
    patientId: args.patientId,
    deletedAt: null,
    ...(args.includeInactive ? {} : { isActive: true }),
  };

  const items = await prisma.medication.findMany({
    where,
    select: PUBLIC_MEDICATION_SELECT,
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    take: limit + 1,
    ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
  });

  const nextCursor = items.length > limit ? (items.pop()!.id ?? null) : null;
  return { items, nextCursor };
}

// ──────────────────────────────────────────────────────────────────────────────
// GET single
// ──────────────────────────────────────────────────────────────────────────────

export async function getOwnMedication(args: { patientUserId: string; medicationId: string }): Promise<unknown> {
  await loadOwnMedicationOrThrow({ medicationId: args.medicationId, patientUserId: args.patientUserId });
  return prisma.medication.findUnique({
    where: { id: args.medicationId },
    select: PUBLIC_MEDICATION_SELECT,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// UPDATE
// ──────────────────────────────────────────────────────────────────────────────

export type UpdateMedicationInput = Partial<
  Pick<
    AddMedicationInput,
    "dosage" | "frequency" | "startDate" | "prescribingDoctor" | "reminderEnabled" | "reminderSchedule"
  >
> & { name?: string };

export async function updateMedication(
  args: { patientUserId: string; medicationId: string; patch: UpdateMedicationInput },
  ctx: RequestContext,
): Promise<unknown> {
  const existing = await loadOwnMedicationOrThrow({
    medicationId: args.medicationId,
    patientUserId: args.patientUserId,
  });
  if (!existing.isActive) throw errors.badState("Discontinued medications cannot be edited; remove and re-add instead");

  const data: Prisma.MedicationUpdateInput = {};
  if (args.patch.name !== undefined) data.name = args.patch.name;
  if (args.patch.dosage !== undefined) data.dosage = args.patch.dosage;
  if (args.patch.frequency !== undefined) data.frequency = args.patch.frequency;
  if (args.patch.startDate !== undefined) data.startDate = new Date(args.patch.startDate);
  if (args.patch.prescribingDoctor !== undefined) data.prescribingDoctor = args.patch.prescribingDoctor;
  if (args.patch.reminderEnabled !== undefined) data.reminderEnabled = args.patch.reminderEnabled;
  if (args.patch.reminderSchedule !== undefined)
    data.reminderSchedule = args.patch.reminderSchedule as Prisma.InputJsonValue;

  const updated = await prisma.medication.update({
    where: { id: args.medicationId },
    data,
    select: PUBLIC_MEDICATION_SELECT,
  });

  await recordAudit({
    action: AuditAction.MEDICATION_UPDATED,
    actorUserId: args.patientUserId,
    subjectUserId: args.patientUserId,
    metadata: { medicationId: args.medicationId, fields: Object.keys(args.patch) },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  // Re-run interaction check if any clinically meaningful field changed.
  const clinicalChange =
    args.patch.name !== undefined ||
    args.patch.dosage !== undefined ||
    args.patch.frequency !== undefined;
  if (clinicalChange) {
    const patient = await resolvePatient(args.patientUserId);
    fireInteractionCheck({
      patientId: patient.id,
      callerUserId: args.patientUserId,
      hipaaTenant: patient.hipaaTenant,
    });
  }

  return updated;
}

// ──────────────────────────────────────────────────────────────────────────────
// DISCONTINUE — clinical event, preserves history
// ──────────────────────────────────────────────────────────────────────────────

export async function discontinueMedication(
  args: { patientUserId: string; medicationId: string; endDate?: string; reason?: string },
  ctx: RequestContext,
): Promise<void> {
  const existing = await loadOwnMedicationOrThrow({
    medicationId: args.medicationId,
    patientUserId: args.patientUserId,
  });
  if (!existing.isActive) throw errors.badState("Medication is already discontinued");

  await prisma.medication.update({
    where: { id: args.medicationId },
    data: {
      isActive: false,
      endDate: args.endDate ? new Date(args.endDate) : new Date(),
    },
  });

  await recordAudit({
    action: AuditAction.MEDICATION_DISCONTINUED,
    actorUserId: args.patientUserId,
    subjectUserId: args.patientUserId,
    metadata: { medicationId: args.medicationId, ...(args.reason ? { reason: args.reason } : {}) },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  const patient = await resolvePatient(args.patientUserId);
  fireInteractionCheck({
    patientId: patient.id,
    callerUserId: args.patientUserId,
    hipaaTenant: patient.hipaaTenant,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// DELETE — soft, used to fix typos / wrong entries
// ──────────────────────────────────────────────────────────────────────────────

export async function deleteMedication(
  args: { patientUserId: string; medicationId: string },
  ctx: RequestContext,
): Promise<void> {
  await loadOwnMedicationOrThrow({ medicationId: args.medicationId, patientUserId: args.patientUserId });
  await prisma.medication.update({
    where: { id: args.medicationId },
    data: { deletedAt: new Date(), isActive: false },
  });

  await recordAudit({
    action: AuditAction.MEDICATION_DELETED,
    actorUserId: args.patientUserId,
    subjectUserId: args.patientUserId,
    metadata: { medicationId: args.medicationId },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  const patient = await resolvePatient(args.patientUserId);
  fireInteractionCheck({
    patientId: patient.id,
    callerUserId: args.patientUserId,
    hipaaTenant: patient.hipaaTenant,
  });
}
