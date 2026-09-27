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

async function registerAndActivateCaregiver(
  app: FastifyInstance,
  overrides: Partial<{ email: string; phoneE164: string; password: string; fullName: string }> = {},
): Promise<{ userId: string; email: string; password: string }> {
  const email = overrides.email ?? `caregiver-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const phoneE164 = overrides.phoneE164 ?? `+1202777${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
  const password = overrides.password ?? "hunter22test";
  const fullName = overrides.fullName ?? "Test Caregiver";
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { email, phoneE164, password, role: "CAREGIVER", fullName },
  });
  if (res.statusCode !== 201) throw new Error(`caregiver registration failed: ${res.statusCode} ${res.body}`);
  const userId = (res.json() as { userId: string }).userId;
  await testPrisma.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
  return { userId, email, password };
}

const SHA256_HEX = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("caregiver linking + scoped record actions", () => {
  it("invite → accept → caregiver reads patient records", async () => {
    const patient = await registerAndActivatePatient(app);
    const caregiver = await registerAndActivateCaregiver(app, { email: "carol-cg@example.com" });
    const patientTok = (await login(app, patient.email, patient.password)).accessToken;
    const caregiverTok = (await login(app, "carol-cg@example.com", caregiver.password)).accessToken;

    // Patient uploads a record
    const presign = await app.inject({
      method: "POST",
      url: "/v1/records/presign",
      headers: bearer(patientTok),
      payload: { mimeType: "application/pdf", sizeBytes: 1024, sha256: SHA256_HEX },
    });
    const { s3Key } = presign.json() as { s3Key: string };
    await app.inject({
      method: "POST",
      url: "/v1/records/confirm",
      headers: bearer(patientTok),
      payload: {
        s3Key,
        category: "OTHER",
        title: "Patient upload",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        sha256: SHA256_HEX,
      },
    });

    // Patient invites caregiver
    const invite = await app.inject({
      method: "POST",
      url: "/v1/caregivers/invite",
      headers: bearer(patientTok),
      payload: { caregiverEmail: "carol-cg@example.com" },
    });
    expect(invite.statusCode).toBe(201);
    const { id: linkId, status } = invite.json() as { id: string; status: string };
    expect(status).toBe("PENDING");

    // Caregiver can't read yet
    const before = await app.inject({
      method: "GET",
      url: `/v1/caregivers/patients/${patient.patientCode}/records`,
      headers: bearer(caregiverTok),
    });
    expect(before.statusCode).toBe(403);

    // Caregiver accepts
    const accept = await app.inject({
      method: "POST",
      url: `/v1/caregivers/${linkId}/accept`,
      headers: bearer(caregiverTok),
    });
    expect(accept.statusCode).toBe(204);

    // Caregiver can now read patient records
    const after = await app.inject({
      method: "GET",
      url: `/v1/caregivers/patients/${patient.patientCode}/records`,
      headers: bearer(caregiverTok),
    });
    expect(after.statusCode).toBe(200);
    expect((after.json() as { items: unknown[] }).items).toHaveLength(1);
  });

  it("caregiver upload-on-behalf creates a record with caregiver as actor", async () => {
    const patient = await registerAndActivatePatient(app);
    const caregiver = await registerAndActivateCaregiver(app, { email: "uploader-cg@example.com" });
    const patientTok = (await login(app, patient.email, patient.password)).accessToken;
    const caregiverTok = (await login(app, "uploader-cg@example.com", caregiver.password)).accessToken;

    // Patient invites + caregiver accepts
    const invite = await app.inject({
      method: "POST",
      url: "/v1/caregivers/invite",
      headers: bearer(patientTok),
      payload: { caregiverEmail: "uploader-cg@example.com" },
    });
    const linkId = (invite.json() as { id: string }).id;
    await app.inject({ method: "POST", url: `/v1/caregivers/${linkId}/accept`, headers: bearer(caregiverTok) });

    // Caregiver presigns + confirms
    const presign = await app.inject({
      method: "POST",
      url: `/v1/caregivers/patients/${patient.patientCode}/records/presign`,
      headers: bearer(caregiverTok),
      payload: { mimeType: "application/pdf", sizeBytes: 2048, sha256: SHA256_HEX },
    });
    expect(presign.statusCode).toBe(200);
    const { s3Key } = presign.json() as { s3Key: string };

    const confirm = await app.inject({
      method: "POST",
      url: `/v1/caregivers/patients/${patient.patientCode}/records/confirm`,
      headers: bearer(caregiverTok),
      payload: {
        s3Key,
        category: "DISCHARGE_SUMMARY",
        title: "ER visit (uploaded by caregiver)",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        sha256: SHA256_HEX,
      },
    });
    expect(confirm.statusCode).toBe(201);
    const recordId = (confirm.json() as { recordId: string }).recordId;

    // Patient sees the record (uploadedByUserId = caregiver, but it belongs to the patient)
    const list = await app.inject({ method: "GET", url: "/v1/records", headers: bearer(patientTok) });
    expect((list.json() as { items: Array<{ id: string }> }).items.map((r) => r.id)).toContain(recordId);

    // Audit row attributes caregiver as actor + adds uploadedBy metadata
    const audit = await testPrisma.auditLog.findFirst({
      where: { action: "RECORD_UPLOADED" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.actorUserId).toBe(caregiver.userId);
    expect((audit?.metadata as { uploadedBy?: string })?.uploadedBy).toBe("caregiver");
  });

  it("caregiver cannot forge an s3Key for a different patient", async () => {
    const patient = await registerAndActivatePatient(app);
    const caregiver = await registerAndActivateCaregiver(app, { email: "forge-cg@example.com" });
    const patientTok = (await login(app, patient.email, patient.password)).accessToken;
    const caregiverTok = (await login(app, "forge-cg@example.com", caregiver.password)).accessToken;

    const invite = await app.inject({
      method: "POST",
      url: "/v1/caregivers/invite",
      headers: bearer(patientTok),
      payload: { caregiverEmail: "forge-cg@example.com" },
    });
    const linkId = (invite.json() as { id: string }).id;
    await app.inject({ method: "POST", url: `/v1/caregivers/${linkId}/accept`, headers: bearer(caregiverTok) });

    const forged = await app.inject({
      method: "POST",
      url: `/v1/caregivers/patients/${patient.patientCode}/records/confirm`,
      headers: bearer(caregiverTok),
      payload: {
        s3Key: "patients/00000000-0000-0000-0000-000000000000/2026-05-12/forged.pdf",
        category: "OTHER",
        title: "forged",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        sha256: SHA256_HEX,
      },
    });
    expect(forged.statusCode).toBe(403);
  });

  it("revoke (either side) drops the caregiver's access", async () => {
    const patient = await registerAndActivatePatient(app);
    const caregiver = await registerAndActivateCaregiver(app, { email: "revoke-cg@example.com" });
    const patientTok = (await login(app, patient.email, patient.password)).accessToken;
    const caregiverTok = (await login(app, "revoke-cg@example.com", caregiver.password)).accessToken;

    const invite = await app.inject({
      method: "POST",
      url: "/v1/caregivers/invite",
      headers: bearer(patientTok),
      payload: { caregiverEmail: "revoke-cg@example.com" },
    });
    const linkId = (invite.json() as { id: string }).id;
    await app.inject({ method: "POST", url: `/v1/caregivers/${linkId}/accept`, headers: bearer(caregiverTok) });

    const beforeRevoke = await app.inject({
      method: "GET",
      url: `/v1/caregivers/patients/${patient.patientCode}/records`,
      headers: bearer(caregiverTok),
    });
    expect(beforeRevoke.statusCode).toBe(200);

    const revoke = await app.inject({
      method: "POST",
      url: `/v1/caregivers/${linkId}/revoke`,
      headers: bearer(patientTok),
    });
    expect(revoke.statusCode).toBe(204);

    const afterRevoke = await app.inject({
      method: "GET",
      url: `/v1/caregivers/patients/${patient.patientCode}/records`,
      headers: bearer(caregiverTok),
    });
    expect(afterRevoke.statusCode).toBe(403);
  });

  it("invite of a non-caregiver email returns 400", async () => {
    const patient = await registerAndActivatePatient(app);
    const patientTok = (await login(app, patient.email, patient.password)).accessToken;

    // Register a DOCTOR user, not a caregiver
    const docReg = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "doc-not-cg@example.com",
        phoneE164: "+12028880099",
        password: "hunter22test",
        role: "DOCTOR",
        fullName: "Doc",
        licenseNumber: "IL-NOTCG",
        licenseCountry: "US",
      },
    });
    const docId = (docReg.json() as { userId: string }).userId;
    await testPrisma.user.update({ where: { id: docId }, data: { status: "ACTIVE" } });

    const invite = await app.inject({
      method: "POST",
      url: "/v1/caregivers/invite",
      headers: bearer(patientTok),
      payload: { caregiverEmail: "doc-not-cg@example.com" },
    });
    expect(invite.statusCode).toBe(400);
    expect((invite.json() as { error: string }).error).toBe("not_caregiver_role");
  });

  it("invite of an unknown email returns 404 (does not leak existence)", async () => {
    const patient = await registerAndActivatePatient(app);
    const patientTok = (await login(app, patient.email, patient.password)).accessToken;

    const invite = await app.inject({
      method: "POST",
      url: "/v1/caregivers/invite",
      headers: bearer(patientTok),
      payload: { caregiverEmail: "nobody@example.com" },
    });
    expect(invite.statusCode).toBe(404);
  });

  it("duplicate active invite returns 409", async () => {
    const patient = await registerAndActivatePatient(app);
    const caregiver = await registerAndActivateCaregiver(app, { email: "dup-cg@example.com" });
    const _ = caregiver.userId;
    void _;
    const patientTok = (await login(app, patient.email, patient.password)).accessToken;

    const first = await app.inject({
      method: "POST",
      url: "/v1/caregivers/invite",
      headers: bearer(patientTok),
      payload: { caregiverEmail: "dup-cg@example.com" },
    });
    expect(first.statusCode).toBe(201);

    const dup = await app.inject({
      method: "POST",
      url: "/v1/caregivers/invite",
      headers: bearer(patientTok),
      payload: { caregiverEmail: "dup-cg@example.com" },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("audit chain: INVITED → ACCEPTED → REVOKED", async () => {
    const patient = await registerAndActivatePatient(app);
    const caregiver = await registerAndActivateCaregiver(app, { email: "audit-cg@example.com" });
    const _ = caregiver.userId;
    void _;
    const patientTok = (await login(app, patient.email, patient.password)).accessToken;
    const caregiverTok = (await login(app, "audit-cg@example.com", caregiver.password)).accessToken;

    const invite = await app.inject({
      method: "POST",
      url: "/v1/caregivers/invite",
      headers: bearer(patientTok),
      payload: { caregiverEmail: "audit-cg@example.com" },
    });
    const linkId = (invite.json() as { id: string }).id;
    await app.inject({ method: "POST", url: `/v1/caregivers/${linkId}/accept`, headers: bearer(caregiverTok) });
    await app.inject({ method: "POST", url: `/v1/caregivers/${linkId}/revoke`, headers: bearer(patientTok) });

    const audit = await testPrisma.auditLog.findMany({
      where: { action: { in: ["CAREGIVER_INVITED", "CAREGIVER_ACCEPTED", "CAREGIVER_REVOKED"] } },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((a) => a.action)).toEqual(["CAREGIVER_INVITED", "CAREGIVER_ACCEPTED", "CAREGIVER_REVOKED"]);
  });
});
