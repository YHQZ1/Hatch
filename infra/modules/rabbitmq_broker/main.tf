variable "project_name" {
  description = "Name prefix for RabbitMQ resources."
  type        = string
}

variable "vpc_id" {
  description = "VPC for RabbitMQ."
  type        = string
}

variable "subnet_ids" {
  description = "Subnets for RabbitMQ. Single-instance brokers use the first subnet."
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security groups allowed to connect to RabbitMQ."
  type        = list(string)
}

variable "username" {
  description = "RabbitMQ username."
  type        = string
  default     = "hatch"
}

variable "password" {
  description = "RabbitMQ password."
  type        = string
  sensitive   = true
}

variable "host_instance_type" {
  description = "Amazon MQ broker instance type."
  type        = string
  default     = "mq.t3.micro"
}

variable "engine_version" {
  description = "RabbitMQ engine version."
  type        = string
  default     = "3.13"
}

resource "aws_security_group" "main" {
  name        = "${var.project_name}-rabbitmq-sg"
  description = "Hatch control-plane RabbitMQ"
  vpc_id      = var.vpc_id

  ingress {
    description     = "AMQPS"
    from_port       = 5671
    to_port         = 5671
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }

  ingress {
    description     = "RabbitMQ management over TLS"
    from_port       = 15671
    to_port         = 15671
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
    Name  = "${var.project_name}-rabbitmq-sg"
    Plane = "control"
  }
}

resource "aws_mq_broker" "main" {
  broker_name         = "${var.project_name}-rabbitmq"
  engine_type         = "RabbitMQ"
  engine_version      = var.engine_version
  host_instance_type  = var.host_instance_type
  deployment_mode     = "SINGLE_INSTANCE"
  publicly_accessible = false
  subnet_ids          = [var.subnet_ids[0]]
  security_groups     = [aws_security_group.main.id]

  user {
    username = var.username
    password = var.password
  }

  logs {
    general = true
  }

  tags = {
    Name  = "${var.project_name}-rabbitmq"
    Plane = "control"
  }
}

output "endpoint" {
  value = aws_mq_broker.main.instances[0].endpoints[0]
}

output "rabbitmq_url" {
  value     = "amqps://${var.username}:${var.password}@${replace(aws_mq_broker.main.instances[0].endpoints[0], "amqps://", "")}/"
  sensitive = true
}
