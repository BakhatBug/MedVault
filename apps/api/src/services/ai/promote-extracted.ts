import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { refreshInteractions } from "./interactions.js";
import type { ExtractionResult, FhirMedicationRequest } from "@medivault/shared";

// ──────────────────────────────────────────────────────────────────────────────
// Auto-promote MedicationRequest entries from an extraction Bundle into the
// medications table. Runs after a successful AI extraction.
//
// Why: extracting MedicationRequest into extractedFhir but NOT creating
// `medications` rows means the user has to manually re-enter what we already
// know. Spec §4.2.3 specifically calls out: "AI automatically extracts
// medications from uploaded prescriptions".
//
// Dedup: we mark each created row with sourceRecordId so a re-extraction of
// the same record never creates duplicates. We also do a loose name+dosage
// match against the patient's existing ACTIVE meds — if the patient already
// added Lisinopril 10mg manually, we don't create a second row from the same
// drug appearing in an uploaded prescription.
// ──────────────────────────────────────────────────────────────────────────────

export async function promoteExtractedMedications(args: {
  recordId: string;
  patientId: string;
  uploadedByUserId: string;
  hipaaTenant: boolean;
  bundle: ExtractionResult;
}): Promise<{ created: number; skipped: number }> {
  // Pull MedicationRequest entries from the bundle.
  const medEntries = args.bundle.entry
    .map((e) => e.resource)
    .filter((r): r is FhirMedicationRequest => r.resourceType === "MedicationRequest");

  if (medEntries.length === 0) {
    return { created: 0, skipped: 0 };
  }

  // Load existing meds (active OR sourced from this exact record) for dedup.
  const existing = await prisma.medication.findMany({
    where: {
      patientId: args.patientId,
      deletedAt: null,
      OR: [{ isActive: true }, { sourceRecordId: args.recordId }],
    },
    select: { name: true, dosage: true, sourceRecordId: true },
  });
  const existingFingerprints = new Set(
    existing.map((m) => fingerprint(m.name, m.dosage ?? null)),
  );
  // If we already promoted from this record, skip entirely — idempotent re-run.
  if (existing.some((m) => m.sourceRecordId === args.recordId)) {
    logger.info({ recordId: args.recordId }, "[promote] record already promoted; skipping");
    return { created: 0, skipped: medEntries.length };
  }

  let created = 0;
  let skipped = 0;

  for (const med of medEntries) {
    const rawName = med.medicationCodeableConcept.text?.trim();
    if (!rawName) {
      skipped++;
      continue;
    }
    // Gemini often returns the dose inside the medicationCodeableConcept.text
    // (e.g. "Amlodipine 5 mg") while the dosageInstruction.text holds the
    // frequency ("take 1 tablet once daily"). Split intelligently.
    const fromName = extractDoseFromName(rawName);
    const instrText = med.dosageInstruction?.[0]?.text?.trim() ?? null;
    const name = fromName.name;
    let dosage: string | null = fromName.dosage;
    let frequency: string | null = null;
    if (instrText) {
      if (dosage) {
        // dose already known from the name; instrText is the schedule/frequency
        frequency = instrText;
      } else {
        // try to pull dose out of instrText; whatever's left is frequency
        const parsed = splitDosageText(instrText);
        if (parsed.dosage && /\b(mg|mcg|g|ml|iu|units?)\b/i.test(parsed.dosage)) {
          dosage = parsed.dosage;
          frequency = parsed.frequency;
        } else {
          frequency = instrText;
        }
      }
    }
    const startDate = med.authoredOn ? safeDate(med.authoredOn) : null;

    if (existingFingerprints.has(fingerprint(name, dosage))) {
      skipped++;
      continue;
    }

    await prisma.medication.create({
      data: {
        patientId: args.patientId,
        sourceRecordId: args.recordId,
        name,
        medicationFhir: med as unknown as Prisma.InputJsonValue,
        ...(dosage ? { dosage } : {}),
        ...(frequency ? { frequency } : {}),
        ...(startDate ? { startDate } : {}),
        isActive: true,
      },
    });
    existingFingerprints.add(fingerprint(name, dosage));
    created++;
  }

  logger.info(
    { recordId: args.recordId, patientId: args.patientId, created, skipped },
    "[promote] medications promoted from extraction",
  );

  // If we created any meds, refresh interactions. Fire-and-forget — failure
  // shouldn't fail the extraction. We use the patient's own userId as the
  // caller because the patient implicitly owns this action.
  if (created > 0) {
    const patient = await prisma.patientProfile.findUnique({
      where: { id: args.patientId },
      select: { userId: true },
    });
    if (patient) {
      refreshInteractions({
        patientId: args.patientId,
        callerUserId: patient.userId,
        hipaaTenant: args.hipaaTenant,
      }).catch((err) => {
        logger.warn({ err, patientId: args.patientId }, "[promote] post-extraction interaction check failed");
      });
    }
  }

  return { created, skipped };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function fingerprint(name: string, dosage: string | null): string {
  return `${name.toLowerCase().trim()}|${(dosage ?? "").toLowerCase().trim()}`;
}

// Pull a trailing dose token out of a medication name like "Amlodipine 5 mg".
// Returns the cleaned name and the dose if found.
const DOSE_TRAILING = /^(.+?)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?))$/i;
function extractDoseFromName(raw: string): { name: string; dosage: string | null } {
  const m = DOSE_TRAILING.exec(raw.trim());
  if (m) return { name: m[1]!.trim(), dosage: m[2]!.replace(/\s+/g, "") };
  return { name: raw.trim(), dosage: null };
}

// Split a free-form dosage string like "10mg once daily" into (dosage, freq).
// We split on the first whitespace after a unit token. If we can't, we put
// everything in dosage and leave frequency null — the user can clean it up.
function splitDosageText(text: string | null): { dosage: string | null; frequency: string | null } {
  if (!text) return { dosage: null, frequency: null };
  const trimmed = text.trim();
  const m = /^(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?|tabs?|caps?|drops?|puffs?))\b\s*(.*)$/i.exec(trimmed);
  if (m) {
    const dosage = m[1]!.trim();
    const frequency = (m[2] ?? "").trim() || null;
    return { dosage, frequency };
  }
  return { dosage: trimmed, frequency: null };
}

function safeDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}
