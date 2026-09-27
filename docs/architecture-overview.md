# MediVault — Architecture Overview

A single document that ties together what MediVault is, how it's built, and why.
Read this first; the ADRs in [`docs/adr/`](./adr/) hold the detailed reasoning
for each decision. Current as of v0.22.

---

## 1. What it is

MediVault is a **patient-centric personal health record (PHR)** platform. The
patient owns their data. Doctors get scoped, time-bounded, patient-approved
access. Caregivers act on behalf of a linked patient. A single public endpoint
serves an emergency QR for first responders.

This is deliberately *not* a clinic-side EHR (Epic, OpenEMR). The data model is
patient-owned, not encounter-owned — see [ADR 0001](./adr/0001-build-from-scratch-vs-fork-existing-emr.md).

---

## 2. System shape

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│ Mobile app  │     │  (future)   │     │  Emergency   │
│ Expo / RN   │     │ admin web   │     │  QR scanner  │
└──────┬──────┘     └──────┬──────┘     └──────┬───────┘
       │ HTTPS / Bearer JWT │                   │ public, no auth
       └─────────┬──────────┴───────────────────┘
                 ▼
        ┌──────────────────┐
        │  Fastify API     │  stateless, horizontally scalable
        │  (apps/api)      │
        └───┬────┬────┬────┘
            │    │    │
   ┌────────┘    │    └──────────┐
   ▼             ▼               ▼
┌──────┐   ┌──────────┐   ┌──────────────┐
│ RDS  │   │  Redis   │   │  S3 (files)  │
│ PG16 │   │ BullMQ + │   │  pre-signed  │
│      │   │  cache   │   │  URLs only   │
└──────┘   └────┬─────┘   └──────────────┘
                │ extraction jobs
                ▼
        ┌──────────────────┐      ┌──────────────┐
        │ Extraction worker│─────▶│ Gemini / AI  │
        │ (same container) │      │  provider    │
        └──────────────────┘      └──────────────┘
```

Key properties:

- **The API is stateless.** JWTs carry identity; refresh tokens and all state
  live in Postgres. Scale by adding instances behind the load balancer.
- **Files never pass through the API.** Clients upload directly to S3 via
  pre-signed URLs and download the same way. The API only ever issues URLs and
  stores metadata — see [ADR](./adr/) and spec §11.
- **AI work is asynchronous.** Upload returns immediately; a BullMQ worker picks
  up extraction jobs and calls the AI provider out of band.

---

## 3. The monorepo

```
apps/
  api/         Fastify HTTP API + Prisma + BullMQ worker
  mobile/      Expo React Native app (patient + doctor flows)
  admin/       reserved — not built
packages/
  shared/      FHIR R4 types, Zod schemas, patient-code helpers — used by api + mobile
docs/
  adr/         Architecture Decision Records (the "why")
  api/         OpenAPI spec + Postman collection
