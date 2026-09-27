import { Queue, Worker, type Job } from "bullmq";
import { AIProcessingStatus } from "@prisma/client";
import { redis } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { config } from "../config.js";
import { extractRecord, logAiCall } from "../services/ai/extraction.js";
import { promoteExtractedMedications } from "../services/ai/promote-extracted.js";

export type ExtractionJobData = { recordId: string };

const QUEUE_NAME = "ai-extraction";

export const extractionQueue = new Queue<ExtractionJobData>(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    // Spec §16.2 — retry up to 3 times over 24 hours with exponential backoff.
    attempts: 3,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1000 },
    removeOnFail: { age: 30 * 24 * 60 * 60 },
  },
});

let worker: Worker<ExtractionJobData> | null = null;

async function process(job: Job<ExtractionJobData>): Promise<void> {
  const { recordId } = job.data;

  const record = await prisma.medicalRecord.findUnique({
    where: { id: recordId },
    select: {
      id: true,
      s3Key: true,
      mimeType: true,
      uploadedByUserId: true,
      patientId: true,
      patient: { select: { user: { select: { hipaaTenant: true } } } },
    },
  });
  if (!record) {
    logger.warn({ recordId }, "[extraction] record disappeared before processing");
    return;
  }

  await prisma.medicalRecord.update({
    where: { id: recordId },
    data: { aiStatus: AIProcessingStatus.PROCESSING, aiAttempts: { increment: 1 } },
  });

  const startedAt = Date.now();
  try {
    const outcome = await extractRecord({
      recordId,
      s3Key: record.s3Key,
      mimeType: record.mimeType,
      hipaaTenant: record.patient.user.hipaaTenant,
    });

    await prisma.medicalRecord.update({
      where: { id: recordId },
      data: {
        aiStatus: AIProcessingStatus.COMPLETED,
        extractedFhir: outcome.bundle as unknown as object,
        aiLastError: null,
      },
    });

    // Auto-promote any MedicationRequest entries to medications rows.
    // Errors are logged but don't fail the extraction job — the record stays
    // COMPLETED even if promotion has a hiccup. Re-running the extraction is
    // idempotent (skipped because sourceRecordId already matches).
    try {
      const promoted = await promoteExtractedMedications({
        recordId,
        patientId: record.patientId,
        uploadedByUserId: record.uploadedByUserId,
        hipaaTenant: record.patient.user.hipaaTenant,
        bundle: outcome.bundle,
      });
      if (promoted.created > 0) {
        logger.info({ recordId, created: promoted.created, skipped: promoted.skipped }, "[extraction] meds promoted");
      }
    } catch (err) {
      logger.error({ err, recordId }, "[extraction] medication promotion failed (extraction still marked complete)");
    }

    await logAiCall({
      callerUserId: record.uploadedByUserId,
      patientId: record.patientId,
      feature: "extraction",
      outcome: {
        provider: outcome.provider,
        modelId: outcome.modelId,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
      },
      latencyMs: Date.now() - startedAt,
      success: true,
    });

    logger.info(
      {
        recordId,
        provider: outcome.provider,
        model: outcome.modelId,
        entries: outcome.bundle.entry.length,
        latencyMs: Date.now() - startedAt,
      },
      "[extraction] completed",
    );
  } catch (err) {
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await prisma.medicalRecord.update({
      where: { id: recordId },
      data: {
        aiStatus: isFinalAttempt ? AIProcessingStatus.FAILED_PERMANENT : AIProcessingStatus.FAILED_RETRYABLE,
        aiLastError: (err as Error).message?.slice(0, 1000) ?? "unknown",
      },
    });

    await logAiCall({
      callerUserId: record.uploadedByUserId,
      patientId: record.patientId,
      feature: "extraction",
      outcome: { provider: "unknown", modelId: config.AI_MODEL_EXTRACTION, inputTokens: 0, outputTokens: 0 },
      latencyMs: Date.now() - startedAt,
      success: false,
      errorCode: (err as Error).name ?? "Error",
    });

    throw err; // BullMQ records the failure and schedules the next attempt
  }
}

export function startExtractionWorker(): void {
  if (!config.RUN_EXTRACTION_WORKER) {
    logger.info("[extraction] worker disabled by RUN_EXTRACTION_WORKER=false");
    return;
  }
  worker = new Worker<ExtractionJobData>(QUEUE_NAME, process, {
    connection: redis,
    concurrency: 4,
  });
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "[extraction] job failed");
  });
  worker.on("error", (err) => {
    logger.error({ err }, "[extraction] worker error");
  });
  logger.info("[extraction] worker started");
}

export async function stopExtractionWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  await extractionQueue.close();
}
