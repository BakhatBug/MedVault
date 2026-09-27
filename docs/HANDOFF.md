# MediVault — Handoff & Completion Status

The single document to read if you are taking ownership of MediVault — a new
engineering team, a buyer's technical due-diligence reviewer, or the founder
returning after a break. Current as of v0.23.

For the *why* behind decisions, read [`architecture-overview.md`](./architecture-overview.md)
and the [ADRs](./adr/). For deployment, read [`deployment-runbook.md`](./deployment-runbook.md).

---

## 1. What MediVault is

A patient-centric medical records platform. The patient owns their data. Verified
doctors get scoped, time-bounded, patient-approved access. Caregivers act on
behalf of a linked patient. A public emergency QR endpoint serves first
responders. AI (Google Gemini) extracts structured FHIR data from uploaded
documents, generates patient summaries, answers doctor questions, and checks
drug interactions.

Built as a sellable commercial product — compliance posture, audit logging, and
documentation are load-bearing, not afterthoughts.

---

## 2. Completion status

### Done and verified

| Area | State |
|---|---|
| **Backend API** | ~95% of spec §4. 44 endpoints. Runs, bundles, boots clean. |
| **Auth** | Register, OTP verify, resend-OTP, login, JWT refresh rotation, logout |
| **Records** | Pre-signed S3 upload, AI extraction → FHIR, list/view/delete |
| **AI extraction** | Gemini → FHIR Bundle; auto-promotes medications from prescriptions |
| **Medications** | Full CRUD, discontinue vs delete, history |
| **Drug interactions** | Auto-fires on med change, hash-cached, fabricated-drug rejection |
| **Doctor access** | Request → approve/deny → time-bounded access → revoke state machine |
| **Doctor tools** | Patient view, AI summary, AI Q&A, interactions, timeline |
| **Caregiver** | Invite → accept → read + upload-on-behalf → revoke |
| **Emergency QR** | Public endpoint, patient-controlled disclosure, rate-limited, audited |
| **Health timeline** | Live-derived chronological feed from records + medications |
| **Audit + cost log** | Append-only `audit_logs`; per-call `ai_call_logs` |
| **Mobile (patient)** | Register/OTP, records, upload, medications, interactions, timeline, emergency QR, doctor-access management |
| **Mobile (doctor)** | Search, request access, patient view, AI summary, AI Q&A, timeline |
| **Mobile (caregiver)** | Invitations, managed patients, records view, upload-on-behalf |
| **Tests** | 48 integration tests, 8 files, all green |
| **CI** | GitHub Actions — API tests, mobile typecheck, shared typecheck |
| **Migrations** | 3 ordered Prisma migrations, verified against a fresh DB |
| **Containerization** | Multi-stage Dockerfile, esbuild bundle, boots verified |
| **Infrastructure** | Terraform for VPC/RDS/ElastiCache/S3/ECS/ALB/Secrets |
| **Documentation** | Architecture overview, deployment runbook, OpenAPI spec, Postman collection, 5 ADRs, this doc |

### Not done (tracked, none blocking a non-HIPAA launch)

| Gap | Impact | Effort |
|---|---|---|
| Push notification delivery (FCM) | `notifications` rows are written but never delivered to devices | Medium — needs Firebase project |
| HIPAA AI path (Vertex AI / Bedrock) | `bedrock` provider is a stub; needed only for the US/HIPAA market | Medium |
| Biometric login (mobile) | Spec §4.1 mentions Face ID/fingerprint; not implemented | Small |
| Mobile registration is patient-only | Doctors/caregivers register via the API | Small |
| Terraform not yet applied | IaC is written but never `terraform apply`'d against a real account | — |
| No Dockerfile CI build step | Image builds locally; not yet built/pushed in CI | Small |
| Admin web app | Reserved `apps/admin`, empty — doctor verification is a CLI script today | Medium |
| Test coverage gaps | Timeline derivation and the extraction worker job have no direct tests | Small |

---

## 3. How to run everything

### Prerequisites
Node 20+, npm 10+, Docker Desktop.

### Local development
```bash
cp .env.example .env          # then set GEMINI_API_KEY
npm install
npm run infra:up              # Postgres + Redis + MinIO
npm run db:generate
npm run db:migrate
npm run dev:api               # API on :3001
```

### Mobile
```bash
cd apps/mobile
npx expo start                # 'i' iOS sim, 'a' Android, or scan QR
```

### Tests
```bash
cd apps/api
npm run test:setup-db         # one-time: create + migrate the test DB
npm test                      # 48 integration tests
```

### Production build
```bash
npm run build --workspace=@medivault/api    # esbuild → apps/api/dist/server.js
docker build -t medivault-api .             # multi-stage image
```

