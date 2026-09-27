import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "./helpers/test-app.js";
import { bearer, login, registerAndActivatePatient, registerAndApproveDoctor } from "./helpers/factories.js";
import { testPrisma } from "./setup.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe("doctor access state machine", () => {
  it("request → patient approves → doctor reads → patient revokes → doctor blocked", async () => {
    const patient = await registerAndActivatePatient(app, { fullName: "Alice Test" });
    const doctor = await registerAndApproveDoctor(app, { fullName: "Bob Test" });

    const patientToken = (await login(app, patient.email, patient.password)).accessToken;
    const doctorToken = (await login(app, doctor.email, doctor.password)).accessToken;

    // Doctor requests access
    const reqRes = await app.inject({
      method: "POST",
      url: "/v1/access/request",
      headers: bearer(doctorToken),
      payload: { patientCode: patient.patientCode, note: "Follow-up consult" },
    });
    expect(reqRes.statusCode).toBe(201);
    const permission = reqRes.json() as { id: string; patientId: string; requestExpiresAt: string };
    expect(permission.id).toMatch(/[0-9a-f-]{36}/);

    // Doctor can't read yet — permission is REQUESTED, not APPROVED
    const before = await app.inject({
      method: "GET",
      url: `/v1/patients/${patient.patientCode}`,
      headers: bearer(doctorToken),
    });
    expect(before.statusCode).toBe(403);

    // Patient approves with HOURS_24
    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/access/${permission.id}/approve`,
      headers: bearer(patientToken),
      payload: { duration: "HOURS_24" },
    });
    expect(approveRes.statusCode).toBe(200);
    const approved = approveRes.json() as { status: string; expiresAt: string };
    expect(approved.status).toBe("APPROVED");
    expect(new Date(approved.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // Doctor can now read profile
    const profile = await app.inject({
      method: "GET",
      url: `/v1/patients/${patient.patientCode}`,
      headers: bearer(doctorToken),
    });
    expect(profile.statusCode).toBe(200);
    const profileBody = profile.json() as { patientCode: string };
    expect(profileBody.patientCode).toBe(patient.patientCode);

    // Patient revokes
    const revoke = await app.inject({
      method: "POST",
      url: `/v1/access/${permission.id}/revoke`,
      headers: bearer(patientToken),
      payload: {},
    });
    expect(revoke.statusCode).toBe(204);

    // Doctor blocked again
    const after = await app.inject({
      method: "GET",
      url: `/v1/patients/${patient.patientCode}`,
      headers: bearer(doctorToken),
    });
    expect(after.statusCode).toBe(403);
  });

  it("doctor can't request access until verified", async () => {
    // Register a doctor but DON'T approve.
    const pendingReg = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "pending-doc@example.com",
        phoneE164: "+12028880001",
        password: "hunter22test",
        role: "DOCTOR",
        fullName: "Pending Doc",
        licenseNumber: "IL-PEND-1",
        licenseCountry: "US",
      },
    });
    expect(pendingReg.statusCode).toBe(201);
    const doctorId = (pendingReg.json() as { userId: string }).userId;
    await testPrisma.user.update({ where: { id: doctorId }, data: { status: "ACTIVE" } });
    // Note: verification_status stays PENDING (factory not used).

    const patient = await registerAndActivatePatient(app);
    const token = (await login(app, "pending-doc@example.com", "hunter22test")).accessToken;

    const res = await app.inject({
      method: "POST",
      url: "/v1/access/request",
      headers: bearer(token),
      payload: { patientCode: patient.patientCode },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string };
    expect(body.error).toBe("doctor_not_verified");
  });

  it("rejects duplicate active requests with 409", async () => {
    const patient = await registerAndActivatePatient(app);
    const doctor = await registerAndApproveDoctor(app);
    const doctorToken = (await login(app, doctor.email, doctor.password)).accessToken;

    const first = await app.inject({
      method: "POST",
      url: "/v1/access/request",
      headers: bearer(doctorToken),
      payload: { patientCode: patient.patientCode },
    });
    expect(first.statusCode).toBe(201);

    const dup = await app.inject({
      method: "POST",
      url: "/v1/access/request",
      headers: bearer(doctorToken),
      payload: { patientCode: patient.patientCode },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("audit chain on full flow: requested → granted → revoked", async () => {
    const patient = await registerAndActivatePatient(app);
    const doctor = await registerAndApproveDoctor(app);
    const patientToken = (await login(app, patient.email, patient.password)).accessToken;
    const doctorToken = (await login(app, doctor.email, doctor.password)).accessToken;

    const reqRes = await app.inject({
      method: "POST",
      url: "/v1/access/request",
      headers: bearer(doctorToken),
      payload: { patientCode: patient.patientCode },
    });
    const permissionId = (reqRes.json() as { id: string }).id;

    await app.inject({
      method: "POST",
      url: `/v1/access/${permissionId}/approve`,
      headers: bearer(patientToken),
      payload: { duration: "DAYS_7" },
    });
    await app.inject({
      method: "POST",
      url: `/v1/access/${permissionId}/revoke`,
      headers: bearer(patientToken),
      payload: {},
    });

    const audit = await testPrisma.auditLog.findMany({
      where: { action: { in: ["ACCESS_REQUESTED", "ACCESS_GRANTED", "ACCESS_REVOKED"] } },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((a) => a.action)).toEqual(["ACCESS_REQUESTED", "ACCESS_GRANTED", "ACCESS_REVOKED"]);
  });
});
