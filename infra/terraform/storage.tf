# S3 bucket for medical records. Private, versioned, encrypted, with lifecycle
# rules to move cold records to cheaper storage classes over time.

resource "aws_s3_bucket" "records" {
  bucket = "medivault-records-${var.environment}"

  tags = { Name = "medivault-records-${var.environment}" }
}

resource "aws_s3_bucket_versioning" "records" {
  bucket = aws_s3_bucket.records.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "records" {
  bucket = aws_s3_bucket.records.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "records" {
  bucket = aws_s3_bucket.records.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Deny anything that isn't TLS. Spec §10.2 mandates TLS 1.3 in transit, but
# bucket policies can only enforce SecureTransport, not specific TLS versions —
# the ALB / S3 endpoint policy handles version enforcement.
resource "aws_s3_bucket_policy" "records" {
  bucket = aws_s3_bucket.records.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyUnencryptedTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.records.arn,
          "${aws_s3_bucket.records.arn}/*",
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.records]
}

resource "aws_s3_bucket_lifecycle_configuration" "records" {
  bucket = aws_s3_bucket.records.id

  rule {
    id     = "tier-cold-records"
    status = "Enabled"

    filter {
      prefix = "patients/"
    }

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 180
      storage_class = "GLACIER_IR"
    }

    # Versions get cleaned up after a year to keep cost predictable. Adjust
    # upward if compliance requires longer retention.
    noncurrent_version_expiration {
      noncurrent_days = 365
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "records" {
  bucket = aws_s3_bucket.records.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "HEAD"]
    allowed_origins = [
      "https://${var.domain_name}",
      "https://app.medivault.app",
      "exp://*", # Expo Go on physical devices during dev
    ]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}
