import jwt, { type SignOptions } from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";
import type { UserRole } from "@prisma/client";

export type AccessTokenClaims = {
  sub: string;          // user id
  role: UserRole;
  hipaaTenant: boolean; // routes AI calls to Bedrock when true
};

export function signAccessToken(claims: AccessTokenClaims): string {
  const options: SignOptions = {
    expiresIn: config.JWT_ACCESS_TTL as SignOptions["expiresIn"],
    issuer: "medivault",
    audience: "medivault-api",
  };
  return jwt.sign(claims, config.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenClaims & jwt.JwtPayload {
  return jwt.verify(token, config.JWT_ACCESS_SECRET, {
    issuer: "medivault",
    audience: "medivault-api",
  }) as AccessTokenClaims & jwt.JwtPayload;
}

// Refresh tokens are opaque random strings, not JWTs.
// We store the SHA-256 of the token in `refresh_tokens.token_hash` so a database
// dump alone cannot resurrect a session. Reuse of a revoked token signals theft —
// see auth handlers for chain-revocation logic.
export function generateRefreshToken(): { plain: string; hash: string } {
  const plain = randomBytes(48).toString("base64url");
  const hash = createHash("sha256").update(plain).digest("hex");
  return { plain, hash };
}

export function hashRefreshToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

// Convert "30d" / "15m" style strings to ms for expires_at columns.
export function ttlToMillis(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) throw new Error(`invalid TTL format: ${ttl}`);
  const n = Number(match[1]);
  switch (match[2]) {
    case "s": return n * 1000;
    case "m": return n * 60 * 1000;
    case "h": return n * 60 * 60 * 1000;
    case "d": return n * 24 * 60 * 60 * 1000;
  }
  throw new Error(`unreachable`);
}
