variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment label (prod, staging, dev)"
  type        = string
  default     = "prod"
}

variable "vpc_cidr" {
  description = "CIDR for the MediVault VPC"
  type        = string
  default     = "10.42.0.0/16"
}

variable "azs" {
  description = "Availability zones to span"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "domain_name" {
  description = "Domain name for the API (e.g. api.medivault.app). Cert lookup uses this."
  type        = string
  default     = "api.medivault.app"
}

variable "acm_certificate_arn" {
  description = "ARN of an ACM cert covering domain_name. Issue via ACM console + DNS validation before applying."
  type        = string
  default     = ""
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.medium"
}

variable "db_allocated_storage" {
  description = "RDS storage in GB (autoscales up from here)"
  type        = number
  default     = 50
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t4g.small"
}

variable "api_image_tag" {
  description = "Image tag to deploy. Set to a real version on each release (e.g. 0.21.0). The ECR repo URL is built from this."
  type        = string
  default     = "latest"
}

variable "api_desired_count" {
  description = "Number of Fargate tasks for the API service"
  type        = number
  default     = 2
}

variable "api_cpu" {
  description = "Fargate CPU units for the API (256, 512, 1024, ...)"
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Fargate memory MB for the API"
  type        = number
  default     = 1024
}

variable "gemini_api_key" {
  description = "Google Gemini API key. Stored in Secrets Manager; never logged."
  type        = string
  sensitive   = true
  default     = ""
}
