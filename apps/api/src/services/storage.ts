import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { s3 } from "../lib/s3.js";
import { logger } from "../lib/logger.js";
import { config } from "../config.js";

const ALLOWED_MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function deriveExtension(mimeType: string): string {
  const ext = ALLOWED_MIME_EXT[mimeType];
  if (!ext) throw new Error(`unsupported mime type: ${mimeType}`);
  return ext;
}

// Object key layout: patients/{patientId}/{yyyy-mm-dd}/{uuid}.{ext}
// Date prefix gives easy time-based S3 lifecycle rules and Athena partitioning later.
export function buildObjectKey(args: { patientId: string; mimeType: string }): string {
  const ext = deriveExtension(args.mimeType);
  const today = new Date().toISOString().slice(0, 10);
  return `patients/${args.patientId}/${today}/${randomUUID()}.${ext}`;
}

export async function presignUpload(args: {
  key: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}): Promise<{ url: string; expiresInSeconds: number }> {
  const cmd = new PutObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: args.key,
    ContentType: args.mimeType,
    ContentLength: args.sizeBytes,
    // Bind the upload to the SHA-256 the client claimed. S3 will reject the PUT
    // if the bytes don't match — gives us file integrity for free.
    ChecksumSHA256: Buffer.from(args.sha256, "hex").toString("base64"),
    Metadata: { "sha256-hex": args.sha256 },
  });
  const url = await getSignedUrl(s3, cmd, { expiresIn: config.S3_PRESIGNED_PUT_TTL });
  return { url, expiresInSeconds: config.S3_PRESIGNED_PUT_TTL };
}

export async function presignView(args: { key: string }): Promise<{ url: string; expiresInSeconds: number }> {
  const cmd = new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: args.key });
  const url = await getSignedUrl(s3, cmd, { expiresIn: config.S3_PRESIGNED_GET_TTL });
  return { url, expiresInSeconds: config.S3_PRESIGNED_GET_TTL };
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
}

// Idempotent — called once at API boot. In prod, bucket is created by Terraform;
// this is a dev convenience so MinIO is usable out of the box.
export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.S3_BUCKET }));
    logger.info({ bucket: config.S3_BUCKET }, "s3 bucket exists");
    return;
  } catch (err) {
    const code = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (code !== 404 && code !== 403) {
      logger.warn({ err, bucket: config.S3_BUCKET }, "s3 head-bucket unexpected error; attempting create");
    }
  }
  try {
    await s3.send(new CreateBucketCommand({ Bucket: config.S3_BUCKET }));
    logger.info({ bucket: config.S3_BUCKET }, "s3 bucket created");
  } catch (err) {
    logger.error({ err, bucket: config.S3_BUCKET }, "s3 ensure-bucket failed");
    throw err;
  }
}
