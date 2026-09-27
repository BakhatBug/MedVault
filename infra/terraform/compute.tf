# ECR + ECS Fargate + ALB.

# ─── ECR ──────────────────────────────────────────────────────────────────────
resource "aws_ecr_repository" "api" {
  name                 = "medivault-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 30 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 30
        }
        action = { type = "expire" }
      }
    ]
  })
}

# ─── IAM ──────────────────────────────────────────────────────────────────────
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "medivault-${var.environment}-ecs-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Lets the execution role read secrets to inject as env vars.
resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "read-secrets"
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [
          aws_secretsmanager_secret.database_url.arn,
          aws_secretsmanager_secret.redis_url.arn,
          aws_secretsmanager_secret.jwt_access.arn,
          aws_secretsmanager_secret.jwt_refresh.arn,
          aws_secretsmanager_secret.gemini_api_key.arn,
        ]
      }
    ]
  })
}

# Task role — what the application code can do at runtime.
resource "aws_iam_role" "api_task" {
  name               = "medivault-${var.environment}-api-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy" "api_task_s3" {
  name = "s3-records-access"
  role = aws_iam_role.api_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:HeadBucket",
        ]
        Resource = [
          aws_s3_bucket.records.arn,
          "${aws_s3_bucket.records.arn}/*",
        ]
      }
    ]
  })
}

# ─── ALB ──────────────────────────────────────────────────────────────────────
resource "aws_lb" "api" {
  name               = "medivault-${var.environment}-api"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  drop_invalid_header_fields = true
  enable_deletion_protection = var.environment == "prod"
}

resource "aws_lb_target_group" "api" {
  name        = "medivault-${var.environment}-api"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip" # required for Fargate awsvpc networking

  # /readyz checks DB connectivity — a more honest signal than /healthz.
  health_check {
    path                = "/readyz"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200"
  }

  deregistration_delay = 30
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = var.acm_certificate_arn == "" ? 0 : 1
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# ─── ECS ──────────────────────────────────────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = "medivault-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/medivault/${var.environment}/api"
  retention_in_days = 30
}

locals {
  # Image URI is built from the ECR repo + the tag the operator wants to deploy.
  api_image = "${aws_ecr_repository.api.repository_url}:${var.api_image_tag}"
}

resource "aws_ecs_task_definition" "api" {
  family                   = "medivault-${var.environment}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.api_task.arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = local.api_image
      essential = true

      portMappings = [{ containerPort = 3001, protocol = "tcp" }]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "API_HOST", value = "0.0.0.0" },
        { name = "API_PORT", value = "3001" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "S3_BUCKET", value = aws_s3_bucket.records.bucket },
        { name = "S3_PRESIGNED_PUT_TTL", value = "600" },
        { name = "S3_PRESIGNED_GET_TTL", value = "900" },
        { name = "AI_PROVIDER", value = "gemini" },
        { name = "AI_MODEL_EXTRACTION", value = "gemini-2.5-flash" },
        { name = "AI_MODEL_SUMMARY", value = "gemini-2.5-pro" },
        { name = "AI_MODEL_QA", value = "gemini-2.5-flash" },
        { name = "AI_MODEL_CLASSIFY", value = "gemini-2.5-flash-lite" },
        { name = "AI_RATE_LIMIT_PER_PATIENT_PER_DOCTOR_PER_DAY", value = "10" },
        { name = "RUN_EXTRACTION_WORKER", value = "true" },
        { name = "LOG_LEVEL", value = "info" },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "REDIS_URL", valueFrom = aws_secretsmanager_secret.redis_url.arn },
        { name = "JWT_ACCESS_SECRET", valueFrom = aws_secretsmanager_secret.jwt_access.arn },
        { name = "JWT_REFRESH_SECRET", valueFrom = aws_secretsmanager_secret.jwt_refresh.arn },
        { name = "GEMINI_API_KEY", valueFrom = aws_secretsmanager_secret.gemini_api_key.arn },
      ]

      healthCheck = {
        command     = ["CMD-SHELL", "wget --quiet --tries=1 --spider http://127.0.0.1:3001/healthz || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "api"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "api" {
  name            = "medivault-${var.environment}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"
  enable_execute_command = true

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3001
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.https]

  lifecycle {
    # Allow CI/CD to update the image without Terraform fighting it. Roll image
    # changes via `aws ecs update-service --force-new-deployment` after pushing.
    ignore_changes = [task_definition, desired_count]
  }
}
