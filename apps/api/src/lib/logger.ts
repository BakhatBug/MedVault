import pino, { type LoggerOptions } from "pino";
import { config } from "../config.js";

// Spec §10.2 — patient data must never be in logs. We allowlist record/user ids only.
// pino's redact path lets us strip anything that looks like PHI even if it sneaks in.
const phiRedactPaths = [
  "*.email",
  "*.phoneE164",
  "*.passwordHash",
  "*.password",
  "*.fullName",
  "*.dateOfBirth",
  "*.allergiesFhir",
  "*.chronicConditionsFhir",
  "*.emergencyContact",
  "*.insurance",
  "*.medicationFhir",
  "*.extractedFhir",
  "*.summaryText",
  "req.headers.authorization",
  "req.headers.cookie",
];

const options: LoggerOptions = {
  level: config.LOG_LEVEL,
  redact: {
    paths: phiRedactPaths,
    censor: "[redacted]",
  },
  base: { service: "medivault-api", env: config.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
};

export const logger =
  config.NODE_ENV === "development"
    ? pino({
        ...options,
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
        },
      })
    : pino(options);
