import { createHash, randomInt } from "node:crypto";
import { config } from "../config.js";

// 6-digit numeric OTP per spec §10.1. Generated with crypto.randomInt for unbiased
// uniform sampling across [0, 999999]. Padded to fixed width so leading zeros are preserved.
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// We never store the code itself — only its hash. SHA-256 is fine here because
// the input space (1e6) is small and the hash is invalidated after consumption
// or expiry. Constant-time comparison is enforced by hashing the candidate
// before comparing strings.
export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function otpExpiryDate(): Date {
  return new Date(Date.now() + config.OTP_TTL_SECONDS * 1000);
}
