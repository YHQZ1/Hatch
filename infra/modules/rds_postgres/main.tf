variable "project_name" {
  description = "Name prefix for Postgres resources."
  type        = string
}

variable "vpc_id" {
  description = "VPC for Postgres."
  type        = string
}

variable "subnet_ids" {
  description = "Subnets for the DB subnet group."
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security groups allowed to connect to Postgres."
  type        = list(string)
}

variable "database_name" {
  description = "Initial database name."
  type        = string
  default     = "hatch"
}

variable "username" {
  description = "Master username."
  type        = string
  default     = "hatch"
}

variable "password" {
  description = "Master password."
  type        = string
  sensitive   = true
}

variable "instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage" {
  description = "Allocated storage in GB."
  type        = number
  default     = 20
}

variable "engine_version" {
  description = "Postgres engine version."
  type        = string
  default     = "16.4"
}

variable "deletion_protection" {
  description = "Enable deletion protection."
  type        = bool
  default     = true
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-postgres-subnets"
  subnet_ids = var.subnet_ids

  tags = {
    Name  = "${var.project_name}-postgres-subnets"
    Plane = "control"
  }
}

resource "aws_security_group" "main" {
  name        = "${var.project_name}-postgres-sg"
  description = "Hatch control-plane Postgres"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
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
    Name  = "${var.project_name}-postgres-sg"
    Plane = "control"
  }
}

resource "aws_db_instance" "main" {
  identifier                 = "${var.project_name}-postgres"
  engine                     = "postgres"
  engine_version             = var.engine_version
  instance_class             = var.instance_class
  allocated_storage          = var.allocated_storage
  storage_type               = "gp3"
  storage_encrypted          = true
  db_name                    = var.database_name
  username                   = var.username
  password                   = var.password
  db_subnet_group_name       = aws_db_subnet_group.main.name
  vpc_security_group_ids     = [aws_security_group.main.id]
  publicly_accessible        = false
  backup_retention_period    = 7
  deletion_protection        = var.deletion_protection
  skip_final_snapshot        = !var.deletion_protection
  auto_minor_version_upgrade = true

  tags = {
    Name  = "${var.project_name}-postgres"
    Plane = "control"
  }
}

output "endpoint" {
  value = aws_db_instance.main.address
}

output "port" {
  value = aws_db_instance.main.port
}

output "database_url" {
  value     = "postgres://${var.username}:${var.password}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.database_name}?sslmode=require"
  sensitive = true
}
