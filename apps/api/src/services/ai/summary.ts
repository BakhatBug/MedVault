import { createHash } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { config } from "../../config.js";
import { pickProvider } from "./index.js";
import { logAiCall } from "./extraction.js";
import { loadPatientContext, buildContextPayload, type PatientContext } from "./context.js";
import { assertWithinRateLimit } from "./limits.js";
import type { AICallInput } from "./provider.js";

// ──────────────────────────────────────────────────────────────────────────────
// Errors
// ──────────────────────────────────────────────────────────────────────────────

export class SummaryError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
    this.name = "SummaryError";
  }
}

const errors = {
  modelError: (msg: string) => new SummaryError("ai_model_error", 502, msg),
};

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

export type SummaryFlag = {
  kind: "drug_interaction" | "lab_trend" | "missed_followup" | "allergy_conflict" | "other";
  severity: "low" | "moderate" | "high";
  text: string;
};

export type SummaryResult = {
  id: string;
  summaryText: string;
  flags: SummaryFlag[];
  modelId: string;
  createdAt: Date;
  cached: boolean;
};

/**
 * Generate (or return cached) summary for a patient. Caching is keyed by a
 * stable hash of the patient's record + medication set — regenerating only
 * when the underlying data has changed (spec §13.3 cost optimization).
 */
