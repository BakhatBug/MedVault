// Vitest setup — runs before every test file. Mocks the AI provider and S3 so
// tests never make real network calls, and provides a single shared Prisma
// client + truncate helper for fast inter-test cleanup.

import { vi, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";

// ──────────────────────────────────────────────────────────────────────────────
// Mock AI providers — never let a test call real Gemini / Anthropic.
// ──────────────────────────────────────────────────────────────────────────────

vi.mock("../src/services/ai/gemini.js", () => ({
  geminiProvider: {
    id: "gemini" as const,
    call: vi.fn().mockResolvedValue({
      text: JSON.stringify({ resourceType: "Bundle", type: "collection", entry: [] }),
      inputTokens: 100,
      outputTokens: 50,
      modelId: "gemini-2.5-flash",
      provider: "gemini" as const,
    }),
  },
}));

vi.mock("../src/services/ai/anthropic.js", () => ({
  anthropicProvider: {
    id: "anthropic" as const,
    call: vi.fn().mockResolvedValue({
      text: "{}",
      inputTokens: 100,
      outputTokens: 50,
      modelId: "claude-sonnet-4-6",
      provider: "anthropic" as const,
    }),
  },
}));

// ──────────────────────────────────────────────────────────────────────────────
// Mock S3 — presign returns fake URLs; bucket-ensure is a no-op.
// ──────────────────────────────────────────────────────────────────────────────

vi.mock("../src/services/storage.js", async () => {
  const actual = await vi.importActual<typeof import("../src/services/storage.js")>("../src/services/storage.js");
  return {
    ...actual,
    presignUpload: vi.fn().mockResolvedValue({ url: "https://fake-s3/put", expiresInSeconds: 600 }),
    presignView: vi.fn().mockResolvedValue({ url: "https://fake-s3/get", expiresInSeconds: 900 }),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    ensureBucket: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock the extraction queue so confirmUpload doesn't try to push to a real
// Redis-backed BullMQ instance.
vi.mock("../src/queues/extraction.js", () => ({
  extractionQueue: { add: vi.fn().mockResolvedValue({ id: "fake-job" }) },
  startExtractionWorker: vi.fn(),
  stopExtractionWorker: vi.fn().mockResolvedValue(undefined),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Shared Prisma + truncate
// ──────────────────────────────────────────────────────────────────────────────

export const testPrisma = new PrismaClient();

// Tables in dependency order — children first. Used to reset state between tests
// without dropping/recreating the schema (faster than migrate reset).
const TABLES_IN_TRUNCATE_ORDER = [
  "audit_logs",
  "notifications",
  "ai_call_logs",
  "ai_summaries",
  "drug_interaction_checks",
  "health_timeline_events",
  "medications",
  "medical_records",
  "doctor_access_permissions",
  "caregiver_links",
  "otp_codes",
  "refresh_tokens",
  "doctor_profiles",
  "patient_profiles",
  "users",
];

export async function truncateAll(): Promise<void> {
  // TRUNCATE … RESTART IDENTITY CASCADE is the fastest way to wipe everything.
  const list = TABLES_IN_TRUNCATE_ORDER.map((t) => `"${t}"`).join(", ");
  await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

beforeAll(async () => {
  await testPrisma.$connect();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll();
});
