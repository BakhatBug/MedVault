# ElastiCache Redis 7 — BullMQ broker + ai_summary / interaction caches.
# Single-shard cluster mode disabled; sufficient for v1 load.

resource "random_password" "redis_auth" {
  length  = 32
  special = false
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "medivault-${var.environment}"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "medivault-${var.environment}"
  description                = "MediVault BullMQ broker + cache"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_node_type
  num_cache_clusters         = var.environment == "prod" ? 2 : 1
  automatic_failover_enabled = var.environment == "prod"
  multi_az_enabled           = var.environment == "prod"

  port               = 6379
  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth.result

  snapshot_retention_limit = 1
  snapshot_window          = "05:00-06:00"
  maintenance_window       = "Mon:06:00-Mon:07:00"

  tags = { Name = "medivault-${var.environment}" }
}
