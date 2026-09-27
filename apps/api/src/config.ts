import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().nonnegative().default(3001),
  API_HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
  // Spec §10.1 mandates 12 in production; we allow lower for test perf. Prod
  // env files explicitly set 12 — the schema is just a guardrail against garbage.
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  SMS_PROVIDER: z.enum(["mock", "twilio", "sns"]).default("mock"),

  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string(),
  // Set to a MinIO URL in dev. Leave empty in prod to use real AWS S3.
  S3_ENDPOINT: z.string().url().optional().or(z.literal("")),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  S3_PRESIGNED_PUT_TTL: z.coerce.number().int().positive().default(600),
  S3_PRESIGNED_GET_TTL: z.coerce.number().int().positive().default(900),

  RUN_EXTRACTION_WORKER: z.coerce.boolean().default(true),

  AI_PROVIDER: z.enum(["gemini", "anthropic", "bedrock"]).default("gemini"),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  BEDROCK_REGION: z.string().default("us-east-1"),
  AI_MODEL_EXTRACTION: z.string().default("gemini-2.5-flash"),
  AI_MODEL_SUMMARY: z.string().default("gemini-2.5-pro"),
  AI_MODEL_QA: z.string().default("gemini-2.5-flash"),
  AI_MODEL_CLASSIFY: z.string().default("gemini-2.5-flash-lite"),
  AI_RATE_LIMIT_PER_PATIENT_PER_DOCTOR_PER_DAY: z.coerce.number().int().positive().default(10),

  REDIS_URL: z.string().url(),
});

const parsed = Schema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type AppConfig = typeof config;
