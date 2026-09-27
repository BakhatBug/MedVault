output "api_url" {
  description = "Public API base URL (paste into mobile EXPO_PUBLIC_API_URL)"
  value       = "https://${var.domain_name}"
}

output "alb_dns_name" {
  description = "ALB DNS name — point a Route53 ALIAS record at this for var.domain_name"
  value       = aws_lb.api.dns_name
}

output "ecr_repository_url" {
  description = "ECR repo URL — push API images here"
  value       = aws_ecr_repository.api.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  value = aws_ecs_service.api.name
}

output "rds_endpoint" {
  description = "RDS endpoint (private; reachable only from inside the VPC)"
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  value     = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive = true
}

output "s3_bucket_name" {
  value = aws_s3_bucket.records.bucket
}

output "secrets_arns" {
  description = "Secrets Manager ARNs for the operator to rotate"
  value = {
    database_url   = aws_secretsmanager_secret.database_url.arn
    redis_url      = aws_secretsmanager_secret.redis_url.arn
    jwt_access     = aws_secretsmanager_secret.jwt_access.arn
    jwt_refresh    = aws_secretsmanager_secret.jwt_refresh.arn
    gemini_api_key = aws_secretsmanager_secret.gemini_api_key.arn
  }
}
