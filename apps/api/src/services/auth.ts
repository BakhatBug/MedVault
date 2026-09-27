import { type Prisma, AccountStatus, AuditAction, DoctorVerificationStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/passwords.js";
import { generateOtpCode, hashOtpCode, otpExpiryDate } from "../lib/otp.js";
import { generateRefreshToken, hashRefreshToken, signAccessToken, ttlToMillis } from "../lib/jwt.js";
import { recordAudit } from "../lib/audit.js";
import { allocatePatientCode } from "./patient-code.js";
import { getSmsProvider } from "./sms/index.js";
import { config } from "../config.js";

// ──────────────────────────────────────────────────────────────────────────────
// Errors — use a small set of typed errors so the HTTP layer can map cleanly
// to status codes without leaking internal detail to clients.
// ──────────────────────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

const errors = {
  emailTaken: () => new AuthError("email_taken", 409, "Email already registered"),
  phoneTaken: () => new AuthError("phone_taken", 409, "Phone already registered"),
  invalidCredentials: () => new AuthError("invalid_credentials", 401, "Invalid email/phone or password"),
  accountInactive: () => new AuthError("account_inactive", 403, "Account is not active"),
  otpInvalid: () => new AuthError("otp_invalid", 400, "OTP code is invalid"),
  otpExpired: () => new AuthError("otp_expired", 400, "OTP code has expired"),
  otpAttemptsExceeded: () => new AuthError("otp_attempts_exceeded", 429, "Too many OTP attempts"),
  otpResendCooldown: (waitSec: number) =>
    new AuthError("otp_resend_cooldown", 429, `Please wait ${waitSec}s before requesting another code`),
  otpResendInvalidState: () =>
    new AuthError("otp_resend_invalid_state", 400, "OTP cannot be resent for this account state"),
  userNotFound: () => new AuthError("user_not_found", 404, "User not found"),
  refreshInvalid: () => new AuthError("refresh_invalid", 401, "Refresh token invalid or revoked"),
};

// ──────────────────────────────────────────────────────────────────────────────
// Inputs
// ──────────────────────────────────────────────────────────────────────────────

export type RegisterInput = {
  email: string;
  phoneE164: string;
  password: string;
  role: "PATIENT" | "DOCTOR" | "CAREGIVER";
  // Patient-specific
  fullName?: string;
  dateOfBirth?: string; // ISO date
  // Doctor-specific
  licenseNumber?: string;
  licenseCountry?: string;
};

export type RequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

// ──────────────────────────────────────────────────────────────────────────────
// REGISTER
// ──────────────────────────────────────────────────────────────────────────────

export async function registerUser(
  input: RegisterInput,
  ctx: RequestContext,
): Promise<{ userId: string; devOtp?: string }> {
  const email = input.email.trim().toLowerCase();
  const phone = input.phoneE164.trim();

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { phoneE164: phone }] },
    select: { email: true, phoneE164: true },
  });
  if (existing?.email === email) throw errors.emailTaken();
  if (existing?.phoneE164 === phone) throw errors.phoneTaken();

  if (input.role === "PATIENT" && (!input.fullName || !input.dateOfBirth)) {
    throw new AuthError("missing_patient_fields", 400, "Patient registration requires fullName and dateOfBirth");
  }
  if (input.role === "DOCTOR" && (!input.fullName || !input.licenseNumber || !input.licenseCountry)) {
    throw new AuthError(
      "missing_doctor_fields",
      400,
      "Doctor registration requires fullName, licenseNumber, and licenseCountry",
    );
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        phoneE164: phone,
        passwordHash,
        role: input.role as UserRole,
        status: AccountStatus.PENDING_OTP,
      },
    });

    if (input.role === "PATIENT") {
      const patientCode = await allocatePatientCode(tx);
      await tx.patientProfile.create({
        data: {
          userId: created.id,
          patientCode,
          fullName: input.fullName!,
          dateOfBirth: new Date(input.dateOfBirth!),
        },
      });
    } else if (input.role === "DOCTOR") {
      await tx.doctorProfile.create({
        data: {
          userId: created.id,
          fullName: input.fullName!,
          licenseNumber: input.licenseNumber!,
          licenseCountry: input.licenseCountry!.toUpperCase(),
          verificationStatus:
            config.NODE_ENV === "development"
              ? DoctorVerificationStatus.APPROVED
              : DoctorVerificationStatus.PENDING,
        },
      });
    }

    return created;
  });

  const { code } = await issueOtp({ userId: user.id, phoneE164: phone, purpose: "registration" });

  await recordAudit({
    action: AuditAction.USER_REGISTERED,
    actorUserId: user.id,
    subjectUserId: user.id,
    metadata: { role: input.role },
    ipAddress: ctx.ipAddress ?? null,
    userAgent: ctx.userAgent ?? null,
  });

  return { userId: user.id, devOtp: config.SMS_PROVIDER === "mock" ? code : undefined };
}

