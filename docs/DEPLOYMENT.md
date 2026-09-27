# Deployment Runbook

The system has four runtime components: **API** (Node/Fastify), **Postgres**, **Redis** (BullMQ broker), and **S3-compatible object storage**. The mobile app is distributed via App Store / Play Store and connects to the API.

This runbook covers a first production deploy on AWS. The principles transfer to any cloud — replace AWS-specific bits with the equivalent in your provider.

---

## 1 · One-time setup

### 1.1 AWS account + region

Pick a region close to your primary user population. For HIPAA-eligible deployments use **us-east-1**, **us-east-2**, **us-west-2**, or any region with HIPAA-eligible RDS+S3+EC2 (most do).

### 1.2 Database — RDS Postgres 16

- **Instance class** start: `db.t4g.medium` (2 vCPU / 4 GB) → upgrade as load grows.
- **Storage**: gp3, start at 50 GB with autoscale enabled.
- **Encryption at rest**: on. Use the AWS-managed KMS key or your own CMK.
- **Backups**: 7-day retention minimum.
- **Multi-AZ**: enable for prod. (Adds cost, eliminates a class of outages.)
- **PostgreSQL parameter group**:
  - `log_statement = mod` (logs all mutations — helps audit)
  - `shared_preload_libraries = pg_stat_statements`
- **Network**: private subnet only; the API SG is the only inbound rule.

### 1.3 Object storage — S3

Create **one private bucket** per environment (e.g. `medivault-records-prod`).

