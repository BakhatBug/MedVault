import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import * as authService from "../services/auth.js";
import { phoneE164 } from "@medivault/shared";

// ──────────────────────────────────────────────────────────────────────────────
// Body schemas
// ──────────────────────────────────────────────────────────────────────────────

const RegisterBody = z.object({
  email: z.string().email().max(254),
  phoneE164,
  password: z.string().min(8).max(128),
  role: z.enum(["PATIENT", "DOCTOR", "CAREGIVER"]),
  fullName: z.string().min(1).max(200).optional(),
  dateOfBirth: z.string().date().optional(),
  licenseNumber: z.string().min(1).max(100).optional(),
  licenseCountry: z.string().length(2).optional(),
});

const VerifyOtpBody = z.object({
  userId: z.string().uuid(),
  code: z.string().length(6).regex(/^\d{6}$/),
  purpose: z.enum(["registration", "login", "password_reset"]),
});

const ResendOtpBody = z.object({
  userId: z.string().uuid(),
  purpose: z.enum(["registration", "login", "password_reset"]),
});

const LoginBody = z.object({
  emailOrPhone: z.string().min(3).max(254),
  password: z.string().min(1).max(128),
});

const RefreshBody = z.object({
  refreshToken: z.string().min(10),
});

const LogoutBody = z.object({
  refreshToken: z.string().min(10),
});

function ctxFromReq(req: FastifyRequest): authService.RequestContext {
  return {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"] ?? null,
  };
}

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof authService.AuthError) {
    return reply.code(err.status).send({ error: err.code, message: err.message });
  }
  throw err;
}

// ──────────────────────────────────────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", async (req, reply) => {
    const body = RegisterBody.parse(req.body);
    try {
      const result = await authService.registerUser({
        email: body.email,
        phoneE164: body.phoneE164,
        password: body.password,
        role: body.role,
        fullName: body.fullName,
        dateOfBirth: body.dateOfBirth,
        licenseNumber: body.licenseNumber,
        licenseCountry: body.licenseCountry,
      }, ctxFromReq(req));
      return reply.code(201).send({
        userId: result.userId,
        devOtp: result.devOtp,
        nextStep: "verify_otp",
        message: "OTP sent. Call POST /auth/verify-otp with purpose='registration' to activate your account.",
      });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/auth/verify-otp", async (req, reply) => {
    const body = VerifyOtpBody.parse(req.body);
    try {
      const result = await authService.verifyOtp(body, ctxFromReq(req));
      return reply.code(200).send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/auth/resend-otp", async (req, reply) => {
    const body = ResendOtpBody.parse(req.body);
    try {
      const result = await authService.resendOtp(body, ctxFromReq(req));
      return reply.code(200).send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/auth/login", async (req, reply) => {
    const body = LoginBody.parse(req.body);
    try {
      const result = await authService.login(body, ctxFromReq(req));
      return reply.code(200).send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/auth/refresh", async (req, reply) => {
    const body = RefreshBody.parse(req.body);
    try {
      const result = await authService.refreshSession(body, ctxFromReq(req));
      return reply.code(200).send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/auth/logout", async (req, reply) => {
    const body = LogoutBody.parse(req.body);
    await authService.logout(body);
    return reply.code(204).send();
  });
}
