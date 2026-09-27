import { prisma } from "../../lib/prisma.js";

// Shared patient-context loader used by both the summary and Q&A features.
// Lives in its own module so the two features stay in sync — if summary thinks
// a 36-year-old is on Lisinopril, Q&A must see the same shape.

export type PatientContext = {
  profile: {
    id: string;
    fullName: string;
    dateOfBirth: Date;
    bloodType: string | null;
    gender: string | null;
    allergiesFhir: unknown;
    chronicConditionsFhir: unknown;
    profileUpdatedAt: Date;
  };
  medications: Array<{
    id: string;
    name: string;
    medicationFhir: unknown;
    isActive: boolean;
    updatedAt: Date;
  }>;
  records: Array<{
    id: string;
    category: string;
    title: string;
    recordedAt: Date | null;
    uploadedAt: Date;
    extractedFhir: unknown;
    updatedAt: Date;
  }>;
};

const RECORD_LIMIT = 50; // cost guardrail — older records can be pulled via Q&A on demand

export async function loadPatientContext(patientId: string): Promise<PatientContext> {
  const profile = await prisma.patientProfile.findUniqueOrThrow({
    where: { id: patientId },
    select: {
      id: true,
      fullName: true,
      dateOfBirth: true,
      bloodType: true,
      gender: true,
      allergiesFhir: true,
      chronicConditionsFhir: true,
      updatedAt: true,
    },
  });
  const medications = await prisma.medication.findMany({
    where: { patientId, deletedAt: null },
    select: { id: true, name: true, medicationFhir: true, isActive: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  const records = await prisma.medicalRecord.findMany({
    where: { patientId, deletedAt: null },
    select: {
      id: true,
      category: true,
      title: true,
      recordedAt: true,
      uploadedAt: true,
      extractedFhir: true,
      updatedAt: true,
    },
    orderBy: { uploadedAt: "desc" },
    take: RECORD_LIMIT,
  });

  return {
    profile: { ...profile, profileUpdatedAt: profile.updatedAt },
    medications,
    records,
  };
}

// Strips identifying fields (full name, DOB) and keeps only what the model
// needs for clinical reasoning.
export function buildContextPayload(ctx: PatientContext): string {
  const ageYears = Math.floor(
    (Date.now() - ctx.profile.dateOfBirth.getTime()) / (1000 * 60 * 60 * 24 * 365.25),
  );
  return JSON.stringify(
    {
      patient: {
        ageYears,
        bloodType: ctx.profile.bloodType,
        gender: ctx.profile.gender,
        allergies: ctx.profile.allergiesFhir,
        chronicConditions: ctx.profile.chronicConditionsFhir,
      },
      activeMedications: ctx.medications
        .filter((m) => m.isActive)
        .map((m) => ({ name: m.name, details: m.medicationFhir })),
      records: ctx.records.map((r) => ({
        category: r.category,
        title: r.title,
        recordedAt: r.recordedAt?.toISOString() ?? r.uploadedAt.toISOString(),
        extracted: r.extractedFhir,
      })),
    },
    null,
    2,
  );
}
