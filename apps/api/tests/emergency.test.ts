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

describe("emergency QR endpoint (public, unauthenticated)", () => {
  it("returns disclosed fields for an active patient", async () => {
    const { patientCode } = await registerAndActivatePatient(app, { fullName: "Alice Patient" });
    // Seed some clinical data directly to keep the test self-contained.
    await testPrisma.patientProfile.update({
      where: { patientCode },
      data: {
        bloodType: "O+",
        allergiesFhir: [
          {
            resourceType: "AllergyIntolerance",
            code: { text: "Penicillin" },
            reaction: [{ manifestation: [{ text: "rash" }] }],
          },
        ],
        emergencyContact: { name: "Jane Doe", phone: "+15555550199", relationship: "Spouse" },
      },
    });

    const res = await app.inject({ method: "GET", url: `/v1/emergency/${patientCode}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      patientCode: string;
      name: string;
      bloodType: string | null;
      allergies: string[] | null;
      emergencyContact: { name: string } | null;
      disclaimer: string;
    };
    expect(body.patientCode).toBe(patientCode);
    expect(body.name).toBe("Alice P.");
    expect(body.bloodType).toBe("O+");
    expect(body.allergies).toEqual(["Penicillin (rash)"]);
    expect(body.emergencyContact?.name).toBe("Jane Doe");
    expect(body.disclaimer).toMatch(/AI|verify|emergency/i);
  });

  it("returns 404 for unknown patient code", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/emergency/MVK-2099-99999" });
    expect(res.statusCode).toBe(404);
  });

  it("validates patient code format", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/emergency/not-a-code" });
    expect(res.statusCode).toBe(400);
  });

  it("hides fields the patient toggled off", async () => {
    const { email, password, patientCode } = await registerAndActivatePatient(app);
    await testPrisma.patientProfile.update({
      where: { patientCode },
      data: { bloodType: "AB+" },
    });
    const { accessToken } = await login(app, email, password);

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/me/emergency-disclosure",
      headers: bearer(accessToken),
      payload: { bloodType: false, emergencyContact: false },
    });
    expect(patch.statusCode).toBe(200);

    const view = await app.inject({ method: "GET", url: `/v1/emergency/${patientCode}` });
    expect(view.statusCode).toBe(200);
    const body = view.json() as { bloodType: string | null; emergencyContact: unknown | null; allergies: unknown };
    expect(body.bloodType).toBeNull();
    expect(body.emergencyContact).toBeNull();
    // allergies stays disclosed (default true)
    expect(body.allergies).not.toBeNull();
  });

  it("writes EMERGENCY_VIEW audit row on every scan", async () => {
    const { patientCode, userId } = await registerAndActivatePatient(app);
    await app.inject({ method: "GET", url: `/v1/emergency/${patientCode}` });
    await app.inject({ method: "GET", url: `/v1/emergency/${patientCode}` });
    const rows = await testPrisma.auditLog.findMany({
      where: { action: "EMERGENCY_VIEW", subjectUserId: userId },
    });
    expect(rows.length).toBe(2);
    // No actor on a public scan.
    expect(rows[0]!.actorUserId).toBeNull();
  });

  it("PATCH disclosure rejects DOCTOR users (PATIENT role only)", async () => {
    const { email, password, patientCode } = await registerAndActivatePatient(app);
    const _ = patientCode;
    void _;
    const { accessToken } = await login(app, email, password);
    expect(accessToken).toBeTruthy();
    // Sanity: PATIENT can call it
    const patient = await app.inject({
      method: "PATCH",
      url: "/v1/me/emergency-disclosure",
      headers: bearer(accessToken),
      payload: { bloodType: false },
    });
    expect(patient.statusCode).toBe(200);

    // Now a doctor — should be 403
    const doctorReg = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "doc-emerg@example.com",
        phoneE164: "+12027770001",
        password: "hunter22test",
        role: "DOCTOR",
        fullName: "Dr Test",
        licenseNumber: "IL-99001",
        licenseCountry: "US",
      },
    });
    expect(doctorReg.statusCode).toBe(201);
    const doctorId = (doctorReg.json() as { userId: string }).userId;
    await testPrisma.user.update({ where: { id: doctorId }, data: { status: "ACTIVE" } });
    const doctorLogin = await login(app, "doc-emerg@example.com", "hunter22test");

    const doctor = await app.inject({
      method: "PATCH",
      url: "/v1/me/emergency-disclosure",
      headers: bearer(doctorLogin.accessToken),
      payload: { bloodType: false },
    });
    expect(doctor.statusCode).toBe(403);
  });
});
