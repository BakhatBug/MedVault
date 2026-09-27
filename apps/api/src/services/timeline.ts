import { prisma } from "../lib/prisma.js";
import { assertActivePermission, resolvePatientByCode } from "./access.js";

// ──────────────────────────────────────────────────────────────────────────────
// Health timeline (spec §4.2.4)
//
// "A chronological feed of all health events — diagnoses, visits, lab results,
// medications. Filterable by date, category, or doctor."
//
// Implementation: live derivation, NOT a materialized table. We build the feed
// on demand from medical_records + medications + each record's extracted FHIR.
// This avoids sync bugs ("the timeline says I take X but medications says I
// don't") and keeps the schema simple. The HealthTimelineEvent table exists
// for future use if we need to manually insert events (e.g., user-added "visit"
// entries that aren't backed by a document).
//
// For 50 records and a few hundred FHIR resources per patient this is fast in
// memory. If a single patient ever has 10K+ records we'll revisit.
// ──────────────────────────────────────────────────────────────────────────────

export class TimelineError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
    this.name = "TimelineError";
  }
}

export type TimelineEventType =
  | "record_uploaded"
  | "diagnosis"
  | "lab_result"
  | "vaccination"
  | "allergy_recorded"
  | "medication_started"
  | "medication_discontinued";

export type TimelineEvent = {
  // Synthetic stable id — built from {source-table}:{source-id}:{event-type}.
  // Stable across requests, so a client can dedupe if it polls.
  id: string;
  type: TimelineEventType;
  occurredAt: string; // ISO-8601
  title: string;
  description?: string;
  linkedRecordId?: string;
  linkedMedicationId?: string;
  category?: string;
  payload?: Record<string, unknown>;
};

export type TimelineFilters = {
  from?: string;
  to?: string;
  types?: TimelineEventType[];
  limit?: number;
  offset?: number;
};

const ALL_TYPES: TimelineEventType[] = [
  "record_uploaded",
  "diagnosis",
  "lab_result",
  "vaccination",
  "allergy_recorded",
  "medication_started",
  "medication_discontinued",
];

// ──────────────────────────────────────────────────────────────────────────────
// Public entry points
// ──────────────────────────────────────────────────────────────────────────────

export async function getTimelineForPatient(args: {
  patientUserId: string;
  filters: TimelineFilters;
}): Promise<{ items: TimelineEvent[]; total: number; hasMore: boolean }> {
  const patient = await prisma.patientProfile.findUnique({
    where: { userId: args.patientUserId },
    select: { id: true },
  });
  if (!patient) throw new TimelineError("patient_not_found", 404, "Patient profile not found");
  return buildTimeline({ patientId: patient.id, filters: args.filters });
}

export async function getTimelineForDoctor(args: {
  doctorUserId: string;
  patientCode: string;
  filters: TimelineFilters;
}): Promise<{ items: TimelineEvent[]; total: number; hasMore: boolean }> {
  const patient = await resolvePatientByCode(args.patientCode);
  await assertActivePermission({ doctorUserId: args.doctorUserId, patientId: patient.id });
  return buildTimeline({ patientId: patient.id, filters: args.filters });
}

// ──────────────────────────────────────────────────────────────────────────────
// Derivation
// ──────────────────────────────────────────────────────────────────────────────

async function buildTimeline(args: {
  patientId: string;
  filters: TimelineFilters;
}): Promise<{ items: TimelineEvent[]; total: number; hasMore: boolean }> {
  const wantedTypes = new Set(args.filters.types?.length ? args.filters.types : ALL_TYPES);
  const fromTs = args.filters.from ? new Date(args.filters.from).getTime() : -Infinity;
  const toTs = args.filters.to ? new Date(args.filters.to).getTime() + 24 * 60 * 60 * 1000 : Infinity;

  const events: TimelineEvent[] = [];

  // 1. From medical records — one "record_uploaded" event + N events from extractedFhir.
  const records = await prisma.medicalRecord.findMany({
    where: { patientId: args.patientId, deletedAt: null },
    select: {
      id: true,
      category: true,
      title: true,
      recordedAt: true,
      uploadedAt: true,
      extractedFhir: true,
    },
  });

  for (const r of records) {
    const recordOccurredAt = r.recordedAt ?? r.uploadedAt;
    if (wantedTypes.has("record_uploaded")) {
      events.push({
        id: `rec:${r.id}:upload`,
        type: "record_uploaded",
        occurredAt: recordOccurredAt.toISOString(),
        title: r.title,
        description: `${r.category.replace(/_/g, " ").toLowerCase()} added to vault`,
        linkedRecordId: r.id,
        category: r.category,
      });
    }
    // Walk the FHIR bundle for resource-level events.
    eventsFromFhir(r.extractedFhir, r.id, recordOccurredAt, wantedTypes, events);
  }

  // 2. From medications — started + discontinued events.
  if (wantedTypes.has("medication_started") || wantedTypes.has("medication_discontinued")) {
    const meds = await prisma.medication.findMany({
      where: { patientId: args.patientId, deletedAt: null },
      select: { id: true, name: true, dosage: true, frequency: true, startDate: true, endDate: true, isActive: true, createdAt: true },
    });
    for (const m of meds) {
      if (wantedTypes.has("medication_started")) {
        const startedAt = m.startDate ?? m.createdAt;
        events.push({
          id: `med:${m.id}:start`,
          type: "medication_started",
          occurredAt: startedAt.toISOString(),
          title: `Started ${m.name}${m.dosage ? " " + m.dosage : ""}`,
          ...(m.frequency ? { description: m.frequency } : {}),
          linkedMedicationId: m.id,
        });
      }
      if (!m.isActive && m.endDate && wantedTypes.has("medication_discontinued")) {
        events.push({
          id: `med:${m.id}:stop`,
          type: "medication_discontinued",
          occurredAt: m.endDate.toISOString(),
          title: `Discontinued ${m.name}${m.dosage ? " " + m.dosage : ""}`,
          linkedMedicationId: m.id,
        });
      }
    }
  }

  // 3. Date-range + type filters were already applied above where cheap, but
  // record-derived events use recordOccurredAt for filtering and we let the
  // FHIR-derived ones through with their own dates — apply the filter once.
  const filtered = events.filter((e) => {
    const t = new Date(e.occurredAt).getTime();
    return t >= fromTs && t <= toTs;
  });

  // Newest first — the spec calls this a feed, and feeds are reverse-chrono.
  filtered.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const total = filtered.length;
  const offset = Math.max(args.filters.offset ?? 0, 0);
  const limit = Math.min(args.filters.limit ?? 50, 200);
  const page = filtered.slice(offset, offset + limit);
  return { items: page, total, hasMore: offset + limit < total };
}