export async function generateOrGetSummary(args: {
  patientId: string;
  callerUserId: string;
  hipaaTenant: boolean;
  forceRefresh?: boolean;
}): Promise<SummaryResult> {
  const ctx = await loadPatientContext(args.patientId);
  const hash = computeRecordSetHash(ctx);

  if (!args.forceRefresh) {
    const cached = await prisma.aiSummary.findUnique({
      where: { patientId_recordSetHash: { patientId: args.patientId, recordSetHash: hash } },
    });
    if (cached) {
      return {
        id: cached.id,
        summaryText: cached.summaryText,
        flags: (cached.flags as SummaryFlag[]) ?? [],
        modelId: cached.modelId,
        createdAt: cached.createdAt,
        cached: true,
      };
    }
  }

  await assertWithinRateLimit({ patientId: args.patientId, callerUserId: args.callerUserId });

  const provider = pickProvider({ hipaaTenant: args.hipaaTenant });
  const startedAt = Date.now();
  let success = false;
  let outcome: { provider: string; modelId: string; inputTokens: number; outputTokens: number } = {
    provider: provider.id,
    modelId: config.AI_MODEL_SUMMARY,
    inputTokens: 0,
    outputTokens: 0,
  };

  try {
    const aiInput: AICallInput = {
      modelId: config.AI_MODEL_SUMMARY,
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      userContent: [{ type: "text", text: buildContextPayload(ctx) }],
      maxTokens: 8192,
      temperature: 0.2,
      jsonMode: true,
    };
    const res = await provider.call(aiInput);
    outcome = { provider: res.provider, modelId: res.modelId, inputTokens: res.inputTokens, outputTokens: res.outputTokens };

    const parsed = parseSummaryResponse(res.text);

    const row = await prisma.aiSummary.upsert({
      where: { patientId_recordSetHash: { patientId: args.patientId, recordSetHash: hash } },
      update: {
        summaryText: parsed.summary,
        flags: parsed.flags as unknown as object,
        modelId: res.modelId,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
      },
      create: {
        patientId: args.patientId,
        recordSetHash: hash,
        summaryText: parsed.summary,
        flags: parsed.flags as unknown as object,
        modelId: res.modelId,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
      },
    });

    success = true;
    return {
      id: row.id,
      summaryText: row.summaryText,
      flags: parsed.flags,
      modelId: row.modelId,
      createdAt: row.createdAt,
      cached: false,
    };
  } catch (err) {
    logger.error({ err, patientId: args.patientId }, "summary generation failed");
    throw err instanceof SummaryError ? err : errors.modelError((err as Error).message ?? "unknown");
  } finally {
    await logAiCall({
      callerUserId: args.callerUserId,
      patientId: args.patientId,
      feature: "summary",
      outcome,
      latencyMs: Date.now() - startedAt,
      success,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Hash for cache invalidation. Stable, sorted, includes everything that
// affects the summary content.
// ──────────────────────────────────────────────────────────────────────────────

function computeRecordSetHash(ctx: PatientContext): string {
  const parts: string[] = [
    `profile:${ctx.profile.id}:${ctx.profile.profileUpdatedAt.toISOString()}`,
    ...ctx.medications
      .map((m) => `med:${m.id}:${m.updatedAt.toISOString()}:${m.isActive}`)
      .sort(),
    ...ctx.records
      .map((r) => `rec:${r.id}:${r.updatedAt.toISOString()}`)
      .sort(),
  ];
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

// ──────────────────────────────────────────────────────────────────────────────
// Prompt + parser
// ──────────────────────────────────────────────────────────────────────────────

const SUMMARY_SYSTEM_PROMPT = `
You are a clinical summarization assistant for MediVault. A verified physician will read your output before a consult.

You will receive a JSON object containing a patient's age, allergies, chronic conditions, active medications, and a list of records each with extracted FHIR resources.

Output a single JSON object with exactly this shape — no markdown fences, no prose around it:

{
  "summary": "<markdown text, 150-400 words>",
  "flags": [
    { "kind": "<drug_interaction | lab_trend | missed_followup | allergy_conflict | other>", "severity": "<low | moderate | high>", "text": "<one-line explanation>" }
  ]
}

Rules for "summary":
- Lead with one sentence stating who the patient is (age, sex if known, key chronic conditions).
- Then sections: ## Active medications, ## Recent labs & vitals, ## Notable history.
- Never invent data — reference only what is in the JSON.
- Use plain clinical language. No greetings, no hedging boilerplate.

Rules for "flags":
- Surface drug-drug interactions only if both drugs are in active medications.
- Surface lab trends only when at least two readings of the same metric are present and the trend direction is unambiguous.
- Surface allergy conflicts only when an active medication matches a documented allergy by substance class.
- If nothing rises to a flag, return an empty array.
- "severity" is your judgment of clinical impact. "high" should be reserved for life-threatening interactions or critical lab values.

You are a summarizer, not a diagnostician. Do not recommend treatment changes. Do not write disclaimers — those are added downstream.
`.trim();

type ParsedSummary = { summary: string; flags: SummaryFlag[] };

function parseSummaryResponse(raw: string): ParsedSummary {
  const cleaned = stripJsonFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Model returned narrative instead of JSON. Use the raw text as the summary
    // and surface no flags rather than fail the call.
    return { summary: raw.trim(), flags: [] };
  }
  if (typeof parsed !== "object" || parsed === null) return { summary: raw.trim(), flags: [] };
  const obj = parsed as { summary?: unknown; flags?: unknown };
  const summary = typeof obj.summary === "string" ? obj.summary : raw.trim();
  const flags = Array.isArray(obj.flags) ? sanitizeFlags(obj.flags) : [];
  return { summary, flags };
}

function sanitizeFlags(input: unknown[]): SummaryFlag[] {
  const allowedKinds = new Set(["drug_interaction", "lab_trend", "missed_followup", "allergy_conflict", "other"]);
  const allowedSeverity = new Set(["low", "moderate", "high"]);
  const out: SummaryFlag[] = [];
  for (const item of input) {
    if (typeof item !== "object" || item === null) continue;
    const f = item as { kind?: unknown; severity?: unknown; text?: unknown };
    if (typeof f.kind !== "string" || !allowedKinds.has(f.kind)) continue;
    if (typeof f.severity !== "string" || !allowedSeverity.has(f.severity)) continue;
    if (typeof f.text !== "string" || f.text.length === 0) continue;
    out.push({ kind: f.kind as SummaryFlag["kind"], severity: f.severity as SummaryFlag["severity"], text: f.text });
  }
  return out;
}

function stripJsonFences(text: string): string {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json|JSON)?\s*\n?/, "").replace(/\n?\s*```\s*$/, "");
  }
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first > 0 && last > first) s = s.slice(first, last + 1);
  return s.trim();
}
