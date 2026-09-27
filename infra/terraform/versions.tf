terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state lives in S3 with DynamoDB locking. The bucket + table must be
  # bootstrapped manually once per AWS account (see infra/terraform/README.md).
  backend "s3" {
    bucket         = "medivault-tfstate"
    key            = "medivault/prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "medivault-tfstate-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "medivault"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
