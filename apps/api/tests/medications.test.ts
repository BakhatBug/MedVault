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

async function patientAuth(app: FastifyInstance) {
  const { email, password, patientCode } = await registerAndActivatePatient(app);
  const { accessToken } = await login(app, email, password);
  return { accessToken, patientCode };
}

describe("medications CRUD + state machine", () => {
  it("add → list → update → discontinue → soft-delete", async () => {
    const { accessToken } = await patientAuth(app);
    const headers = bearer(accessToken);

    const created = await app.inject({
      method: "POST",
      url: "/v1/medications",
      headers,
      payload: { name: "Lisinopril", dosage: "10mg", frequency: "once daily", startDate: "2026-04-12" },
    });
    expect(created.statusCode).toBe(201);
    const medId = (created.json() as { id: string }).id;
    expect(medId).toMatch(/[0-9a-f-]{36}/);

    const listed = await app.inject({ method: "GET", url: "/v1/medications", headers });
    expect(listed.statusCode).toBe(200);
    const list = listed.json() as { items: Array<{ name: string; isActive: boolean }> };
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.name).toBe("Lisinopril");
    expect(list.items[0]?.isActive).toBe(true);

    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/medications/${medId}`,
      headers,
      payload: { frequency: "twice daily" },
    });
    expect(updated.statusCode).toBe(200);
    expect((updated.json() as { frequency: string }).frequency).toBe("twice daily");

    const discontinued = await app.inject({
      method: "POST",
      url: `/v1/medications/${medId}/discontinue`,
      headers,
      payload: { reason: "switched to alternative" },
    });
    expect(discontinued.statusCode).toBe(204);

    const afterDiscontinue = await app.inject({ method: "GET", url: "/v1/medications", headers });
    expect((afterDiscontinue.json() as { items: unknown[] }).items).toHaveLength(0);

    const withHistory = await app.inject({
      method: "GET",
      url: "/v1/medications?includeInactive=true",
      headers,
    });
    expect((withHistory.json() as { items: Array<{ isActive: boolean }> }).items[0]?.isActive).toBe(false);

    const deleted = await app.inject({ method: "DELETE", url: `/v1/medications/${medId}`, headers });
    expect(deleted.statusCode).toBe(204);

    const after = await app.inject({ method: "GET", url: `/v1/medications/${medId}`, headers });
    expect(after.statusCode).toBe(404);
  });

  it("PATCH on a discontinued medication is rejected with 409", async () => {
    const { accessToken } = await patientAuth(app);
    const headers = bearer(accessToken);

    const created = await app.inject({
      method: "POST",
      url: "/v1/medications",
      headers,
      payload: { name: "TestDrug", dosage: "5mg" },
    });
    const medId = (created.json() as { id: string }).id;

    await app.inject({
      method: "POST",
      url: `/v1/medications/${medId}/discontinue`,
      headers,
      payload: {},
    });

    const patch = await app.inject({
      method: "PATCH",
      url: `/v1/medications/${medId}`,
      headers,
      payload: { dosage: "10mg" },
    });
    expect(patch.statusCode).toBe(409);
  });

  it("cannot read another patient's medications", async () => {
    const alice = await patientAuth(app);
    const bob = await patientAuth(app);

    await app.inject({
      method: "POST",
      url: "/v1/medications",
      headers: bearer(alice.accessToken),
      payload: { name: "AliceMed" },
    });

    const bobList = await app.inject({
      method: "GET",
      url: "/v1/medications",
      headers: bearer(bob.accessToken),
    });
    expect(bobList.statusCode).toBe(200);
    expect((bobList.json() as { items: unknown[] }).items).toHaveLength(0);
  });

  it("audit chain: ADDED + UPDATED + DISCONTINUED + DELETED", async () => {
    const { accessToken, patientCode } = await patientAuth(app);
    const headers = bearer(accessToken);
    const _ = patientCode;
    void _;

    const created = await app.inject({
      method: "POST",
      url: "/v1/medications",
      headers,
      payload: { name: "AuditMed", dosage: "1mg" },
    });
    const medId = (created.json() as { id: string }).id;

    await app.inject({ method: "PATCH", url: `/v1/medications/${medId}`, headers, payload: { dosage: "2mg" } });
    await app.inject({ method: "POST", url: `/v1/medications/${medId}/discontinue`, headers, payload: {} });
    await app.inject({ method: "DELETE", url: `/v1/medications/${medId}`, headers });

    const audit = await testPrisma.auditLog.findMany({
      where: { action: { in: ["MEDICATION_ADDED", "MEDICATION_UPDATED", "MEDICATION_DISCONTINUED", "MEDICATION_DELETED"] } },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((a) => a.action)).toEqual([
      "MEDICATION_ADDED",
      "MEDICATION_UPDATED",
      "MEDICATION_DISCONTINUED",
      "MEDICATION_DELETED",
    ]);
  });

  it("validates required fields", async () => {
    const { accessToken } = await patientAuth(app);
    const headers = bearer(accessToken);

    const missingName = await app.inject({
      method: "POST",
      url: "/v1/medications",
      headers,
      payload: { dosage: "10mg" },
    });
    expect(missingName.statusCode).toBe(400);
  });

  it("PATCH role-gates: a DOCTOR cannot POST to /v1/medications", async () => {
    const docReg = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "doc-med@example.com",
        phoneE164: "+12029990001",
        password: "hunter22test",
        role: "DOCTOR",
        fullName: "Med Doc",
        licenseNumber: "IL-MED-1",
        licenseCountry: "US",
      },
    });
    const doctorId = (docReg.json() as { userId: string }).userId;
    await testPrisma.user.update({ where: { id: doctorId }, data: { status: "ACTIVE" } });
    const docTokens = await login(app, "doc-med@example.com", "hunter22test");

    const res = await app.inject({
      method: "POST",
      url: "/v1/medications",
      headers: bearer(docTokens.accessToken),
      payload: { name: "Forbidden" },
    });
    expect(res.statusCode).toBe(403);
  });
});