### Deploy
See [`deployment-runbook.md`](./deployment-runbook.md). In short: provision AWS
(Terraform in `infra/terraform/`), push the image, run `prisma migrate deploy`,
start the ECS service.

---

## 4. Repository tour

```
apps/
  api/                  Fastify API + Prisma + BullMQ extraction worker
    src/
      routes/           HTTP route handlers (one file per domain)
      services/         business logic — auth, records, access, medications,
                        caregivers, emergency, timeline, ai/*
      queues/           BullMQ extraction worker
      lib/              prisma, redis, s3, logger, jwt, audit
      plugins/          Fastify auth plugin (JWT + role gates)
    prisma/             schema.prisma + migrations/
    tests/              48 Vitest integration tests
    build.mjs           esbuild production bundler
  mobile/               Expo React Native — (auth) (patient) (doctor) (caregiver)
  admin/                reserved, empty
packages/
  shared/               FHIR R4 types, Zod schemas, patient-code helpers
infra/terraform/        AWS IaC
docs/                   architecture, runbook, ADRs, OpenAPI, Postman, this file
Dockerfile              multi-stage production image
docker-compose.yml      local Postgres + Redis + MinIO
```

### Where to make common changes
- **New endpoint** — add a route in `apps/api/src/routes/`, register it in
  `server.ts`, put logic in a `services/` module, add a test in `tests/`.
- **Schema change** — edit `apps/api/prisma/schema.prisma`, then
  `npm run db:migrate` to create a migration. Never `db push` outside dev.
- **New AI feature** — add to `apps/api/src/services/ai/`; always go through the
  `AIProvider` abstraction, never call a vendor SDK directly.
- **Mobile screen** — add a file under the right `apps/mobile/app/(group)/`;
  expo-router picks it up. Add data hooks to `lib/queries.ts`.

---

## 5. Critical operational facts

- **No PHI in logs.** Pino redaction is configured in `apps/api/src/lib/logger.ts`.
  Logs carry record/user IDs only — safe for standard log tooling.
- **`audit_logs` is the system of record** for who-accessed-what. Append-only.
- **`ai_call_logs`** tracks every AI call's tokens and latency — query it for spend.
- **Files never transit the API** — clients PUT/GET S3 directly via pre-signed URLs.
- **Migrations, not `db push`** — real environments use `prisma migrate deploy`.
- **The API is stateless** — scale horizontally behind a load balancer freely.

---

## 6. Security posture (summary)

Built to the HIPAA/GDPR ceiling regardless of launch market (see
[ADR 0005](./adr/0005-market-posture-hipaa-ceiling.md)):
JWT (15-min access tokens, rotating refresh), bcrypt-12 passwords, OTP with TTL +
lockout + resend cooldown, TLS 1.3, S3 SSE-AES256, RDS encryption at rest,
role-based access control, append-only audit log, no PHI in logs, time-bounded
doctor access, private files behind short-lived signed URLs.

---

## 7. Immediate priorities for whoever continues

In rough priority order:

1. **Rotate the Gemini API key.** A key was shared in a development chat; treat
   it as compromised. Regenerate in Google AI Studio, update `.env` /
   Secrets Manager.
2. **`terraform apply`** the `infra/terraform/` stack against a real AWS account
   and run a first deploy end-to-end. The IaC has never been applied.
3. **Push notification delivery** — wire FCM so the `notifications` rows
   actually reach devices.
4. **HIPAA AI path** — implement the Bedrock or Vertex AI provider before
   pursuing US healthcare customers.
5. **Admin web app** — replace the `approve-doctor` CLI script with a real
   doctor-verification queue UI.

None of (3)–(5) block a launch in a non-HIPAA market.

---

## 8. Version history (in-repo development log)

| Version | Delivered |
|---|---|
| v0.1–0.2 | Monorepo scaffold, DB schema, auth, records upload + S3 |
| v0.3 | Gemini AI extraction → FHIR |
| v0.4 | Doctor access state machine |
| v0.5 | Doctor AI summary + Q&A |
| v0.6 | Emergency QR endpoint |
| v0.7–0.8 | Medications CRUD + drug interaction checker |
| v0.9 | Auto-promote extracted medications |
| v0.10 | Health timeline |
| v0.11 | Caregiver flow (backend) |
| v0.12–0.15 | Mobile shell, upload, registration/OTP, emergency QR |
| v0.16 | Test suite + CI |
| v0.17 | Migration consolidation |
| v0.18–0.19 | Doctor mobile tabs + patient access management |
| v0.20–0.21 | Test coverage expansion + resend-OTP |
| v0.22 | Documentation pass |
| v0.23 | Dockerfile + Terraform + caregiver mobile + doctor timeline |
