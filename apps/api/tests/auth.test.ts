import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "./helpers/test-app.js";
import { bearer, login, registerAndActivatePatient } from "./helpers/factories.js";
import { testPrisma } from "./setup.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe("auth", () => {
  it("register → activate (out of band) → login → /me", async () => {
    const { email, password, patientCode } = await registerAndActivatePatient(app, {
      email: "alice-test@example.com",
      fullName: "Alice Test",
    });
    expect(patientCode).toMatch(/^MVK-\d{4}-\d{5}$/);

    const { accessToken } = await login(app, email, password);
    expect(accessToken).toBeTruthy();

    const me = await app.inject({ method: "GET", url: "/v1/me", headers: bearer(accessToken) });
    expect(me.statusCode).toBe(200);
    const body = me.json() as { email: string; role: string; patientProfile: { patientCode: string } | null };
    expect(body.email).toBe("alice-test@example.com");
    expect(body.role).toBe("PATIENT");
    expect(body.patientProfile?.patientCode).toBe(patientCode);
  });

  it("login with wrong password fails with 401", async () => {
    const { email } = await registerAndActivatePatient(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { emailOrPhone: email, password: "wrong-password-123" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("login fails for an account in PENDING_OTP status", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "pending@example.com",
        phoneE164: "+12025551234",
        password: "hunter22test",
        role: "PATIENT",
        fullName: "Pending User",
        dateOfBirth: "1990-01-01",
      },
    });
    expect(res.statusCode).toBe(201);
    // Do NOT activate — try to log in immediately.
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { emailOrPhone: "pending@example.com", password: "hunter22test" },
    });
    // Per spec: cannot log in until OTP verified. Either 401 or 403 acceptable.
    expect([401, 403]).toContain(login.statusCode);
  });

  it("/me requires a valid bearer token", async () => {
    const noAuth = await app.inject({ method: "GET", url: "/v1/me" });
    expect(noAuth.statusCode).toBe(401);

    const badToken = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(badToken.statusCode).toBe(401);
  });

  it("audit log records USER_REGISTERED on registration", async () => {
    const { userId } = await registerAndActivatePatient(app, { email: "audit-test@example.com" });
    const rows = await testPrisma.auditLog.findMany({
      where: { action: "USER_REGISTERED", subjectUserId: userId },
    });
    expect(rows.length).toBeGreaterThan(0);
  });

  it("resend-otp: PENDING_OTP user can request a fresh code; cooldown enforced", async () => {
    const reg = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "resend-test@example.com",
        phoneE164: "+12028880777",
        password: "hunter22test",
        role: "PATIENT",
        fullName: "Resend Test",
        dateOfBirth: "1990-01-01",
      },
    });
    expect(reg.statusCode).toBe(201);
    const userId = (reg.json() as { userId: string }).userId;

    // First resend immediately after register hits cooldown.
    const tooSoon = await app.inject({
      method: "POST",
      url: "/v1/auth/resend-otp",
      payload: { userId, purpose: "registration" },
    });
    expect(tooSoon.statusCode).toBe(429);
    expect((tooSoon.json() as { error: string }).error).toBe("otp_resend_cooldown");

    // Backdate the existing OTP so the cooldown has elapsed.
    await testPrisma.otpCode.updateMany({
      where: { userId },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });

    const ok = await app.inject({
      method: "POST",
      url: "/v1/auth/resend-otp",
      payload: { userId, purpose: "registration" },
    });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as { resent: boolean }).resent).toBe(true);

    // Two OTPs exist; the older one is invalidated (consumedAt set), latest is fresh.
    const codes = await testPrisma.otpCode.findMany({
      where: { userId, purpose: "registration" },
      orderBy: { createdAt: "desc" },
    });
    expect(codes.length).toBe(2);
    expect(codes[0]?.consumedAt).toBeNull();
    expect(codes[1]?.consumedAt).not.toBeNull();
  });

  it("resend-otp: rejects wrong account state", async () => {
    const { userId } = await registerAndActivatePatient(app, { email: "active-resend@example.com" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/resend-otp",
      payload: { userId, purpose: "registration" },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("otp_resend_invalid_state");
  });

  it("resend-otp: returns 404 for unknown user", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/resend-otp",
      payload: { userId: "00000000-0000-0000-0000-000000000000", purpose: "registration" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("validates email format and password length", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "not-an-email",
        phoneE164: "+12025551234",
        password: "short",
        role: "PATIENT",
        fullName: "Bad",
      },
    });
    expect(bad.statusCode).toBe(400);
    const body = bad.json() as { error: string; issues?: unknown[] };
    expect(body.error).toBe("validation_error");
  });
});
