# MediVault — Terraform

Provisions everything in [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md) section 1 in code: VPC, RDS, ElastiCache, S3, ECR, ECS Fargate, ALB, Secrets Manager, IAM.

## Files

| File | Owns |
|---|---|
| `versions.tf` | Provider + remote state backend |
| `variables.tf` | All inputs (region, AZs, instance sizes, image tag, etc.) |
| `network.tf` | VPC, public/private subnets, NAT, route tables, security groups |
| `database.tf` | RDS Postgres + parameter group + subnet group |
| `cache.tf` | ElastiCache Redis 7 with TLS + auth token |
| `storage.tf` | S3 records bucket — encrypted, versioned, TLS-only, lifecycle rules |
| `secrets.tf` | Secrets Manager entries for DB URL, Redis URL, JWT secrets, Gemini key |
| `compute.tf` | ECR, IAM roles, ALB, target group, listeners, ECS cluster + service + task def |
| `outputs.tf` | API URL, ALB DNS, ECR URL, ECS names, secret ARNs |

## One-time bootstrap (before `terraform init`)

Terraform's S3 backend assumes a state bucket + lock table exist. Create them manually in the target account:

```bash
aws s3api create-bucket --bucket medivault-tfstate --region us-east-1
aws s3api put-bucket-versioning --bucket medivault-tfstate --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket medivault-tfstate \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws dynamodb create-table --table-name medivault-tfstate-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

Then issue an ACM certificate covering `api.medivault.app` (or your domain), validate via DNS, and copy the ARN.

## First deploy

```bash
cd infra/terraform

terraform init

# Plan with your real values — Gemini key + ACM cert ARN are the two you must provide.
terraform plan \
  -var "acm_certificate_arn=arn:aws:acm:us-east-1:<acct>:certificate/<id>" \
  -var "gemini_api_key=<secret>"

# Apply
terraform apply \
  -var "acm_certificate_arn=arn:aws:acm:us-east-1:<acct>:certificate/<id>" \
  -var "gemini_api_key=<secret>"
```

After the apply:

1. Point a Route53 ALIAS record at the `alb_dns_name` output.
2. Push your first image to `ecr_repository_url` (see the deployment runbook for the exact docker commands).
3. Apply Prisma migrations against the new RDS — run `prisma migrate deploy` from a one-off task or a CI step that can reach the private RDS endpoint.
4. Force a service deployment so the running tasks pull the new image: `aws ecs update-service --cluster <cluster> --service <service> --force-new-deployment`.

## Per-environment values

The defaults in `variables.tf` are tuned for **prod**. For a smaller staging environment, override:

```bash
terraform apply \
  -var "environment=staging" \
  -var "db_instance_class=db.t4g.small" \
  -var "redis_node_type=cache.t4g.micro" \
  -var "api_desired_count=1"
```

You'll need to manage state separately per environment — either via Terraform workspaces or by pointing the S3 backend at a different `key` per env.

## What this skeleton does NOT cover

These are deliberately out of scope for v1; add them when the corresponding gap matters:

- **WAF in front of the ALB** — add an `aws_wafv2_web_acl` when you have traffic worth filtering.
- **Auto-scaling on ECS** — add `aws_appautoscaling_target` + policies when traffic varies.
- **Read replicas on RDS** — add when query load justifies it.
- **CloudFront for static assets** — there are none in v1; the API serves JSON only.
- **CloudTrail + Config + GuardDuty** — audit/compliance hardening for a real prod environment.
- **Separate worker service** — currently the extraction worker runs in the API task. Split into its own `aws_ecs_service` when AI load grows.
- **Bedrock IAM permissions** — add when a HIPAA tenant routes AI through Bedrock.

## Safety notes

- `random_password` resources generate new values on every `terraform destroy` + `apply` cycle. **Don't destroy prod state.** If you must rotate, do it through Secrets Manager directly.
- The Gemini secret has `ignore_changes = [secret_string]` so manual rotations via the AWS console don't get clobbered. Same pattern should apply to any human-rotated secret.
- `aws_db_instance.main.deletion_protection` is on in prod. To actually delete prod, you'll need to turn it off, apply, then destroy — two-step on purpose.
