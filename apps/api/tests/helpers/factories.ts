import type { FastifyInstance } from "fastify";
import { DoctorVerificationStatus } from "@prisma/client";
import { testPrisma } from "../setup.js";

// ──────────────────────────────────────────────────────────────────────────────
// Factories — register + activate users for tests. The OTP path in the real
// flow involves SMS; here we go through the API to register, then directly
// flip status to ACTIVE so tests don't have to know any OTP codes.
// ──────────────────────────────────────────────────────────────────────────────

export async function registerAndActivatePatient(
  app: FastifyInstance,
  overrides: Partial<{ email: string; phoneE164: string; password: string; fullName: string }> = {},
): Promise<{ userId: string; email: string; password: string; patientCode: string }> {
  const email = overrides.email ?? `patient-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const phoneE164 = overrides.phoneE164 ?? `+1202555${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
  const password = overrides.password ?? "hunter22test";
  const fullName = overrides.fullName ?? "Test Patient";

  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { email, phoneE164, password, role: "PATIENT", fullName, dateOfBirth: "1990-01-01" },
  });
  if (res.statusCode !== 201) throw new Error(`registration failed: ${res.statusCode} ${res.body}`);
  const { userId } = res.json() as { userId: string };

  await testPrisma.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
  const profile = await testPrisma.patientProfile.findUniqueOrThrow({
    where: { userId },
    select: { patientCode: true },
  });

  return { userId, email, password, patientCode: profile.patientCode };
}

export async function registerAndApproveDoctor(
  app: FastifyInstance,
  overrides: Partial<{ email: string; phoneE164: string; password: string; fullName: string; licenseNumber: string }> = {},
): Promise<{ userId: string; email: string; password: string }> {
  const email = overrides.email ?? `doctor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const phoneE164 = overrides.phoneE164 ?? `+1202666${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
  const password = overrides.password ?? "hunter22test";
  const fullName = overrides.fullName ?? "Test Doctor";
  const licenseNumber = overrides.licenseNumber ?? `IL-${Math.floor(Math.random() * 100000)}`;

  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { email, phoneE164, password, role: "DOCTOR", fullName, licenseNumber, licenseCountry: "US" },
  });
  if (res.statusCode !== 201) throw new Error(`doctor registration failed: ${res.statusCode} ${res.body}`);
  const { userId } = res.json() as { userId: string };

  await testPrisma.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
  await testPrisma.doctorProfile.update({
    where: { userId },
    data: { verificationStatus: DoctorVerificationStatus.APPROVED, verifiedAt: new Date() },
  });

  return { userId, email, password };
}

export async function login(
  app: FastifyInstance,
  emailOrPhone: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { emailOrPhone, password },
  });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  return res.json() as { accessToken: string; refreshToken: string };
}

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
