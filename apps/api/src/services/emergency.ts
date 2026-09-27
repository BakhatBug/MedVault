import { AuditAction, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { recordAudit } from "../lib/audit.js";

// ──────────────────────────────────────────────────────────────────────────────
// Emergency QR view (spec §4.2.6)
//
// Public, unauthenticated endpoint. Returns ONLY the patient-disclosed subset
// of critical info. The patient controls which fields are visible via
// patient_profiles.emergency_disclosure.
//
// Threat model:
//   - Enumeration: patient codes follow MVK-YYYY-NNNNN. A scraper could try to
//     enumerate codes. Mitigations: tight per-IP rate limit at the route layer,
//     identical 404 response for "not found" vs "no disclosure", IP+UA logged.
//   - PHI scraping: even disclosed fields are intentionally minimal. We never
//     return raw documents or detailed history.
// ──────────────────────────────────────────────────────────────────────────────

export class EmergencyError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
    this.name = "EmergencyError";
  }
}

const notFound = () => new EmergencyError("not_found", 404, "Emergency profile not available");

const DISCLAIMER =
  "Emergency view — patient-disclosed critical information only. Verify against the patient or formal records when possible.";

export type EmergencyDisclosure = {
  bloodType: boolean;
  allergies: boolean;
  currentMedications: boolean;
  emergencyContact: boolean;
};

const DEFAULT_DISCLOSURE: EmergencyDisclosure = {
  bloodType: true,
  allergies: true,
  currentMedications: true,
  emergencyContact: true,
};

// ──────────────────────────────────────────────────────────────────────────────
// Public view — used by the QR endpoint
// ──────────────────────────────────────────────────────────────────────────────

export async function getEmergencyView(
  args: { patientCode: string },
  ctx: { ipAddress: string | null; userAgent: string | null },
): Promise<unknown> {
  const patient = await prisma.patientProfile.findUnique({
    where: { patientCode: args.patientCode },
    select: {
      id: true,
      userId: true,
      patientCode: true,
      fullName: true,
      dateOfBirth: true,
      bloodType: true,
      allergiesFhir: true,
      emergencyContact: true,
      emergencyDisclosure: true,
      updatedAt: true,
      user: { select: { status: true, deletedAt: true } },
    },
  });

  // Return identical 404 for "doesn't exist" and "exists but deactivated" so a
  // scraper can't distinguish.
  if (!patient || patient.user.status !== "ACTIVE" || patient.user.deletedAt) {
    throw notFound();
  }

  const disclosure = parseDisclosure(patient.emergencyDisclosure);

  // Active meds — only the names + dosage strings. Skip anything the AI hasn't
  // already condensed to a short label.
  const meds = disclosure.currentMedications
    ? await prisma.medication.findMany({
        where: { patientId: patient.id, isActive: true, deletedAt: null },
        select: { name: true, dosage: true, frequency: true },
        orderBy: { updatedAt: "desc" },
        take: 20,
      })
    : null;

  await recordAudit({
    action: AuditAction.EMERGENCY_VIEW,
    actorUserId: null, // unauthenticated public endpoint
    subjectUserId: patient.userId,
    metadata: {
      patientCode: patient.patientCode,
      disclosure,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return {
    patientCode: patient.patientCode,
    // First name + last initial only. Paramedic can sanity-check the scan
    // target without us leaking a full identity.
    name: shortenName(patient.fullName),
    ageYears: computeAge(patient.dateOfBirth),
    bloodType: disclosure.bloodType ? patient.bloodType : null,
    allergies: disclosure.allergies ? summarizeAllergies(patient.allergiesFhir) : null,
    currentMedications: disclosure.currentMedications
      ? (meds ?? []).map((m) => formatMed(m))
      : null,
    emergencyContact: disclosure.emergencyContact ? patient.emergencyContact : null,
    lastUpdated: patient.updatedAt.toISOString(),
    viewedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Patient-controlled disclosure preferences
// ──────────────────────────────────────────────────────────────────────────────

export async function updateDisclosure(
  args: { patientUserId: string; patch: Partial<EmergencyDisclosure> },
  ctx: { ipAddress: string | null; userAgent: string | null },
): Promise<EmergencyDisclosure> {
  const profile = await prisma.patientProfile.findUnique({
    where: { userId: args.patientUserId },
    select: { id: true, emergencyDisclosure: true },
  });
  if (!profile) throw new EmergencyError("patient_not_found", 404, "Patient profile not found");

  const current = parseDisclosure(profile.emergencyDisclosure);
  const next: EmergencyDisclosure = {
    bloodType: args.patch.bloodType ?? current.bloodType,
    allergies: args.patch.allergies ?? current.allergies,
    currentMedications: args.patch.currentMedications ?? current.currentMedications,
    emergencyContact: args.patch.emergencyContact ?? current.emergencyContact,
  };

  await prisma.patientProfile.update({
    where: { id: profile.id },
    data: { emergencyDisclosure: next as unknown as Prisma.InputJsonValue },
  });

  await recordAudit({
    action: AuditAction.EMERGENCY_DISCLOSURE_UPDATED,
    actorUserId: args.patientUserId,
    subjectUserId: args.patientUserId,
    metadata: { previous: current, next },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return next;
}

export async function getDisclosure(patientUserId: string): Promise<EmergencyDisclosure> {
  const profile = await prisma.patientProfile.findUnique({
    where: { userId: patientUserId },
    select: { emergencyDisclosure: true },
  });
  if (!profile) throw new EmergencyError("patient_not_found", 404, "Patient profile not found");
  return parseDisclosure(profile.emergencyDisclosure);
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function parseDisclosure(raw: unknown): EmergencyDisclosure {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_DISCLOSURE };
  const r = raw as Record<string, unknown>;
  return {
    bloodType: typeof r.bloodType === "boolean" ? r.bloodType : DEFAULT_DISCLOSURE.bloodType,
    allergies: typeof r.allergies === "boolean" ? r.allergies : DEFAULT_DISCLOSURE.allergies,
    currentMedications:
      typeof r.currentMedications === "boolean" ? r.currentMedications : DEFAULT_DISCLOSURE.currentMedications,
    emergencyContact:
      typeof r.emergencyContact === "boolean" ? r.emergencyContact : DEFAULT_DISCLOSURE.emergencyContact,
  };
}

function shortenName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!;
  const first = parts[0]!;
  const lastInitial = parts[parts.length - 1]!.charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}

function computeAge(dob: Date): number {
  return Math.floor((Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

function summarizeAllergies(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) return null;
      const e = entry as Record<string, unknown>;
      const code = e.code as { text?: string } | undefined;
      const text = code?.text ?? null;
      if (!text) return null;
      const reaction = (e.reaction as Array<{ manifestation?: Array<{ text?: string }> }> | undefined)?.[0]
        ?.manifestation?.[0]?.text;
      return reaction ? `${text} (${reaction})` : text;
    })
    .filter((v): v is string => typeof v === "string");
}

function formatMed(m: { name: string; dosage: string | null; frequency: string | null }): string {
  const parts = [m.name, m.dosage, m.frequency].filter((p): p is string => !!p);
  return parts.join(" ");
}
