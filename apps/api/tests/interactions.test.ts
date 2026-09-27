import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "./helpers/test-app.js";
import { registerAndActivatePatient } from "./helpers/factories.js";
import { testPrisma } from "./setup.js";
import { geminiProvider } from "../src/services/ai/gemini.js";
import { getCachedInteractions, refreshInteractions } from "../src/services/ai/interactions.js";

// Direct service-level tests for the drug-interaction checker. The HTTP layer
// is exercised by other tests; here we isolate the cache/dedup/parsing logic.

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

async function newPatientWithMeds(meds: Array<{ name: string; dosage?: string }>) {
  const patient = await registerAndActivatePatient(app);
  const profile = await testPrisma.patientProfile.findUniqueOrThrow({
    where: { userId: patient.userId },
    select: { id: true },
  });
  for (const m of meds) {
    await testPrisma.medication.create({
      data: {
        patientId: profile.id,
        name: m.name,
        medicationFhir: { resourceType: "MedicationRequest", medicationCodeableConcept: { text: m.name } },
        dosage: m.dosage ?? null,
        isActive: true,
      },
    });
  }
  return { ...patient, patientId: profile.id };
}

describe("drug interaction checker (service-level)", () => {
  it("calls the model on first run and caches the result; second run is a cache hit", async () => {
    vi.mocked(geminiProvider.call).mockResolvedValue({
      text: JSON.stringify({
        interactions: [
          {
            medications: ["Lisinopril", "Spironolactone"],
            severity: "major",
            description: "Increased risk of hyperkalemia.",
          },
        ],
      }),
      inputTokens: 300,
      outputTokens: 80,
      modelId: "gemini-2.5-flash",
      provider: "gemini",
    });

    const callsBefore = vi.mocked(geminiProvider.call).mock.calls.length;
    const { userId, patientId } = await newPatientWithMeds([
      { name: "Lisinopril", dosage: "10mg" },
      { name: "Spironolactone", dosage: "25mg" },
    ]);

    const first = await refreshInteractions({ patientId, callerUserId: userId, hipaaTenant: false });
    expect(first.cached).toBe(false);
    expect(first.interactions).toHaveLength(1);
    expect(first.interactions[0]?.severity).toBe("major");
    const callsAfterFirst = vi.mocked(geminiProvider.call).mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(callsBefore);

    const second = await refreshInteractions({ patientId, callerUserId: userId, hipaaTenant: false });
    expect(second.cached).toBe(true);
    expect(second.interactions).toHaveLength(1);
    expect(vi.mocked(geminiProvider.call).mock.calls.length).toBe(callsAfterFirst); // no new call
  });

  it("rejects fabricated drug names that aren't in the patient's active meds", async () => {
    vi.mocked(geminiProvider.call).mockResolvedValue({
      text: JSON.stringify({
        interactions: [
          {
            medications: ["Lisinopril", "ImaginaryDrugX"],
            severity: "major",
            description: "Fake interaction.",
          },
        ],
      }),
      inputTokens: 50,
      outputTokens: 50,
      modelId: "gemini-2.5-flash",
      provider: "gemini",
    });

    const { userId, patientId } = await newPatientWithMeds([
      { name: "Lisinopril", dosage: "10mg" },
      { name: "Metformin", dosage: "500mg" },
    ]);
    const result = await refreshInteractions({ patientId, callerUserId: userId, hipaaTenant: false });
    expect(result.interactions).toEqual([]); // fabricated entry was dropped
  });

  it("with fewer than 2 active meds, skips the model and writes an empty cached row", async () => {
    const callsBefore = vi.mocked(geminiProvider.call).mock.calls.length;
    const { userId, patientId } = await newPatientWithMeds([{ name: "Solo", dosage: "5mg" }]);

    const result = await refreshInteractions({ patientId, callerUserId: userId, hipaaTenant: false });
    expect(result.interactions).toEqual([]);
    expect(result.modelId).toBe("skipped-too-few-meds");
    expect(vi.mocked(geminiProvider.call).mock.calls.length).toBe(callsBefore);

    // Subsequent reads see the cached entry without calling the model.
    const cached = await getCachedInteractions(patientId);
    expect(cached).not.toBeNull();
    expect(cached?.cached).toBe(true);
    expect(vi.mocked(geminiProvider.call).mock.calls.length).toBe(callsBefore);
  });

  it("non-JSON model output is treated as an empty interaction list (graceful)", async () => {
    vi.mocked(geminiProvider.call).mockResolvedValue({
      text: "I don't know what to say.",
      inputTokens: 30,
      outputTokens: 10,
      modelId: "gemini-2.5-flash",
      provider: "gemini",
    });
    const { userId, patientId } = await newPatientWithMeds([
      { name: "DrugA", dosage: "10mg" },
      { name: "DrugB", dosage: "20mg" },
    ]);
    const result = await refreshInteractions({ patientId, callerUserId: userId, hipaaTenant: false });
    expect(result.interactions).toEqual([]);
  });

  it("ai_call_logs row is written for each model call", async () => {
    vi.mocked(geminiProvider.call).mockResolvedValue({
      text: JSON.stringify({ interactions: [] }),
      inputTokens: 100,
      outputTokens: 50,
      modelId: "gemini-2.5-flash",
      provider: "gemini",
    });
    const { userId, patientId } = await newPatientWithMeds([
      { name: "DrugA", dosage: "10mg" },
      { name: "DrugB", dosage: "20mg" },
    ]);
    await refreshInteractions({ patientId, callerUserId: userId, hipaaTenant: false });

    const logs = await testPrisma.aiCallLog.findMany({
      where: { feature: "drug_check", callerUserId: userId },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.provider).toBe("gemini");
    expect(logs[0]?.success).toBe(true);
  });
});
