# VPC with 3 public + 3 private subnets, one per AZ.
# Public subnets host the ALB; private subnets host RDS, ElastiCache, and Fargate.
# A single NAT gateway saves cost in non-prod; production should use one per AZ.

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "medivault-${var.environment}" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "medivault-${var.environment}-igw" }
}

resource "aws_subnet" "public" {
  count                   = length(var.azs)
  vpc_id                  = aws_vpc.main.id
  availability_zone       = var.azs[count.index]
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  map_public_ip_on_launch = true

  tags = {
    Name = "medivault-${var.environment}-public-${var.azs[count.index]}"
    Tier = "public"
  }
}

resource "aws_subnet" "private" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.main.id
  availability_zone = var.azs[count.index]
  # offset by 100 so private CIDRs don't collide with public ones
  cidr_block = cidrsubnet(var.vpc_cidr, 8, count.index + 100)

  tags = {
    Name = "medivault-${var.environment}-private-${var.azs[count.index]}"
    Tier = "private"
  }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "medivault-${var.environment}-nat" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = "medivault-${var.environment}-nat" }
  depends_on    = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "medivault-${var.environment}-public-rt" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = { Name = "medivault-${var.environment}-private-rt" }
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ─── Security groups ──────────────────────────────────────────────────────────

resource "aws_security_group" "alb" {
  name        = "medivault-${var.environment}-alb"
  description = "Public ingress to the ALB; egress to API tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTP (redirects to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "api" {
  name        = "medivault-${var.environment}-api"
  description = "API Fargate tasks; ingress from ALB only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "From ALB"
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "rds" {
  name        = "medivault-${var.environment}-rds"
  description = "Postgres; ingress from API tasks only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "From API"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }
}

resource "aws_security_group" "redis" {
  name        = "medivault-${var.environment}-redis"
  description = "ElastiCache; ingress from API tasks only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "From API"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }
}
