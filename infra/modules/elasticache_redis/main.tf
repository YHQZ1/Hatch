variable "project_name" {
  description = "Name prefix for Redis resources."
  type        = string
}

variable "vpc_id" {
  description = "VPC for Redis."
  type        = string
}

variable "subnet_ids" {
  description = "Subnets for Redis."
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security groups allowed to connect to Redis."
  type        = list(string)
}

variable "node_type" {
  description = "Redis node type."
  type        = string
  default     = "cache.t4g.micro"
}

variable "engine_version" {
  description = "Redis engine version."
  type        = string
  default     = "7.1"
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-redis-subnets"
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "main" {
  name        = "${var.project_name}-redis-sg"
  description = "Hatch control-plane Redis"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name  = "${var.project_name}-redis-sg"
    Plane = "control"
  }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${var.project_name}-redis"
  description                = "Hatch control-plane Redis"
  engine                     = "redis"
  engine_version             = var.engine_version
  node_type                  = var.node_type
  num_cache_clusters         = 1
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.main.id]
  automatic_failover_enabled = false
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false

  tags = {
    Name  = "${var.project_name}-redis"
    Plane = "control"
  }
}

output "primary_endpoint" {
  value = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "port" {
  value = aws_elasticache_replication_group.main.port
}

output "redis_url" {
  value = "redis://${aws_elasticache_replication_group.main.primary_endpoint_address}:${aws_elasticache_replication_group.main.port}"
}
