# MediVault

Patient-centric, AI-powered medical records platform. The patient owns their
data; verified doctors get scoped, time-limited access; caregivers act on behalf
of a linked patient. Mobile-first.

Original spec: [`MediVault_Specification.docx`](./MediVault_Specification.docx).

## Status

**v1 feature-complete on the backend; both patient and doctor flows demoable on
mobile.** Not yet deployed to a cloud environment — see the
[deployment runbook](./docs/deployment-runbook.md).

- Backend: ~95% of spec §4, 51 integration tests, GitHub Actions CI, ordered Prisma migrations.
- Mobile: patient flows (auth, records, upload, medications, interactions,
  timeline, emergency QR, access management) and doctor flows (search, request
  access, patient view, AI summary, AI Q&A).
- Not built: Terraform/IaC, admin web app, push-notification delivery, caregiver
  mobile UI, biometric login.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js 20 + TypeScript + Fastify | Fast, schema-first validation |
| ORM | Prisma | Type-safe, ordered migrations |
| DB | PostgreSQL 16 | ACID, `jsonb` for FHIR |
| Cache / Queue | Redis + BullMQ | AI extraction jobs, caching |
| Storage | S3 (MinIO locally) | Pre-signed URLs, never proxied through the API |
| AI | Google Gemini (default); Anthropic / Bedrock behind the same abstraction | Per-tenant provider |
| Mobile | Expo / React Native + expo-router + react-query | Spec |
| Admin | Next.js — *reserved, not built* | Doctor verification queue |

## Documentation

- [Handoff & completion status](./docs/HANDOFF.md) — **read this first** if taking ownership
- [Architecture overview](./docs/architecture-overview.md) — system design, data model, flows
- [Architecture Decision Records](./docs/adr/) — the "why" behind each choice
- [OpenAPI spec](./docs/api/openapi.yaml) — all 44 endpoints; paste into [editor.swagger.io](https://editor.swagger.io)
- [Postman collection](./docs/api/medivault.postman_collection.json) — importable, pre-built requests
- [Deployment runbook](./docs/deployment-runbook.md) — standing up an environment, migrations, known gaps

## Layout

```
.
├── apps/
│   ├── api/          # Fastify HTTP API + Prisma + BullMQ extraction worker
│   ├── mobile/       # Expo React Native client (patient + doctor flows)
│   └── admin/        # Next.js admin (reserved, not built)
├── packages/
│   └── shared/       # Cross-package TS types, Zod schemas, FHIR helpers
├── infra/            # Terraform (not built)
├── docs/
│   ├── adr/          # Architecture Decision Records
│   ├── api/          # OpenAPI spec + Postman collection
│   ├── architecture-overview.md
│   └── deployment-runbook.md
├── docker-compose.yml
└── .env.example
```

The Prisma schema lives at `apps/api/prisma/schema.prisma`; migrations at
`apps/api/prisma/migrations/`.

## Local development

Prerequisites: Node 20+, npm 10+, Docker Desktop.

```bash
# 1. Configure env
cp .env.example .env
#    then set GEMINI_API_KEY in .env

# 2. Start Postgres + Redis + MinIO
npm run infra:up

# 3. Install deps
npm install

# 4. Generate Prisma client + run migrations
npm run db:generate
npm run db:migrate

# 5. Run the API
npm run dev:api
```

API runs at `http://localhost:3001`. Health check: `GET /healthz`.

### Mobile

```bash
cd apps/mobile
npx expo start          # then 'i' for iOS sim, 'a' for Android, or scan the QR
```

For a physical device on Wi-Fi, set `EXPO_PUBLIC_API_URL` to your machine's LAN IP.

### Tests

```bash
cd apps/api
npm run test:setup-db   # one-time: create + migrate the test database
npm test                # 51 integration tests
```

## Conventions

- **No PHI in logs.** Record IDs and user IDs only — enforced by the Pino
  redaction config in `apps/api/src/lib/logger.ts`.
- **Every clinical / sensitive write produces an audit row** in `audit_logs`.
- **Clinical data is FHIR R4 shaped**, stored in `jsonb` columns alongside the
  relational scaffolding.
- **AI calls go through the provider abstraction** in
  `apps/api/src/services/ai/` — never call a vendor SDK directly elsewhere.
- **Schema changes ship as Prisma migration files.** `db push` is dev-only;
  real environments use `migrate deploy`.

## License

Proprietary — all rights reserved.
