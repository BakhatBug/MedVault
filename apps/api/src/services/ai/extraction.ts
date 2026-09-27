import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { s3 } from "../../lib/s3.js";
import { logger } from "../../lib/logger.js";
import { config } from "../../config.js";
import { prisma } from "../../lib/prisma.js";
import { pickProvider } from "./index.js";
import type { AIContentBlock } from "./provider.js";
import type { ExtractionResult } from "@medivault/shared";

// ──────────────────────────────────────────────────────────────────────────────
// Prompt — instructs the model to emit a strict FHIR R4 Bundle JSON.
// We keep the schema in prose because Gemini's structured-output mode does not
// yet handle the full FHIR schema cleanly; a light JSON-only constraint with a
// detailed example outperforms an over-specified responseSchema in practice.
// ──────────────────────────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `
You are a clinical data extractor for MediVault. Read the supplied medical document and output ONLY a JSON object — no prose, no markdown fences, no explanation.

The JSON must be a FHIR R4 Bundle of type "collection" with this exact shape:

{
  "resourceType": "Bundle",
  "type": "collection",
  "entry": [
    { "resource": { "resourceType": "<Type>", ... } }
  ]
}

Allowed entry resourceType values: AllergyIntolerance, Condition, MedicationRequest, Observation, Immunization.

Rules:
- Never invent data. If a field is not in the document, omit it. Do not guess units or dosages.
- Use ISO-8601 for dates ("2026-04-12" or "2026-04-12T14:30:00Z").
- For medications, prefer "medicationCodeableConcept" with a "text" field of the medication name as written in the document. Do not fabricate RxNorm or SNOMED codes.
- For lab results, use Observation with "valueQuantity" when the value has a numeric reading and unit; otherwise "valueString".
- For allergies, use AllergyIntolerance with the substance in "code.text".
- For diagnoses / chronic conditions, use Condition with the diagnosis in "code.text".
- If the document is unreadable, contains no extractable clinical data, or is not a medical document, return {"resourceType":"Bundle","type":"collection","entry":[]}.

Output JSON only.
`.trim();

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

export type ExtractionOutcome = {
  bundle: ExtractionResult;
  inputTokens: number;
  outputTokens: number;
  modelId: string;
  provider: string;
};

export async function extractRecord(args: {
  recordId: string;
  s3Key: string;
  mimeType: string;
  hipaaTenant: boolean;
}): Promise<ExtractionOutcome> {
  const fileBytes = await downloadS3Object(args.s3Key);
  const block = toContentBlock(args.mimeType, fileBytes);

  const provider = pickProvider({ hipaaTenant: args.hipaaTenant });
  const result = await provider.call({
    modelId: config.AI_MODEL_EXTRACTION,
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    userContent: [block],
    maxTokens: 4096,
    temperature: 0.1,
  });

  const bundle = parseFhirBundle(result.text, args.recordId, result.modelId);
  return {
    bundle,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    modelId: result.modelId,
    provider: result.provider,
  };
}

// Logs the call against ai_call_logs per spec §8.6 audit requirement.
export async function logAiCall(args: {
  callerUserId: string;
  patientId: string | null;
  feature: "extraction" | "summary" | "qa" | "drug_check";
  outcome: { provider: string; modelId: string; inputTokens: number; outputTokens: number };
  latencyMs: number;
  success: boolean;
  errorCode?: string;
}): Promise<void> {
  try {
    await prisma.aiCallLog.create({
      data: {
        callerUserId: args.callerUserId,
        patientId: args.patientId,
        feature: args.feature,
        provider: args.outcome.provider,
        modelId: args.outcome.modelId,
        inputTokens: args.outcome.inputTokens,
        outputTokens: args.outcome.outputTokens,
        latencyMs: args.latencyMs,
        success: args.success,
        ...(args.errorCode ? { errorCode: args.errorCode } : {}),
      },
    });
  } catch (err) {
    logger.error({ err }, "ai_call_log write failed");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────────────────

async function downloadS3Object(key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
  const stream = res.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function toContentBlock(mimeType: string, bytes: Buffer): AIContentBlock {
  const dataBase64 = bytes.toString("base64");
  if (mimeType === "application/pdf") {
    return { type: "document", mediaType: "application/pdf", dataBase64 };
  }
  if (mimeType === "image/jpeg" || mimeType === "image/png") {
    return { type: "image", mediaType: mimeType, dataBase64 };
  }
  throw new Error(`unsupported mime type for extraction: ${mimeType}`);
}

// Strip common LLM artifacts (markdown fences, leading prose) before parsing.
function parseFhirBundle(text: string, recordId: string, modelId: string): ExtractionResult {
  const cleaned = stripJsonFences(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    logger.warn({ err, text: text.slice(0, 200) }, "ai extraction returned non-JSON; returning empty bundle");
    return emptyBundle(recordId, modelId);
  }

  if (!isPlainObject(parsed)) return emptyBundle(recordId, modelId);
  if (parsed.resourceType !== "Bundle" || parsed.type !== "collection" || !Array.isArray(parsed.entry)) {
    logger.warn({ shape: shapeOf(parsed) }, "ai extraction returned wrong shape; returning empty bundle");
    return emptyBundle(recordId, modelId);
  }

  // Whitelist resourceTypes — any other type is dropped silently rather than
  // fail-closed, since one bad entry shouldn't kill the whole extraction.
  const allowed = new Set(["AllergyIntolerance", "Condition", "MedicationRequest", "Observation", "Immunization"]);
  const safeEntries = parsed.entry.filter((e): e is { resource: { resourceType: string } } =>
    isPlainObject(e) &&
    isPlainObject((e as { resource?: unknown }).resource) &&
    typeof ((e as { resource: { resourceType?: unknown } }).resource.resourceType) === "string" &&
    allowed.has((e as { resource: { resourceType: string } }).resource.resourceType),
  );

  return {
    resourceType: "Bundle",
    type: "collection",
    meta: { extractedAt: new Date().toISOString(), modelId, sourceRecordId: recordId },
    entry: safeEntries as ExtractionResult["entry"],
  };
}

function emptyBundle(recordId: string, modelId: string): ExtractionResult {
  return {
    resourceType: "Bundle",
    type: "collection",
    meta: { extractedAt: new Date().toISOString(), modelId, sourceRecordId: recordId },
    entry: [],
  };
}

function stripJsonFences(text: string): string {
  let s = text.trim();
  // Strip ```json ... ``` or ``` ... ``` wrappers. Be tolerant: some models leave
  // trailing whitespace after the closing fence, or omit the language tag.
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json|JSON)?\s*\n?/, "").replace(/\n?\s*```\s*$/, "");
  }
  // Final guardrail: if the model added prose around the JSON, slice from first
  // '{' to last '}' so JSON.parse has a chance.
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first > 0 && last > first) s = s.slice(first, last + 1);
  return s.trim();
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function shapeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "object") return `object{${Object.keys(v as object).slice(0, 5).join(",")}}`;
  return typeof v;
}
