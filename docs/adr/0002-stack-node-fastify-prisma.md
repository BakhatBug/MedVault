# ADR 0002 — Backend stack: Node + TypeScript + Fastify + Prisma

- **Status:** Accepted
- **Date:** 2026-05-04

## Context

The spec mandates Node.js but is silent on framework, ORM, and HTTP library.

## Decision

| Concern | Choice |
|---|---|
| Runtime | Node.js 20 LTS |
| Language | TypeScript 5.6 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| HTTP framework | Fastify 5 |
| ORM | Prisma 5 |
| Validation | Zod 3 |
| Logging | Pino |
| Queue | BullMQ on Redis |
| Test | Vitest |
| Module system | ESM |

## Why each choice

- **Fastify over Express** — built-in JSON-schema request validation, ~3x throughput on JSON workloads, first-class plugin lifecycle, hooks model is well suited to per-tenant scoping (HIPAA flag → AI provider).
- **Prisma over Drizzle/Kysely/raw** — migration story is the strongest in the ecosystem; type-safe queries reduce a class of bugs that are catastrophic on a medical-data product. Cost: Prisma's query layer is ~slow; we'll drop to raw SQL on hot paths if/when measured.
- **TypeScript strict everything** — strict mode pays for itself the first time `exactOptionalPropertyTypes` catches a missing `allergies` field on a request body before it reaches an AI prompt.
- **Zod over io-ts/yup** — best DX, generates types automatically, Fastify integrates via `fastify-type-provider-zod`.
- **BullMQ on Redis** — for AI extraction jobs, retry-with-backoff per spec §16.2. Avoids pulling in a full message-broker (RabbitMQ/SQS) before we need it.

## Consequences

- Hiring pool is large (Node/TS is the biggest backend pool worldwide).
- We don't get the JVM ecosystem (HAPI FHIR, etc.) — see ADR 0004 for how we mitigate that.
- ESM-only means some older CommonJS-only deps may need workarounds; Node 20 makes this rare.

## Rejected alternatives

- **NestJS** — heavyweight DI/decorators add ceremony without proportional value at our team size.
- **Go** — better runtime characteristics, but smaller mobile/full-stack hiring pool and weaker FHIR library coverage.
- **Python (FastAPI)** — would help on ML/medical-NLP but the rest of the stack pulls toward Node.
