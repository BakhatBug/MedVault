import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "./helpers/test-app.js";
import { bearer, login, registerAndActivatePatient } from "./helpers/factories.js";
import { testPrisma } from "./setup.js";
import { promoteExtractedMedications } from "../src/services/ai/promote-extracted.js";
import type { ExtractionResult } from "@medivault/shared";

// Don't let the post-promote interaction check fire — it would spawn a
// background AI call and (because our test cleanup truncates between tests)
// leak a foreign-key error from the queued upsert.
vi.mock("../src/services/ai/interactions.js", () => ({
  refreshInteractions: vi.fn().mockResolvedValue({
    bundle: null,
    generatedAt: new Date(),
    modelId: "mock",
    medicationsHash: "x",
    medications: [],
    interactions: [],
    cached: false,
  }),
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

const SHA256_HEX = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

async function seedRecord(): Promise<{ recordId: string; patientId: string; uploaderId: string }> {
  const patient = await registerAndActivatePatient(app);
  const { accessToken } = await login(app, patient.email, patient.password);
  const headers = bearer(accessToken);

  const presign = await app.inject({
    method: "POST",
    url: "/v1/records/presign",
    headers,
    payload: { mimeType: "application/pdf", sizeBytes: 1024, sha256: SHA256_HEX },
  });
  const { s3Key } = presign.json() as { s3Key: string };
  const confirm = await app.inject({
    method: "POST",
    url: "/v1/records/confirm",
    headers,
    payload: {
      s3Key,
      category: "PRESCRIPTION",
      title: "Test Rx",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      sha256: SHA256_HEX,
    },
  });
  const recordId = (confirm.json() as { recordId: string }).recordId;
  const profile = await testPrisma.patientProfile.findUniqueOrThrow({
    where: { userId: patient.userId },
    select: { id: true },
  });
  return { recordId, patientId: profile.id, uploaderId: patient.userId };
}

function bundle(...meds: Array<{ text: string; instr?: string; date?: string }>): ExtractionResult {
  return {
    resourceType: "Bundle",
    type: "collection",
    meta: { extractedAt: new Date().toISOString(), modelId: "test", sourceRecordId: "test" },
    entry: meds.map((m) => ({
      resource: {
        resourceType: "MedicationRequest",
        status: "active" as const,
        intent: "plan" as const,
        medicationCodeableConcept: { text: m.text },
        ...(m.instr ? { dosageInstruction: [{ text: m.instr }] } : {}),
        ...(m.date ? { authoredOn: m.date } : {}),
      },
    })),
  };
}

describe("promoteExtractedMedications", () => {
  it("creates medication rows for each MedicationRequest entry", async () => {
    const { recordId, patientId, uploaderId } = await seedRecord();

    const result = await promoteExtractedMedications({
      recordId,
      patientId,
      uploadedByUserId: uploaderId,
      hipaaTenant: false,
      bundle: bundle(
        { text: "Lisinopril 10 mg", instr: "take 1 tablet once daily", date: "2026-04-12" },
        { text: "Metformin 500 mg", instr: "take 1 tablet twice daily" },
      ),
    });

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);

    const rows = await testPrisma.medication.findMany({
      where: { patientId, sourceRecordId: recordId },
      orderBy: { name: "asc" },
    });
    expect(rows.map((r) => r.name)).toEqual(["Lisinopril", "Metformin"]);
    expect(rows[0]?.dosage).toBe("10mg");
    expect(rows[0]?.frequency).toBe("take 1 tablet once daily");
    expect(rows[0]?.startDate?.toISOString()).toMatch(/^2026-04-12/);
  });

  it("dedups by name+dosage fingerprint against existing active meds", async () => {
    const { recordId, patientId, uploaderId } = await seedRecord();

    // Pre-create a Lisinopril 10mg row (as if patient added it manually)
    await testPrisma.medication.create({
      data: {
        patientId,
        name: "Lisinopril",
        medicationFhir: { resourceType: "MedicationRequest", medicationCodeableConcept: { text: "Lisinopril" } },
        dosage: "10mg",
        isActive: true,
      },
    });

    const result = await promoteExtractedMedications({
      recordId,
      patientId,
      uploadedByUserId: uploaderId,
      hipaaTenant: false,
      bundle: bundle(
        { text: "Lisinopril 10 mg", instr: "once daily" }, // duplicate → skipped
        { text: "Atorvastatin 40 mg", instr: "at bedtime" }, // new → created
      ),
    });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    const rows = await testPrisma.medication.findMany({
      where: { patientId, deletedAt: null },
      orderBy: { name: "asc" },
    });
    expect(rows.map((r) => r.name)).toEqual(["Atorvastatin", "Lisinopril"]);
  });

  it("is idempotent: re-running promotion for the same record skips everything", async () => {
    const { recordId, patientId, uploaderId } = await seedRecord();
    const meds = bundle({ text: "Amlodipine 5 mg", instr: "once daily" });

    const first = await promoteExtractedMedications({
      recordId,
      patientId,
      uploadedByUserId: uploaderId,
      hipaaTenant: false,
      bundle: meds,
    });
    expect(first.created).toBe(1);

    const second = await promoteExtractedMedications({
      recordId,
      patientId,
      uploadedByUserId: uploaderId,
      hipaaTenant: false,
      bundle: meds,
    });
    // sourceRecordId already present → bulk skip; promote returns total entries as skipped
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(1);
  });

  it("returns 0 for a bundle with no MedicationRequest entries", async () => {
    const { recordId, patientId, uploaderId } = await seedRecord();
    const result = await promoteExtractedMedications({
      recordId,
      patientId,
      uploadedByUserId: uploaderId,
      hipaaTenant: false,
      bundle: { resourceType: "Bundle", type: "collection", meta: { extractedAt: "", modelId: "", sourceRecordId: "" }, entry: [] },
    });
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("skips entries with no medication name", async () => {
    const { recordId, patientId, uploaderId } = await seedRecord();
    const result = await promoteExtractedMedications({
      recordId,
      patientId,
      uploadedByUserId: uploaderId,
      hipaaTenant: false,
      bundle: {
        resourceType: "Bundle",
        type: "collection",
        meta: { extractedAt: "", modelId: "", sourceRecordId: "" },
        entry: [
          {
            resource: {
              resourceType: "MedicationRequest",
              status: "active",
              intent: "plan",
              medicationCodeableConcept: { text: "" },
            },
          },
        ],
      },
    });
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
