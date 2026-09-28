import { createHash } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { config } from "../../config.js";
import { pickProvider } from "./index.js";
import { logAiCall } from "./extraction.js";
import { assertWithinRateLimit } from "./limits.js";

// ──────────────────────────────────────────────────────────────────────────────
// Drug interaction checker (spec §4.3.3, §8.4)
//
// Runs the patient's active-medications list through Gemini, asks for known
// clinically-significant interactions, persists the structured result.
//
// Caching: keyed by a hash of the active med name+dosage set. The check is
// re-run only when that set changes. Doctors and patients read the cached row;
// callers don't pay the AI cost on every read.
// ──────────────────────────────────────────────────────────────────────────────

export class InteractionsError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
    this.name = "InteractionsError";
  }
}

export type InteractionEntry = {
  medications: string[];
  severity: "minor" | "moderate" | "major";
  description: string;
};

export type InteractionCheckResult = {
  generatedAt: Date;
  modelId: string;
  medicationsHash: string;
  medications: Array<{ name: string; dosage: string | null }>;
  interactions: InteractionEntry[];
  cached: boolean;
};

const SYSTEM_PROMPT = `
You are a clinical pharmacology assistant for MediVault. You will receive a JSON list of a patient's active medications. Return ONLY a JSON object — no prose, no markdown fences, no explanation.

Shape:
{
  "interactions": [
    {
      "medications": ["Drug A", "Drug B"],
      "severity": "minor" | "moderate" | "major",
      "description": "<one sentence explaining the interaction>"
    }
  ]
}

Rules:
- Only include CLINICALLY SIGNIFICANT interactions. Skip duplicates, theoretical interactions, or extremely rare ones.
- Use the same medication names as provided in the input ("Lisinopril", not "lisinopril hydrochloride").
- "major" = potentially life-threatening / requires alternative. "moderate" = monitor closely / adjust dose. "minor" = note but typically acceptable.
- description must be ONE sentence under 200 characters.
- If there are no interactions, return {"interactions": []}.
- Never invent drugs not in the input list.
`.trim();

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

// Re-run the check unconditionally — used after medication add/update/delete.
// Skips network call when the cached hash matches.
export async function refreshInteractions(args: {
  patientId: string;
  callerUserId: string;
  hipaaTenant: boolean;
}): Promise<InteractionCheckResult> {
  const meds = await loadActiveMeds(args.patientId);
  const hash = hashMedications(meds);

  const cached = await prisma.drugInteractionCheck.findUnique({
    where: { patientId_medicationsHash: { patientId: args.patientId, medicationsHash: hash } },
    select: { interactions: true, modelId: true, createdAt: true },
  });
  if (cached) {
    return {
      generatedAt: cached.createdAt,
      modelId: cached.modelId,
      medicationsHash: hash,
      medications: meds,
      interactions: cached.interactions as InteractionEntry[],
      cached: true,
    };
  }

  // No cache — call the model. Charge rate limit only for fresh calls.
  await assertWithinRateLimit({ patientId: args.patientId, callerUserId: args.callerUserId });

  // Empty med list shortcut — no need to spend tokens.
  if (meds.length < 2) {
    const empty = await prisma.drugInteractionCheck.upsert({
      where: { patientId_medicationsHash: { patientId: args.patientId, medicationsHash: hash } },
      create: {
        patientId: args.patientId,
        medicationsHash: hash,
        interactions: [],
        modelId: "skipped-too-few-meds",
        inputTokens: 0,
        outputTokens: 0,
      },
      update: {},
      select: { interactions: true, modelId: true, createdAt: true },
    });
    return {
      generatedAt: empty.createdAt,
      modelId: empty.modelId,
      medicationsHash: hash,
      medications: meds,
      interactions: empty.interactions as InteractionEntry[],
      cached: false,
    };
  }

  const provider = pickProvider({ hipaaTenant: args.hipaaTenant });
  const startedAt = Date.now();
  let success = false;
  let outcome = { provider: provider.id, modelId: config.AI_MODEL_QA, inputTokens: 0, outputTokens: 0 };

  try {
    const res = await provider.call({
      modelId: config.AI_MODEL_QA,
      systemPrompt: SYSTEM_PROMPT,
      userContent: [{ type: "text", text: JSON.stringify({ medications: meds }, null, 2) }],
      maxTokens: 8192,
      temperature: 0.1,
      jsonMode: true,
    });
    outcome = { provider: res.provider, modelId: res.modelId, inputTokens: res.inputTokens, outputTokens: res.outputTokens };

    const interactions = parseInteractions(res.text, meds);
    success = true;

    const saved = await prisma.drugInteractionCheck.upsert({
      where: { patientId_medicationsHash: { patientId: args.patientId, medicationsHash: hash } },
      create: {
        patientId: args.patientId,
        medicationsHash: hash,
        interactions: interactions as unknown as object,
        modelId: res.modelId,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
      },
      update: {
        interactions: interactions as unknown as object,
        modelId: res.modelId,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
      },
      select: { createdAt: true },
    });

    return {
      generatedAt: saved.createdAt,
      modelId: res.modelId,
      medicationsHash: hash,
      medications: meds,
      interactions,
      cached: false,
    };
  } catch (err) {
    logger.error({ err, patientId: args.patientId }, "drug interaction check failed");
    throw err instanceof InteractionsError
      ? err
      : new InteractionsError("ai_model_error", 502, (err as Error).message ?? "unknown");
  } finally {
    await logAiCall({
      callerUserId: args.callerUserId,
      patientId: args.patientId,
      feature: "drug_check",
      outcome,
      latencyMs: Date.now() - startedAt,
      success,
    });
  }
}

