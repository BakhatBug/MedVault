# MediVault — Deployment Runbook

How to stand up MediVault in a new environment. Written for an engineer who has
never seen this codebase. Current as of v0.22.

> **Status:** the application is feature-complete for v1 but has not yet been
> deployed to a real cloud environment. The steps below describe the intended
> path; the AWS resources are not yet codified in Terraform (see *Gaps* at the
> end).

---

## 1. What MediVault needs to run

| Dependency | Local dev | Production |
|---|---|---|
| Node.js | 20 LTS | 20 LTS |
| PostgreSQL | 16, via Docker Compose | AWS RDS for PostgreSQL 16, encryption at rest |
| Redis | 7, via Docker Compose | AWS ElastiCache for Redis 7 |
| Object storage | MinIO, via Docker Compose | AWS S3, private bucket, SSE-AES256 |
| AI provider | Google Gemini API key | Gemini direct, or Vertex AI for HIPAA tenants |
| SMS provider | `mock` (logs to stdout) | Twilio or AWS SNS |

The API is a single stateless Node process. It can be horizontally scaled behind
a load balancer without changes — there is no in-process session state (JWTs are
stateless, refresh tokens live in Postgres, the BullMQ worker is idempotent).

---

## 2. Environment variables

The full list is in [`.env.example`](../.env.example). The ones that **must**
be set per-environment:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string. Use the RDS endpoint. |
| `REDIS_URL` | ElastiCache endpoint. |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | 32+ random chars each. **Different per environment.** Rotate on suspected compromise. |
| `S3_BUCKET` | Private bucket name. |
| `S3_ENDPOINT` | Leave **empty** in production to use real AWS S3. Set to the MinIO URL only in dev. |
| `AWS_REGION` | e.g. `us-east-1`. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | **Omit in production** — the ECS task / EC2 instance role supplies credentials. Only set these for local MinIO. |
| `GEMINI_API_KEY` | From Google AI Studio. Store in Secrets Manager, never in the repo. |
| `AI_PROVIDER` | `gemini` (default), `anthropic`, or `bedrock`. |
| `SMS_PROVIDER` | `twilio` or `sns` in production. With `twilio`, also set `TWILIO_*`. |
| `BCRYPT_ROUNDS` | **12** in production (spec §10.1). Lower values are for test speed only. |
| `RUN_EXTRACTION_WORKER` | `true` on at least one process. See §6. |
| `NODE_ENV` | `production`. |

**Secrets management.** In production, inject `JWT_*`, `GEMINI_API_KEY`, and
`TWILIO_*` from AWS Secrets Manager — do not bake them into the task definition.
The application reads them as plain env vars; Secrets Manager → ECS env var
mapping handles the rest.

---

## 3. Provision infrastructure (AWS)

Until Terraform exists, provision manually in this order:

1. **VPC** with public + private subnets across 2 AZs.
2. **RDS PostgreSQL 16** in the private subnets. Enable encryption at rest,
   automated backups (7-day retention min), and a maintenance window.
3. **ElastiCache Redis 7** in the private subnets.
4. **S3 bucket**, private (Block Public Access ON), SSE-AES256 default
   encryption, lifecycle rule for Intelligent-Tiering (spec §13.3).
5. **Secrets Manager** entries for the JWT secrets, Gemini key, SMS creds.
6. **ECS Fargate** service (or EC2) running the API container. The task role
   needs: `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on the bucket;
   `secretsmanager:GetSecretValue` on the secrets.
7. **Application Load Balancer** in the public subnets, TLS 1.3, terminating
   HTTPS. Health check path: `GET /readyz`.
8. **CloudWatch** log group for the container.

> Security groups: the API task is the only thing allowed to reach RDS (5432)
> and Redis (6379). The ALB is the only thing allowed to reach the API task.

---

## 4. Build the application

```bash
npm ci
npm run db:generate --workspace=@medivault/api   # Prisma client
npm run build --workspace=@medivault/api          # tsc → dist/
```

Container image (illustrative Dockerfile, not yet in repo):

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev
COPY . .
RUN npm run db:generate --workspace=@medivault/api \
 && npm run build --workspace=@medivault/api
EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]
```

---

## 5. Database migration

MediVault uses Prisma migrations. The migration files live in
`apps/api/prisma/migrations/` and are the **single source of truth** for the
schema.

**First deploy** (empty database):

```bash
# Reads DATABASE_URL from the environment
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

This applies all three migrations in order, including the raw-SQL
`patient_code_seq` sequence.

**Subsequent deploys:** run `migrate deploy` again — it applies only new
migrations. It is safe to run on every deploy (it's a no-op when up to date).

**Never run `prisma db push` against a real environment** — it bypasses the
migration history. `db push` is a dev-only convenience.

**Rollback:** Prisma has no down-migrations. To roll back, restore the RDS
snapshot taken before the deploy. Always snapshot before a schema-changing
deploy.

---

## 6. The extraction worker

Document AI-extraction runs as a BullMQ job (Redis-backed). Two options:

- **Simple:** run the worker in-process with the API by leaving
  `RUN_EXTRACTION_WORKER=true`. Fine until extraction volume is significant.
- **Scaled:** run a separate process/task with `RUN_EXTRACTION_WORKER=true`
  and set it to `false` on the API tasks. The worker process is the same
  container with the same entrypoint — it just also picks up jobs.

The worker is idempotent and retries failed jobs 3× with exponential backoff
(spec §16.2).

---

## 7. First-run smoke test

After deploy:

```bash
curl https://api.medivault.app/healthz          # → {"status":"ok",...}
curl https://api.medivault.app/readyz           # → {"status":"ready",...}
```

Then exercise the cold path: register a patient, verify OTP (check the SMS
provider), log in, request a pre-signed upload URL. The Postman collection in
[`docs/api/medivault.postman_collection.json`](./api/medivault.postman_collection.json)
has every request pre-built.

---

## 8. Operational notes

- **Logs contain no PHI** — only record IDs and user IDs (enforced by the Pino
  redaction config). Safe to ship CloudWatch logs to standard tooling.
- **Audit log** (`audit_logs` table) is append-only and is the system of record
  for "who accessed what". Do not prune it without a retention policy review.
- **AI cost** is tracked per call in `ai_call_logs` — query it for spend.
- **Rate limits**: auth endpoints and the emergency endpoint are rate-limited
  per IP. Ensure the ALB forwards `X-Forwarded-For` (the app trusts it via
  `trustProxy`).

---

## Gaps before this is production-ready

These are known and tracked, not surprises:

1. **No Terraform** — infrastructure is described here but not codified. This
   should be the next infra task.
2. **No Dockerfile in the repo** — the one above is illustrative.
3. **AI provider for HIPAA** — `bedrock` provider is a stub; a Vertex AI
   provider for Gemini-on-HIPAA does not exist yet. Non-HIPAA markets are
   unaffected.
4. **No CDN / WAF** in front of the ALB — advisable before public launch.
5. **Backups are RDS-automated only** — no tested restore runbook yet.
6. **Push notifications** are written to the `notifications` table but not
   delivered (no FCM integration yet).
