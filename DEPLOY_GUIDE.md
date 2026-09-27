# DEPLOY GUIDE — putting MediVault on a real server

How to take MediVault from "runs on my laptop" to "runs in the cloud and real
users can reach it." This guide targets **AWS**, which the infrastructure code
is written for.

> **Be honest with yourself about scope.** A real medical-data deployment is not
> a weekend task. Budget 1–2 weeks for a first production deploy done properly,
> and read the **Before you deploy** checklist below — some items are legal, not
> technical.

The deeper technical reference is [`docs/deployment-runbook.md`](./docs/deployment-runbook.md).
This guide is the higher-level "what order do I do things in."

---

## Before you deploy — non-negotiable checklist

Do not put this in front of real patients until every box is checked.

- [ ] **Rotate the Gemini API key.** A key was exposed during development.
      Regenerate it at https://aistudio.google.com/apikey.
- [ ] **Decide your market.** HIPAA (United States) or not?
      - *Not HIPAA* (e.g. Pakistan, many markets): you can deploy as-is.
      - *HIPAA (US)*: you must first implement the BAA-eligible AI path
        (AWS Bedrock or Google Vertex AI) — the current `bedrock` provider is a
        stub. You also need a signed BAA with AWS. Do not serve US patients
        without this.
- [ ] **Write a privacy policy and terms of service.** A lawyer should review
      these. Health data has strict rules everywhere. You need a public URL for
      the privacy policy — the app stores require it too.
- [ ] **Get a domain name** (e.g. `medivault.app`) and the ability to create
      DNS records for it.
- [ ] **Set up an SMS provider** — sign up for Twilio (or AWS SNS) so OTP codes
      can actually be texted. The mock provider only works locally.
- [ ] **Choose a real AWS region** close to your users.

---

## What you'll be running

```
Internet
   │  HTTPS
   ▼
Load Balancer (ALB)  ──►  API containers (ECS Fargate)  ──►  PostgreSQL (RDS)
                                  │                      └─►  Redis (ElastiCache)
                                  └─────────────────────►  File storage (S3)
                                  └─────────────────────►  Gemini AI API
```

Everything except the load balancer lives in a private network. The API is
stateless, so you can run multiple copies for reliability.

---

## Step 1 — Create an AWS account and tools

1. Create an AWS account at https://aws.amazon.com if you don't have one.
2. Install the **AWS CLI** (https://aws.amazon.com/cli) and run `aws configure`
   with an admin access key.
3. Install **Terraform** (https://developer.hashicorp.com/terraform/install) —
   this is the tool that creates all the cloud resources from code.
4. Install **Docker** (you already have it from the run guide).

---

## Step 2 — Provision the infrastructure with Terraform

The cloud resources (database, networking, servers, storage) are defined as
code in `infra/terraform/`. You don't click around the AWS console — Terraform
creates everything.

```bash
cd infra/terraform

# Review and fill in your settings
copy terraform.tfvars.example terraform.tfvars   # then edit terraform.tfvars

terraform init        # downloads the AWS plugin
terraform plan        # shows what it WILL create — read this carefully
terraform apply       # creates it (type 'yes' to confirm)
```

`terraform apply` takes 10–20 minutes (databases are slow to create). When it
finishes it prints outputs — the database endpoint, the load balancer URL, etc.
Save these.

> This Terraform has not yet been applied against a real account. The first
> `terraform plan` may surface small issues to fix — that is normal for a
> first apply. Work through any errors it reports; they will be specific and
> fixable.

---

## Step 3 — Store your secrets

Secrets (the Gemini key, JWT signing secrets, SMS credentials) must **never** be
in the code. Put them in AWS Secrets Manager:

```bash
aws secretsmanager create-secret --name medivault/gemini-key --secret-string "YOUR_KEY"
aws secretsmanager create-secret --name medivault/jwt-access --secret-string "$(openssl rand -hex 32)"
aws secretsmanager create-secret --name medivault/jwt-refresh --secret-string "$(openssl rand -hex 32)"
```

(The exact secret names should match what the Terraform expects — check
`infra/terraform/secrets.tf`.)

---

## Step 4 — Build and push the container image

The API runs as a Docker container. Build it and push it to AWS's container
registry (ECR):

```bash
# From the repo root. Replace <account> and <region>.
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com

docker build -t medivault-api .
docker tag medivault-api:latest <account>.dkr.ecr.<region>.amazonaws.com/medivault-api:latest
docker push <account>.dkr.ecr.<region>.amazonaws.com/medivault-api:latest
```

---

## Step 5 — Run the database migration

The database is created empty. Apply the schema:

```bash
# Point at the production database (from the Terraform outputs)
set DATABASE_URL=postgresql://USER:PASS@RDS-ENDPOINT:5432/medivault
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

This runs every migration in `apps/api/prisma/migrations/` in order. It is safe
to run again on future deploys — it only applies new migrations.

> **Always snapshot the database before a schema-changing deploy.** Prisma has
> no automatic rollback; recovery is restoring the snapshot.

---

## Step 6 — Start the service

The ECS service (created by Terraform) runs your container. After pushing a new
image, tell ECS to use it:

```bash
aws ecs update-service --cluster medivault --service medivault-api --force-new-deployment
```

ECS pulls the new image and rolls it out.

---

## Step 7 — Point your domain at it

In your DNS provider, create a record pointing your domain (e.g.
`api.medivault.app`) at the load balancer's address (from the Terraform
outputs). Set up an HTTPS certificate via AWS Certificate Manager — the load
balancer uses it to serve `https://`.

---

## Step 8 — Verify

```bash
curl https://api.medivault.app/healthz     # → {"status":"ok",...}
curl https://api.medivault.app/readyz      # → {"status":"ready",...}
```

If `readyz` returns `ready`, the API can reach the database. Then register a
test patient end-to-end (use the Postman collection in `docs/api/`).

---

## Releasing updates later

Once it's live, a routine update is:

1. `docker build` + `docker push` the new image (Step 4).
2. `npx prisma migrate deploy` if the schema changed (Step 5) — snapshot first.
3. `aws ecs update-service --force-new-deployment` (Step 6).

Consider automating this with GitHub Actions later — the CI pipeline already
runs tests on every push; adding a deploy step is a natural extension.

---

## Ongoing operations

- **Logs** — the API logs to AWS CloudWatch. They contain no patient data by
  design (only record/user IDs), so they're safe to view freely.
- **Costs** — the biggest variable cost is the Gemini AI calls. The
  `ai_call_logs` database table records every call's token usage. Database and
  servers are fixed monthly costs.
- **Backups** — RDS takes automated daily snapshots. Test a restore at least
  once so you know it works before you need it.
- **Scaling** — if the API is slow under load, increase the ECS task count.
  The API is stateless so this is safe.

---

## Known gaps before this is a polished production system

These don't block a launch but you should plan for them:

1. The Terraform has not been applied yet — expect to fix small issues on the
   first `apply`.
2. There is no CDN or Web Application Firewall in front of the load balancer —
   advisable before a public launch.
3. Push notifications are not delivered (the database records them, but nothing
   sends them to phones). See the architecture docs.
4. There is no automated deploy pipeline yet — deploys are the manual steps
   above.

See [`docs/HANDOFF.md`](./docs/HANDOFF.md) for the complete gap list.

---

For publishing the mobile app to the App Store and Google Play, see
**STORE_GUIDE.md**.