Required bucket policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUnencryptedTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::medivault-records-prod/*"],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

Required settings:

- **Versioning**: enabled (lets us recover from accidental delete).
- **Public access**: all four block-public-access flags ON.
- **Default encryption**: SSE-S3 (AES-256). Use SSE-KMS if compliance requires CMKs.
- **Lifecycle rule**: move records to Standard-IA after 30 days, Glacier after 180 days. Records are write-once-read-rarely.
- **CORS** (for direct-from-mobile PUT/GET):

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedOrigins": ["https://app.medivault.app", "exp://*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### 1.4 Cache — ElastiCache Redis 7

- **Node type**: `cache.t4g.small` to start.
- **TLS in transit**: enabled.
- **Auth token**: enabled (set a strong secret, store it in Secrets Manager).
- **Cluster mode**: disabled for v1 (single shard is plenty).

### 1.5 Secrets Manager

Create one secret per environment:

```
medivault/prod/
  ├─ DATABASE_URL
  ├─ JWT_ACCESS_SECRET           (32+ char random)
  ├─ JWT_REFRESH_SECRET          (32+ char random)
  ├─ GEMINI_API_KEY
  ├─ TWILIO_AUTH_TOKEN           (or SNS creds)
  └─ REDIS_AUTH_TOKEN
```

The API process reads from Secrets Manager at boot via IAM role. **Never** put secrets in the container image or in plain env files.

### 1.6 Compute — pick one

| Option | Best for | Notes |
|---|---|---|
| **ECS Fargate** | Most teams | No EC2 to patch. ~$50/mo for the smallest viable setup. |
| **EKS** | Already on Kubernetes | More moving parts but consistent with the rest of your stack. |
| **Elastic Beanstalk** | Smallest teams | Easy onramp, can outgrow it. |

This runbook assumes Fargate.

### 1.7 BAA chain (HIPAA-eligible deploys only)

Sign Business Associate Agreements with:

1. **AWS** (one-click in the AWS Artifact console)
2. **Google Cloud** if using Vertex AI for Gemini — *or* skip Gemini and use AWS Bedrock Claude, which is covered under the AWS BAA.
3. **Twilio** (or whatever SMS provider you use)
4. **Email transactional provider** when added

The Anthropic and Google direct APIs are **not** BAA-eligible. The provider abstraction in `apps/api/src/services/ai/` makes the swap mechanical — set `AI_PROVIDER=bedrock` and a HIPAA tenant routes through Bedrock automatically.

---

## 2 · Initial deploy

### 2.1 Build and push the API image

```bash
# from repo root
docker build -t medivault-api -f apps/api/Dockerfile .
docker tag medivault-api:latest <acct>.dkr.ecr.<region>.amazonaws.com/medivault-api:0.21.0
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <acct>.dkr.ecr.<region>.amazonaws.com
docker push <acct>.dkr.ecr.<region>.amazonaws.com/medivault-api:0.21.0
```

> The `apps/api/Dockerfile` is not yet in the repo — adding it is a small follow-up. The image should run `node dist/server.js` after `npm ci --omit=dev`, `npm run db:generate`, and `npm run build`.

### 2.2 Apply database migrations

Migrations are versioned in `apps/api/prisma/migrations/`. Apply them with:

```bash
DATABASE_URL=<production-url> npm run db:deploy --workspace=@medivault/api
```

This runs `prisma migrate deploy` — it's idempotent, applies only un-applied migrations, and is safe to run on each release. **Never** run `migrate dev` against production.

### 2.3 Launch the Fargate task

A minimal task definition has:

| Setting | Value |
|---|---|
| CPU | 0.5 vCPU |
| Memory | 1 GB |
| Image | the ECR URI from 2.1 |
| Environment | the Secrets Manager ARN as a `valueFrom` reference for each secret listed above |
| Networking | private subnet; SG allows inbound from the ALB SG on 3001 |
| Health check | `/healthz` on port 3001, 15s grace |

Behind an **Application Load Balancer** with:
- HTTPS listener on 443, ACM cert for `api.medivault.app`
- HTTP listener on 80, redirects to 443
- Target group health check on `/readyz` (which validates DB connectivity)

### 2.4 Worker

The BullMQ extraction worker currently runs in the same process as the API. For low load this is fine. To split:

1. Set `RUN_EXTRACTION_WORKER=false` on the API tasks.
2. Launch a second Fargate service from the same image with `RUN_EXTRACTION_WORKER=true` and `API_PORT=0` (or just don't expose a port — the worker doesn't need one).
3. Both connect to the same Redis.

### 2.5 First-time bucket bootstrap

The API calls `ensureBucket()` at startup, which is a no-op if the bucket exists. For production we'd disable this and provision the bucket via Terraform / CDK instead. Until that's in place, the first task launch will create the bucket if it's missing — make sure the task IAM role has `s3:CreateBucket` on first deploy, then remove it.

---

## 3 · Release process

| Step | Command |
|---|---|
| 1. Bump version | edit `apps/api/package.json` |
| 2. Build + push image | as in 2.1 with new tag |
| 3. Apply migrations | as in 2.2 (CI step) |
| 4. Update task def | new image tag |
| 5. Trigger rolling deploy | `aws ecs update-service --force-new-deployment` |
| 6. Verify | `curl https://api.medivault.app/v1/healthz` and `/readyz` |
| 7. Smoke test | run `apps/api` tests against staging if you have one |
| 8. Watch logs | CloudWatch for 5-10 min post-deploy |

Migrations should run **before** the new image starts taking traffic, since the new code may reference new schema. ECS deployment circuit breaker should be on so a broken release rolls back automatically.

---

## 4 · Observability

| Signal | Where |
|---|---|
| Application logs | Pino JSON → CloudWatch Logs. Watch `ERROR` level. PHI redaction is enforced at the logger layer (see `lib/logger.ts`). |
| Request rate / latency | ALB metrics → CloudWatch |
| DB load | RDS Performance Insights |
| AI cost | Query `ai_call_logs` table: `SELECT date, sum(input_tokens), sum(output_tokens) FROM ai_call_logs GROUP BY date(created_at)`. |
| Audit log | Query `audit_logs` table. Ship to S3 with Glue catalog for ad-hoc compliance queries. |
| Error tracking | Sentry recommended (free tier for solo dev) |

Critical alarms:

- API `5xx` rate > 1% over 5 min
- RDS CPU > 80% sustained 10 min
- Redis evictions > 0 (we don't expect evictions)
- BullMQ failed jobs > 10/hour
- `/v1/emergency/:patientCode` 429 rate spike (potential enumeration attack)

---

## 5 · Backup + DR

| Component | Strategy |
|---|---|
| RDS | Automatic backups, 7-day retention. Monthly manual snapshot retained 1 year. |
| S3 | Versioning + lifecycle. Cross-region replication if compliance requires geo-redundancy. |
| Redis | Ephemeral — contains queue state and AI cache. Loss is recoverable: BullMQ jobs replay, AI cache regenerates. |
| Secrets | Secrets Manager has automatic backup; rotate quarterly. |

**RPO** target: 5 minutes (RDS continuous backup).
**RTO** target: 1 hour (restore from snapshot + redeploy).

---

## 6 · Compliance posture

| Control | Status |
|---|---|
| TLS 1.3 in transit | ALB enforces, S3 bucket policy enforces |
| Encryption at rest | RDS KMS + S3 SSE-AES256 |
| Audit log | `audit_logs` table; ship to S3 for long-term retention |
| Access reviews | doctor `verificationStatus` is admin-controlled via `scripts/approve-doctor.ts` |
| Patient data export | spec §10.4 obligation; endpoint TBD |
| Account deletion within 30 days | spec §10.4 obligation; `User.deletedAt` + cascade in place; reaper Lambda TBD |
| No PHI in logs | Pino redact paths in `lib/logger.ts` |
| BAA chain | per 1.7 above |

---

## 7 · Local development

| Step | Command |
|---|---|
| 1. Start infra | `docker compose up -d` |
| 2. Install deps | `npm install` (repo root) |
| 3. Generate Prisma client | `npm run db:generate --workspace=@medivault/api` |
| 4. Apply migrations | `npm run db:migrate --workspace=@medivault/api` |
| 5. Copy env | `cp .env.example .env` (then fill in `GEMINI_API_KEY`) |
| 6. Start API | `npm run dev:api` |
| 7. Run tests | `cd apps/api && npm run test:setup-db && npm test` |
| 8. Start mobile | `cd apps/mobile && npx expo start` |

The mobile app uses `EXPO_PUBLIC_API_URL` (default `http://localhost:3001`); set it to your LAN IP when running on a physical device on the same Wi-Fi.

---

## 8 · Common operations

### Approve a doctor

```bash
npm run admin:approve-doctor --workspace=@medivault/api -- --email doc@example.com
```

Marks the doctor's `verificationStatus = APPROVED` and writes a `DOCTOR_VERIFIED` audit row. Until there's an admin UI, this is the production-blessed path.

### Investigate "I can't see my records"

1. `SELECT * FROM users WHERE email = 'x@y.com'` — confirm status is ACTIVE
2. `SELECT * FROM patient_profiles WHERE user_id = '<uuid>'` — confirm profile exists
3. `SELECT count(*) FROM medical_records WHERE patient_id = '<uuid>' AND deleted_at IS NULL` — count records
4. Check API logs for the user's most recent requests (filter by `reqId` and trace forward)

### Investigate a leaked PHI scare

`audit_logs` is the source of truth. Query by `subject_user_id` to see everyone who has touched a patient's data:

```sql
SELECT created_at, action, actor_user_id, metadata, ip_address
FROM audit_logs
WHERE subject_user_id = '<uuid>'
ORDER BY created_at DESC
LIMIT 100;
```

### Roll an exposed secret

1. Generate new value in the relevant provider (Gemini key, JWT secret, etc.)
2. Update the Secrets Manager entry
3. Force a new ECS deployment so tasks pick up the new value
4. Verify with `/healthz`
5. For JWT secrets: old refresh tokens are now invalid. Users will be re-prompted to log in.

---

## 9 · Known gaps before first paid customer

| Gap | Severity |
|---|---|
| No Dockerfile in repo yet | Blocker — image can't be built |
| No Terraform / CDK | Blocker — infra is hand-clicked, not reproducible |
| No SSO / SAML for enterprise doctor accounts | Blocker if first customer is a hospital |
| No HITRUST / SOC2 attestation | Blocker for many enterprise customers — start the audit ~6 months pre-sale |
| Resend-OTP endpoint exists but no SMS provider wired in prod | Blocker — currently mock-only |
| Patient data export endpoint missing | Compliance gap |
| Account deletion reaper missing | Compliance gap |
| Push notification delivery missing | UX gap |