infra/         reserved for Terraform — not built
```

npm workspaces. The `shared` package is the contract between API and mobile —
a Zod schema change there propagates to both sides.

---

## 4. Stack and the reasoning

| Layer | Choice | ADR |
|---|---|---|
| Build vs fork | Build from scratch, borrow FHIR patterns | [0001](./adr/0001-build-from-scratch-vs-fork-existing-emr.md) |
| Backend | Node 20 + TypeScript + Fastify + Prisma | [0002](./adr/0002-stack-node-fastify-prisma.md) |
| AI provider | Abstraction over Gemini / Anthropic / Bedrock | [0003](./adr/0003-ai-provider-abstraction.md) |
| Clinical data shape | FHIR R4 in `jsonb` columns | [0004](./adr/0004-fhir-shaped-storage.md) |
| Compliance posture | Build to HIPAA + GDPR ceiling | [0005](./adr/0005-market-posture-hipaa-ceiling.md) |
| Mobile | Expo + expo-router + react-query | — |

---

## 5. Data model

13 tables. The spine:

- **`users`** — one row per account; `role` ∈ {PATIENT, DOCTOR, CAREGIVER, ADMIN}.
  `hipaaTenant` flag drives AI-provider routing.
- **`patient_profiles`** / **`doctor_profiles`** — role-specific 1:1 extensions.
  Patient gets the public `patientCode` (MVK-YYYY-NNNNN, allocated by a Postgres
  sequence).
- **`medical_records`** — file metadata + the AI-extracted FHIR `Bundle` in a
  `jsonb` column. The file itself is in S3, keyed by `s3Key`.
- **`medications`** — relational columns for queryable fields + a FHIR
  `MedicationRequest` in `jsonb`. `sourceRecordId` links a medication back to
  the prescription it was auto-extracted from.
- **`doctor_access_permissions`** — the access state machine
  (REQUESTED → APPROVED → EXPIRED/REVOKED).
- **`caregiver_links`** — the caregiver state machine (PENDING → ACTIVE → REVOKED).
- **`drug_interaction_checks`** / **`ai_summaries`** — cached AI output, keyed by
  a hash of the inputs so the model is only re-called when inputs change.
- **`ai_call_logs`** — every AI call: provider, model, tokens, latency, cost.
- **`audit_logs`** — append-only record of every sensitive action.

Clinical data is FHIR R4 shaped ([ADR 0004](./adr/0004-fhir-shaped-storage.md))
so a future move to a real FHIR server is a data copy, not a re-model.

---

## 6. The three roles and what they can do

| Role | Can | Cannot |
|---|---|---|
| **Patient** | Upload/view/delete own records, manage medications, grant/revoke doctor access, invite caregivers, control emergency disclosure | — |
| **Doctor** | Request access; once granted, view a patient's profile, records, medications, timeline, AI summary, drug interactions, and ask AI questions | Upload to a patient's vault, manage caregivers |
| **Caregiver** | View a linked patient's records, upload on their behalf | Grant doctor access, manage other caregivers |
| **Public** | Scan the emergency QR (patient-disclosed subset only) | Anything else |

Every cross-user data access is gated by an explicit, auditable permission row.

---

## 7. The two signature flows

### Patient uploads a document (spec §5.3)

```
1. Client → POST /v1/records/presign   → API returns a pre-signed S3 PUT URL
2. Client → PUT file directly to S3    (bypasses the API entirely)
3. Client → POST /v1/records/confirm   → API saves metadata, enqueues extraction
4. Worker → pulls file from S3 → Gemini → FHIR Bundle → saves to extractedFhir
5. Worker → promotes MedicationRequest entries into the medications table
6. Worker → triggers a drug-interaction re-check
```

From "photograph a prescription" to "structured data + interaction warnings" in
seconds, with zero manual data entry.

### Doctor accesses a patient (spec §5.4)

```
1. Doctor → POST /v1/access/request { patientCode }   → REQUESTED row + patient notified
2. Patient → POST /v1/access/{id}/approve { duration } → APPROVED, expires_at set
3. Doctor → GET /v1/patients/{code}/...                 → allowed while permission is active
4. Patient → POST /v1/access/{id}/revoke                → doctor's next call → 403
```

Access is always time-bounded (or explicitly PERMANENT with a revoke trail) and
expiry is enforced lazily on every read.

---

## 8. Security posture

Built to the HIPAA/GDPR ceiling ([ADR 0005](./adr/0005-market-posture-hipaa-ceiling.md))
regardless of launch market:

- JWT access tokens expire in 15 min; refresh tokens rotate and are revocable.
- Passwords: bcrypt, 12 rounds in production.
- OTP: 6-digit, 5-min TTL, 3-attempt lockout, 60s resend cooldown.
- TLS 1.3 at the load balancer; S3 SSE-AES256; RDS encryption at rest.
- **No PHI in logs** — enforced by Pino redaction paths.
- Append-only `audit_logs` for every sensitive action, including unauthenticated
  emergency scans.
- Role-based access control at the route preHandler layer.
- Files are private in S3 — reachable only via short-lived pre-signed URLs.

---

## 9. Testing and CI

- **51 integration tests** (Vitest) across auth, records, access, medications,
  emergency, caregivers, AI extraction-promotion, and drug interactions. Tests
  run against a real Postgres test database via Fastify's `inject` API; AI and
  S3 are mocked.
- **GitHub Actions CI** — 3 jobs: API (lint + tests against Postgres/Redis
  service containers), mobile typecheck, shared-package typecheck.
- Schema changes ship as ordered Prisma migration files.

---

## 10. What's intentionally not built yet

| Area | Status |
|---|---|
| Terraform / IaC | Not started — see the deployment runbook |
| Admin web app | Reserved package, empty |
| Push notification delivery (FCM) | DB rows written, not delivered |
| HIPAA AI path (Vertex AI / Bedrock) | Bedrock provider is a stub |
| Caregiver mobile UI | Backend complete, no mobile screens |
| Biometric login | Not implemented |

None of these block a non-HIPAA-market launch; they are tracked, scoped work.

---

## Further reading

- [ADRs](./adr/) — the detailed "why" behind each decision
- [API reference](./api/openapi.yaml) — OpenAPI 3.0 spec for all 44 endpoints
- [Postman collection](./api/medivault.postman_collection.json) — importable, pre-built requests
- [Deployment runbook](./deployment-runbook.md) — how to stand up an environment
- `MediVault_Specification.docx` — the original product + technical spec
