# RDS Postgres 16 — encrypted, multi-AZ, 7-day backup. The master password is
# randomly generated and stored in Secrets Manager; the API reads it from there.

resource "random_password" "db_master" {
  length  = 32
  special = false # avoids RDS-incompatible characters
}

resource "aws_db_subnet_group" "main" {
  name       = "medivault-${var.environment}"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_parameter_group" "main" {
  name   = "medivault-${var.environment}-pg16"
  family = "postgres16"

  parameter {
    name  = "log_statement"
    value = "mod" # log INSERT/UPDATE/DELETE — helps audit
  }
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
    apply_method = "pending-reboot"
  }
}

resource "aws_db_instance" "main" {
  identifier        = "medivault-${var.environment}"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = var.db_instance_class
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_allocated_storage * 4 # autoscale ceiling

  db_name  = "medivault"
  username = "medivault"
  password = random_password.db_master.result

  storage_encrypted        = true
  multi_az                 = var.environment == "prod"
  publicly_accessible      = false
  vpc_security_group_ids   = [aws_security_group.rds.id]
  db_subnet_group_name     = aws_db_subnet_group.main.name
  parameter_group_name     = aws_db_parameter_group.main.name

  backup_retention_period   = 7
  backup_window             = "03:00-04:00"
  maintenance_window        = "Mon:04:00-Mon:05:00"
  delete_automated_backups  = false
  deletion_protection       = var.environment == "prod"
  skip_final_snapshot       = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "medivault-prod-final-${formatdate("YYYYMMDDhhmmss", timestamp())}" : null

  performance_insights_enabled = true

  tags = { Name = "medivault-${var.environment}" }

  # The timestamp() in final_snapshot_identifier means terraform would always
  # detect a change. Lifecycle ignores it.
  lifecycle {
    ignore_changes = [final_snapshot_identifier]
  }
}
