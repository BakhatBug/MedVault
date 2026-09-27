# ADR 0005 — Market posture: build to HIPAA ceiling, ship to whichever market lights up first

- **Status:** Accepted
- **Date:** 2026-05-04

## Context

The product is intended to be sellable. The single biggest determinant of enterprise valuation in health tech is whether the platform can serve the **US market**, which requires HIPAA compliance.

HIPAA compliance touches:
- Auth (MFA, session management, audit trail)
- Storage encryption (in transit + at rest)
- Access controls (RBAC, least privilege, time-bound access)
- AI providers (must sign a BAA — Anthropic direct does not)
- Logging (no PHI in logs)
- Breach notification process
- Data retention and deletion

Building these in retroactively after a non-HIPAA launch is roughly a full rewrite of the auth and audit layers. Building them in from day one adds maybe 15% engineering time.

## Decision

Build with HIPAA + GDPR as the architectural ceiling regardless of where v1 launches first.

Concrete commitments:

1. **No PHI in logs** — Pino redact paths in `apps/api/src/lib/logger.ts`.
2. **Append-only audit log** — every sensitive action writes to `audit_logs` (see ADR 0004 / Prisma schema).
3. **Encryption at rest** — Postgres TDE in production, S3 SSE-AES256.
4. **TLS 1.3 minimum** — enforced at the load balancer.
5. **Time-bound doctor access** — every access permission has an expiry (or explicit "PERMANENT" with a revoke audit trail).
6. **AI provider abstraction** — see ADR 0003. Switch to Bedrock per-tenant for HIPAA.
7. **Data export + deletion** — every user can request export and deletion; deletion runs to completion within 30 days (spec §10.4).
8. **Account deletion cascade** — Prisma `onDelete: Cascade` on user-owned data. Audit log retains anonymized event with no PHI.

## Consequences

- Slower v1 development by perhaps 2 weeks vs a "ship fast, comply later" path.
- Buyer due diligence is dramatically easier — the audit, the docs, and the architecture all support a HIPAA story already.
- Even non-US markets benefit: GDPR overlap is ~80% with HIPAA on the technical side.

## Non-goals

- We are NOT obtaining HIPAA certification (there is no such thing; HIPAA is a compliance posture, not a certificate).
- We are NOT obtaining HITRUST or SOC 2 in v1 — those are sales artifacts to pursue when the first US customer is in flight.

## Rejected alternatives

- **Soft-launch in a low-regulation market first, retrofit later** — rejected because the retrofit is the most expensive software engineering you can do, and breach risk during the retrofit window is enormous on a medical product.