// ──────────────────────────────────────────────────────────────────────────────
// FHIR walker — turns Bundle entries into events
// ──────────────────────────────────────────────────────────────────────────────

function eventsFromFhir(
  fhir: unknown,
  recordId: string,
  fallbackDate: Date,
  wanted: Set<TimelineEventType>,
  out: TimelineEvent[],
): void {
  if (!isObject(fhir)) return;
  const entry = (fhir as { entry?: unknown }).entry;
  if (!Array.isArray(entry)) return;

  for (let i = 0; i < entry.length; i++) {
    const e = entry[i];
    if (!isObject(e)) continue;
    const resource = (e as { resource?: unknown }).resource;
    if (!isObject(resource)) continue;
    const rtype = (resource as { resourceType?: unknown }).resourceType;
    if (typeof rtype !== "string") continue;

    if (rtype === "Condition" && wanted.has("diagnosis")) {
      const label = textOf((resource as { code?: unknown }).code);
      const when = pickDate(resource, ["onsetDateTime", "recordedDate"], fallbackDate);
      if (label) {
        out.push({
          id: `rec:${recordId}:cond:${i}`,
          type: "diagnosis",
          occurredAt: when.toISOString(),
          title: label,
          description: "Diagnosed",
          linkedRecordId: recordId,
        });
      }
    } else if (rtype === "Observation" && wanted.has("lab_result")) {
      const label = textOf((resource as { code?: unknown }).code);
      const when = pickDate(resource, ["effectiveDateTime"], fallbackDate);
      const valueQuantity = (resource as { valueQuantity?: { value?: number; unit?: string } }).valueQuantity;
      const valueString = (resource as { valueString?: unknown }).valueString;
      const valueStr = valueQuantity
        ? `${valueQuantity.value ?? "?"}${valueQuantity.unit ? " " + valueQuantity.unit : ""}`
        : typeof valueString === "string"
          ? valueString
          : null;
      if (label) {
        out.push({
          id: `rec:${recordId}:obs:${i}`,
          type: "lab_result",
          occurredAt: when.toISOString(),
          title: label,
          ...(valueStr ? { description: valueStr } : {}),
          linkedRecordId: recordId,
          ...(valueStr ? { payload: { value: valueStr } } : {}),
        });
      }
    } else if (rtype === "Immunization" && wanted.has("vaccination")) {
      const label = textOf((resource as { vaccineCode?: unknown }).vaccineCode);
      const when = pickDate(resource, ["occurrenceDateTime"], fallbackDate);
      if (label) {
        out.push({
          id: `rec:${recordId}:imm:${i}`,
          type: "vaccination",
          occurredAt: when.toISOString(),
          title: label,
          description: "Immunization administered",
          linkedRecordId: recordId,
        });
      }
    } else if (rtype === "AllergyIntolerance" && wanted.has("allergy_recorded")) {
      const label = textOf((resource as { code?: unknown }).code);
      const when = pickDate(resource, ["recordedDate"], fallbackDate);
      if (label) {
        out.push({
          id: `rec:${recordId}:allergy:${i}`,
          type: "allergy_recorded",
          occurredAt: when.toISOString(),
          title: `Allergy: ${label}`,
          description: "Documented in record",
          linkedRecordId: recordId,
        });
      }
    }
    // MedicationRequest in extractedFhir is intentionally NOT turned into a
    // medication_started event here — we already create such events from the
    // medications table (which is populated by promoteExtractedMedications),
    // so doing both would double-emit on auto-promoted prescriptions.
  }
}

function textOf(v: unknown): string | null {
  if (!isObject(v)) return null;
  const t = (v as { text?: unknown }).text;
  if (typeof t === "string" && t.trim()) return t.trim();
  // Fallback: coding[0].display
  const coding = (v as { coding?: unknown }).coding;
  if (Array.isArray(coding) && isObject(coding[0])) {
    const disp = (coding[0] as { display?: unknown }).display;
    if (typeof disp === "string" && disp.trim()) return disp.trim();
  }
  return null;
}

function pickDate(resource: unknown, keys: string[], fallback: Date): Date {
  for (const k of keys) {
    const raw = (resource as Record<string, unknown>)[k];
    if (typeof raw === "string") {
      const d = new Date(raw);
      if (Number.isFinite(d.getTime())) return d;
    }
  }
  return fallback;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
