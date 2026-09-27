# Secrets — DB URL, JWT secrets, Gemini key, Redis auth. All stored in Secrets
# Manager and injected into the API task as environment variables via the ECS
# task definition's `secrets` block.

resource "random_password" "jwt_access" {
  length  = 64
  special = false
}

resource "random_password" "jwt_refresh" {
  length  = 64
  special = false
}

# ─── DATABASE_URL ────────────────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "database_url" {
  name        = "medivault/${var.environment}/DATABASE_URL"
  description = "Postgres connection URL"
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = format(
    "postgresql://%s:%s@%s:%s/%s?sslmode=require",
    aws_db_instance.main.username,
    random_password.db_master.result,
    aws_db_instance.main.address,
    aws_db_instance.main.port,
    aws_db_instance.main.db_name,
  )
}

# ─── REDIS_URL ────────────────────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "redis_url" {
  name        = "medivault/${var.environment}/REDIS_URL"
  description = "Redis connection URL (with TLS + auth)"
}

resource "aws_secretsmanager_secret_version" "redis_url" {
  secret_id = aws_secretsmanager_secret.redis_url.id
  secret_string = format(
    "rediss://default:%s@%s:%s",
    random_password.redis_auth.result,
    aws_elasticache_replication_group.main.primary_endpoint_address,
    aws_elasticache_replication_group.main.port,
  )
}

# ─── JWT secrets ──────────────────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "jwt_access" {
  name = "medivault/${var.environment}/JWT_ACCESS_SECRET"
}
resource "aws_secretsmanager_secret_version" "jwt_access" {
  secret_id     = aws_secretsmanager_secret.jwt_access.id
  secret_string = random_password.jwt_access.result
}

resource "aws_secretsmanager_secret" "jwt_refresh" {
  name = "medivault/${var.environment}/JWT_REFRESH_SECRET"
}
resource "aws_secretsmanager_secret_version" "jwt_refresh" {
  secret_id     = aws_secretsmanager_secret.jwt_refresh.id
  secret_string = random_password.jwt_refresh.result
}

# ─── Gemini API key ───────────────────────────────────────────────────────────
# Initial value comes from var.gemini_api_key. Rotate via aws cli or the console;
# Terraform's `ignore_changes` block prevents it from clobbering rotated values.
resource "aws_secretsmanager_secret" "gemini_api_key" {
  name = "medivault/${var.environment}/GEMINI_API_KEY"
}

resource "aws_secretsmanager_secret_version" "gemini_api_key" {
  secret_id     = aws_secretsmanager_secret.gemini_api_key.id
  secret_string = var.gemini_api_key

  lifecycle {
    ignore_changes = [secret_string]
  }
}