// Read-only — used by GET endpoints. Returns the cached value or null if no
// check has ever been run for the current medication set.
export async function getCachedInteractions(patientId: string): Promise<InteractionCheckResult | null> {
  const meds = await loadActiveMeds(patientId);
  const hash = hashMedications(meds);
  const cached = await prisma.drugInteractionCheck.findUnique({
    where: { patientId_medicationsHash: { patientId, medicationsHash: hash } },
    select: { interactions: true, modelId: true, createdAt: true },
  });
  if (!cached) return null;
  return {
    generatedAt: cached.createdAt,
    modelId: cached.modelId,
    medicationsHash: hash,
    medications: meds,
    interactions: cached.interactions as InteractionEntry[],
    cached: true,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────────────────

async function loadActiveMeds(patientId: string): Promise<Array<{ name: string; dosage: string | null }>> {
  const rows = await prisma.medication.findMany({
    where: { patientId, isActive: true, deletedAt: null },
    select: { name: true, dosage: true },
    orderBy: { name: "asc" },
  });
  return rows;
}

function hashMedications(meds: Array<{ name: string; dosage: string | null }>): string {
  const normalized = meds
    .map((m) => `${m.name.toLowerCase().trim()}|${(m.dosage ?? "").toLowerCase().trim()}`)
    .sort();
  return createHash("sha256").update(normalized.join("\n")).digest("hex");
}

function parseInteractions(
  text: string,
  knownMeds: Array<{ name: string }>,
): InteractionEntry[] {
  const stripped = stripJsonFences(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    logger.warn({ err, text: text.slice(0, 200) }, "drug-check returned non-JSON; treating as empty");
    return [];
  }
  if (!isObject(parsed) || !Array.isArray((parsed as { interactions?: unknown }).interactions)) {
    return [];
  }

  const allowed = new Set(knownMeds.map((m) => m.name.toLowerCase()));
  const validSeverities = new Set(["minor", "moderate", "major"]);

  return (parsed as { interactions: unknown[] }).interactions
    .map((raw): InteractionEntry | null => {
      if (!isObject(raw)) return null;
      const r = raw as Record<string, unknown>;
      const meds = Array.isArray(r.medications) ? r.medications.filter((m): m is string => typeof m === "string") : null;
      const sev = typeof r.severity === "string" ? r.severity : null;
      const desc = typeof r.description === "string" ? r.description : null;
      if (!meds || meds.length < 2 || !sev || !desc) return null;
      if (!validSeverities.has(sev)) return null;
      // Drop entries that reference drugs not in our active list — model
      // sometimes invents extras despite the prompt.
      const allMatched = meds.every((m) => allowed.has(m.toLowerCase()));
      if (!allMatched) return null;
      return {
        medications: meds,
        severity: sev as InteractionEntry["severity"],
        description: desc.slice(0, 500),
      };
    })
    .filter((v): v is InteractionEntry => v !== null);
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

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