// ──────────────────────────────────────────────────────────────────────────────
// OTP issue / verify
// ──────────────────────────────────────────────────────────────────────────────

async function issueOtp(args: { userId: string; phoneE164: string; purpose: "registration" | "login" | "password_reset" }): Promise<{ code: string }> {
  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const expiresAt = otpExpiryDate();

  // Invalidate any prior unused OTPs for this user+purpose so only the latest is valid.
  await prisma.otpCode.updateMany({
    where: { userId: args.userId, purpose: args.purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  await prisma.otpCode.create({
    data: { userId: args.userId, codeHash, purpose: args.purpose, expiresAt },
  });

  await getSmsProvider().send({
    toE164: args.phoneE164,
    body: `Your MediVault verification code is ${code}. It expires in ${Math.floor(config.OTP_TTL_SECONDS / 60)} minutes.`,
  });

  return { code };
}

// ──────────────────────────────────────────────────────────────────────────────
// Resend OTP
//
// Reasons we need this:
//   - The 5-minute TTL is short. Users who don't see the SMS land here.
//   - A fresh registration that hits the verify screen but loses the OTP has
//     no other recovery path short of starting over with a new email.
//
// Rate limit: hard 60s cooldown per (user, purpose). Looks at the most
// recently-issued OTP timestamp — that's already in otpCodes.createdAt.
// We don't trust the request layer because a sophisticated attacker can rotate
// IPs; the per-user cooldown is the real defense against SMS-bombing a victim.
// ──────────────────────────────────────────────────────────────────────────────

const RESEND_COOLDOWN_MS = 60_000;

export async function resendOtp(
  args: { userId: string; purpose: "registration" | "login" | "password_reset" },
  ctx: RequestContext,
): Promise<{ resent: true; cooldownSeconds: number; devOtp?: string }> {
  const user = await prisma.user.findUnique({ where: { id: args.userId } });
  if (!user) throw errors.userNotFound();

  // State guard: "registration" only makes sense for PENDING_OTP. For login
  // and password_reset (when we add them), allow ACTIVE.
  if (args.purpose === "registration" && user.status !== AccountStatus.PENDING_OTP) {
    throw errors.otpResendInvalidState();
  }
  if (args.purpose !== "registration" && user.status !== AccountStatus.ACTIVE) {
    throw errors.otpResendInvalidState();
  }

  // Cooldown: reject if the most recent OTP was issued less than 60s ago.
  const last = await prisma.otpCode.findFirst({
    where: { userId: user.id, purpose: args.purpose },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (last) {
    const elapsed = Date.now() - last.createdAt.getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      throw errors.otpResendCooldown(Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000));
    }
  }

  const { code } = await issueOtp({ userId: user.id, phoneE164: user.phoneE164, purpose: args.purpose });

  await recordAudit({
    action: AuditAction.USER_REGISTERED, // closest existing action — could be its own value later
    actorUserId: user.id,
    subjectUserId: user.id,
    metadata: { event: "otp_resent", purpose: args.purpose },
    ipAddress: ctx.ipAddress ?? null,
    userAgent: ctx.userAgent ?? null,
  });

  return {
    resent: true,
    cooldownSeconds: Math.floor(RESEND_COOLDOWN_MS / 1000),
    devOtp: config.SMS_PROVIDER === "mock" ? code : undefined,
  };
}

export async function verifyOtp(
  args: { userId: string; code: string; purpose: "registration" | "login" | "password_reset" },
  ctx: RequestContext,
): Promise<{ accessToken: string; refreshToken: string; userId: string; role: UserRole }> {
  const otp = await prisma.otpCode.findFirst({
    where: { userId: args.userId, purpose: args.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) throw errors.otpInvalid();
  if (otp.expiresAt < new Date()) throw errors.otpExpired();
  if (otp.attempts >= config.OTP_MAX_ATTEMPTS) throw errors.otpAttemptsExceeded();

  const submittedHash = hashOtpCode(args.code);
  if (submittedHash !== otp.codeHash) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw errors.otpInvalid();
  }

  const user = await prisma.$transaction(async (tx) => {
    await tx.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    return tx.user.update({
      where: { id: args.userId },
      data: args.purpose === "registration" ? { status: AccountStatus.ACTIVE } : {},
    });
  });

  const tokens = await issueSessionTokens(user, ctx);

  await recordAudit({
    action: AuditAction.USER_LOGIN,
    actorUserId: user.id,
    subjectUserId: user.id,
    metadata: { method: "otp", purpose: args.purpose },
    ipAddress: ctx.ipAddress ?? null,
    userAgent: ctx.userAgent ?? null,
  });

  return { ...tokens, userId: user.id, role: user.role };
}

// ──────────────────────────────────────────────────────────────────────────────
// LOGIN (email/phone + password)
// ──────────────────────────────────────────────────────────────────────────────

// Static dummy hash used to give "user not found" the same compute cost as a
// real lookup. Mitigates user enumeration via response timing.
const DUMMY_HASH = "$2a$12$abcdefghijklmnopqrstuOJvJX7XQ3.kEBP5N2PQ7FQq3/LpW2Xh.";

export async function login(
  args: { emailOrPhone: string; password: string },
  ctx: RequestContext,
): Promise<{ accessToken: string; refreshToken: string; userId: string; role: UserRole }> {
  const ident = args.emailOrPhone.trim();
  const isEmail = ident.includes("@");

  const user = await prisma.user.findFirst({
    where: isEmail ? { email: ident.toLowerCase() } : { phoneE164: ident },
  });

  const ok = await verifyPassword(args.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await recordAudit({
      action: AuditAction.USER_LOGIN_FAILED,
      actorUserId: user?.id ?? null,
      metadata: { reason: !user ? "no_user" : "bad_password" },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    throw errors.invalidCredentials();
  }

  if (user.status !== AccountStatus.ACTIVE) throw errors.accountInactive();

  const tokens = await issueSessionTokens(user, ctx);

  await recordAudit({
    action: AuditAction.USER_LOGIN,
    actorUserId: user.id,
    subjectUserId: user.id,
    metadata: { method: "password" },
    ipAddress: ctx.ipAddress ?? null,
    userAgent: ctx.userAgent ?? null,
  });

  return { ...tokens, userId: user.id, role: user.role };
}

// ──────────────────────────────────────────────────────────────────────────────
// REFRESH (rotation with reuse detection)
// ──────────────────────────────────────────────────────────────────────────────

export async function refreshSession(
  args: { refreshToken: string },
  ctx: RequestContext,
): Promise<{ accessToken: string; refreshToken: string }> {
  const tokenHash = hashRefreshToken(args.refreshToken);
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!row) throw errors.refreshInvalid();

  // Reuse of a revoked token suggests theft. Revoke the entire chain rooted at
  // its ancestor so an attacker who replayed an old token loses access too.
  if (row.revokedAt || row.expiresAt < new Date()) {
    await revokeChain(row.userId, row.id);
    throw errors.refreshInvalid();
  }

  const newPair = generateRefreshToken();
  const refreshExpires = new Date(Date.now() + ttlToMillis(config.JWT_REFRESH_TTL));

  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } }),
    prisma.refreshToken.create({
      data: {
        userId: row.userId,
        tokenHash: newPair.hash,
        parentId: row.id,
        expiresAt: refreshExpires,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    }),
  ]);

  const accessToken = signAccessToken({
    sub: row.user.id,
    role: row.user.role,
    hipaaTenant: row.user.hipaaTenant,
  });

  return { accessToken, refreshToken: newPair.plain };
}

// ──────────────────────────────────────────────────────────────────────────────
// LOGOUT
// ──────────────────────────────────────────────────────────────────────────────

export async function logout(args: { refreshToken: string }): Promise<void> {
  const tokenHash = hashRefreshToken(args.refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────────────────────────

async function issueSessionTokens(
  user: { id: string; role: UserRole; hipaaTenant: boolean },
  ctx: RequestContext,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken({ sub: user.id, role: user.role, hipaaTenant: user.hipaaTenant });
  const refresh = generateRefreshToken();
  const expiresAt = new Date(Date.now() + ttlToMillis(config.JWT_REFRESH_TTL));

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  });

  return { accessToken, refreshToken: refresh.plain };
}

async function revokeChain(userId: string, fromId: string): Promise<void> {
  // Walk parent_id back to the chain root, then revoke every descendant.
  // For now we revoke ALL refresh tokens for the user as a sledgehammer fix —
  // safer than a partial revoke if the chain logic has a bug.
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  void fromId; // chain-precise revoke is a follow-up
}
