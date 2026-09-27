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

const SHA256_HEX = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // SHA-256 of empty
const SIZE_BYTES = 1024;

describe("records upload + access", () => {
  it("presign + confirm creates a record and writes RECORD_UPLOADED audit", async () => {
    const { email, password, userId } = await registerAndActivatePatient(app);
    const { accessToken } = await login(app, email, password);
    const headers = bearer(accessToken);

    const presign = await app.inject({
      method: "POST",
      url: "/v1/records/presign",
      headers,
      payload: { mimeType: "application/pdf", sizeBytes: SIZE_BYTES, sha256: SHA256_HEX },
    });
    expect(presign.statusCode).toBe(200);
    const { uploadUrl, s3Key } = presign.json() as { uploadUrl: string; s3Key: string };
    expect(uploadUrl).toMatch(/^https?:\/\//);
    expect(s3Key).toMatch(/^patients\//);

    const confirm = await app.inject({
      method: "POST",
      url: "/v1/records/confirm",
      headers,
      payload: {
        s3Key,
        category: "PRESCRIPTION",
        title: "Test Prescription",
        mimeType: "application/pdf",
        sizeBytes: SIZE_BYTES,
        sha256: SHA256_HEX,
      },
    });
    expect(confirm.statusCode).toBe(201);
    const recordId = (confirm.json() as { recordId: string }).recordId;
    expect(recordId).toMatch(/[0-9a-f-]{36}/);

    const audit = await testPrisma.auditLog.findMany({
      where: { action: "RECORD_UPLOADED", subjectUserId: userId },
    });
    expect(audit).toHaveLength(1);
  });

  it("confirm rejects an s3Key prefixed with a different patient's id", async () => {
    const alice = await registerAndActivatePatient(app);
    const aliceLogin = await login(app, alice.email, alice.password);
    const aliceHeaders = bearer(aliceLogin.accessToken);

    const forgedKey = "patients/00000000-0000-0000-0000-000000000000/2026-05-12/forged.pdf";
    const confirm = await app.inject({
      method: "POST",
      url: "/v1/records/confirm",
      headers: aliceHeaders,
      payload: {
        s3Key: forgedKey,
        category: "OTHER",
        title: "forged",
        mimeType: "application/pdf",
        sizeBytes: SIZE_BYTES,
        sha256: SHA256_HEX,
      },
    });
    expect(confirm.statusCode).toBe(403);
  });

  it("list, get, delete (soft) by owning patient", async () => {
    const { email, password } = await registerAndActivatePatient(app);
    const { accessToken } = await login(app, email, password);
    const headers = bearer(accessToken);

    const presign = await app.inject({
      method: "POST",
      url: "/v1/records/presign",
      headers,
      payload: { mimeType: "application/pdf", sizeBytes: SIZE_BYTES, sha256: SHA256_HEX },
    });
    const { s3Key } = presign.json() as { s3Key: string };

    const confirm = await app.inject({
      method: "POST",
      url: "/v1/records/confirm",
      headers,
      payload: {
        s3Key,
        category: "LAB_RESULT",
        title: "Q2 Bloodwork",
        mimeType: "application/pdf",
        sizeBytes: SIZE_BYTES,
        sha256: SHA256_HEX,
      },
    });
    const recordId = (confirm.json() as { recordId: string }).recordId;

    const list = await app.inject({ method: "GET", url: "/v1/records", headers });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { items: unknown[] }).items).toHaveLength(1);

    const got = await app.inject({ method: "GET", url: `/v1/records/${recordId}`, headers });
    expect(got.statusCode).toBe(200);

    const view = await app.inject({ method: "GET", url: `/v1/records/${recordId}/view-url`, headers });
    expect(view.statusCode).toBe(200);
    expect((view.json() as { url: string }).url).toMatch(/^https?:\/\//);

    const del = await app.inject({ method: "DELETE", url: `/v1/records/${recordId}`, headers });
    expect(del.statusCode).toBe(204);

    const afterDel = await app.inject({ method: "GET", url: `/v1/records/${recordId}`, headers });
    expect(afterDel.statusCode).toBe(404);
    const listEmpty = await app.inject({ method: "GET", url: "/v1/records", headers });
    expect((listEmpty.json() as { items: unknown[] }).items).toHaveLength(0);
  });

  it("doctor with active grant can list patient records; cannot without it", async () => {
    const patient = await registerAndActivatePatient(app);
    const doctor = await registerAndApproveDoctor(app);

    const patientTokens = await login(app, patient.email, patient.password);
    const doctorTokens = await login(app, doctor.email, doctor.password);

    // Patient uploads a record
    const presign = await app.inject({
      method: "POST",
      url: "/v1/records/presign",
      headers: bearer(patientTokens.accessToken),
      payload: { mimeType: "application/pdf", sizeBytes: SIZE_BYTES, sha256: SHA256_HEX },
    });
    const { s3Key } = presign.json() as { s3Key: string };
    await app.inject({
      method: "POST",
      url: "/v1/records/confirm",
      headers: bearer(patientTokens.accessToken),
      payload: {
        s3Key,
        category: "CONSULTATION_NOTE",
        title: "Visit note",
        mimeType: "application/pdf",
        sizeBytes: SIZE_BYTES,
        sha256: SHA256_HEX,
      },
    });

    // Without permission, doctor sees 403
    const noPerm = await app.inject({
      method: "GET",
      url: `/v1/patients/${patient.patientCode}/records`,
      headers: bearer(doctorTokens.accessToken),
    });
    expect(noPerm.statusCode).toBe(403);

    // Grant
    const req = await app.inject({
      method: "POST",
      url: "/v1/access/request",
      headers: bearer(doctorTokens.accessToken),
      payload: { patientCode: patient.patientCode },
    });
    const permId = (req.json() as { id: string }).id;
    await app.inject({
      method: "POST",
      url: `/v1/access/${permId}/approve`,
      headers: bearer(patientTokens.accessToken),
      payload: { duration: "HOURS_24" },
    });

    const withPerm = await app.inject({
      method: "GET",
      url: `/v1/patients/${patient.patientCode}/records`,
      headers: bearer(doctorTokens.accessToken),
    });
    expect(withPerm.statusCode).toBe(200);
    expect((withPerm.json() as { items: unknown[] }).items).toHaveLength(1);
  });

  it("validates mimeType and sizeBytes", async () => {
    const { email, password } = await registerAndActivatePatient(app);
    const { accessToken } = await login(app, email, password);

    const badMime = await app.inject({
      method: "POST",
      url: "/v1/records/presign",
      headers: bearer(accessToken),
      payload: { mimeType: "application/zip", sizeBytes: 1024, sha256: SHA256_HEX },
    });
    expect(badMime.statusCode).toBe(400);

    const tooBig = await app.inject({
      method: "POST",
      url: "/v1/records/presign",
      headers: bearer(accessToken),
      payload: { mimeType: "application/pdf", sizeBytes: 26 * 1024 * 1024, sha256: SHA256_HEX },
    });
    expect(tooBig.statusCode).toBe(400);
  });
});
