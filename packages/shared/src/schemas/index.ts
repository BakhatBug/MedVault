// Shared Zod schemas — used by both API (request validation) and mobile (form validation).
// Keeping them here means a contract change rolls out to both sides at once.

import { z } from "zod";

export const phoneE164 = z.string().regex(/^\+[1-9]\d{6,14}$/, "phone must be E.164");

export const patientCode = z.string().regex(/^MVK-\d{4}-\d{5,}$/, "invalid patient code");

export const recordCategory = z.enum([
  "LAB_RESULT",
  "PRESCRIPTION",
  "IMAGING",
  "DISCHARGE_SUMMARY",
  "CONSULTATION_NOTE",
  "VACCINATION",
  "INSURANCE",
  "OTHER",
]);

export const accessDuration = z.enum(["HOURS_24", "DAYS_7", "DAYS_30", "PERMANENT"]);

export const allowedMimeTypes = z.enum(["application/pdf", "image/jpeg", "image/png"]);

// Spec §11.4 — 25MB cap per file.
export const fileSizeBytes = z.number().int().positive().max(25 * 1024 * 1024);

export const presignUploadRequest = z.object({
  patientId: z.string().uuid(),
  category: recordCategory,
  title: z.string().min(1).max(200),
  mimeType: allowedMimeTypes,
  sizeBytes: fileSizeBytes,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const confirmUploadRequest = z.object({
  s3Key: z.string(),
  patientId: z.string().uuid(),
  category: recordCategory,
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
  recordedAt: z.string().datetime().optional(),
});
