import { config } from "../../config.js";
import { logger } from "../../lib/logger.js";
import { pickProvider } from "./index.js";
import { logAiCall } from "./extraction.js";
import { loadPatientContext, buildContextPayload } from "./context.js";
import { assertWithinRateLimit } from "./limits.js";
import type { AICallInput } from "./provider.js";

// ──────────────────────────────────────────────────────────────────────────────
// Doctor Q&A — spec §4.3.3, §8.5.
// "AI Service builds a context prompt from the patient's full structured data,
//  then appends the doctor's question."
// ──────────────────────────────────────────────────────────────────────────────

export class QaError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
    this.name = "QaError";
  }
}

const errors = {
  modelError: (msg: string) => new QaError("ai_model_error", 502, msg),
};

export type QaResult = {
  answer: string;
  modelId: string;
  generatedAt: Date;
  inputTokens: number;
  outputTokens: number;
};

export async function askPatientQuestion(args: {
  patientId: string;
  callerUserId: string;
  hipaaTenant: boolean;
  question: string;
}): Promise<QaResult> {
  await assertWithinRateLimit({ patientId: args.patientId, callerUserId: args.callerUserId });

  const ctx = await loadPatientContext(args.patientId);
  const provider = pickProvider({ hipaaTenant: args.hipaaTenant });
  const startedAt = Date.now();
  let success = false;
  let outcome = {
    provider: provider.id,
    modelId: config.AI_MODEL_QA,
    inputTokens: 0,
    outputTokens: 0,
  };

  try {
    const aiInput: AICallInput = {
      modelId: config.AI_MODEL_QA,
      systemPrompt: QA_SYSTEM_PROMPT,
      userContent: [
        { type: "text", text: `PATIENT JSON:\n${buildContextPayload(ctx)}` },
        { type: "text", text: `\nQUESTION:\n${args.question.trim()}` },
      ],
      maxTokens: 1024,
      temperature: 0.2,
    };
    const res = await provider.call(aiInput);
    outcome = {
      provider: res.provider,
      modelId: res.modelId,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
    };
    success = true;
    return {
      answer: res.text.trim(),
      modelId: res.modelId,
      generatedAt: new Date(),
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
    };
  } catch (err) {
    logger.error({ err, patientId: args.patientId }, "qa generation failed");
    throw err instanceof QaError ? err : errors.modelError((err as Error).message ?? "unknown");
  } finally {
    await logAiCall({
      callerUserId: args.callerUserId,
      patientId: args.patientId,
      feature: "qa",
      outcome,
      latencyMs: Date.now() - startedAt,
      success,
    });
  }
}

const QA_SYSTEM_PROMPT = `
You are a clinical Q&A assistant for MediVault. A verified physician is asking a question about a specific patient. You will receive:
1. PATIENT JSON — a snapshot of the patient's profile, active medications, and records (each with extracted FHIR resources).
2. QUESTION — the doctor's question.

Rules:
- Answer based ONLY on what is in the JSON. If the data isn't present, say "Not in the available records."
- Be concise — 1-3 sentences for simple questions, at most one short paragraph for complex ones.
- Cite specific dates, medications, or values from the JSON when relevant.
- Do NOT recommend treatment changes. You may surface clinical observations, but you are not the prescribing doctor.
- Never invent data, dates, dosages, or values.
- Plain text only. No markdown headers, no bullet lists, no greetings, no preamble. The disclaimer is added downstream.
`.trim();
