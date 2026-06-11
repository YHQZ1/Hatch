variable "project_name" {
  description = "Name prefix for the control-plane host."
  type        = string
}

variable "vpc_id" {
  description = "VPC for the control-plane host."
  type        = string
}

variable "subnet_id" {
  description = "Subnet for the control-plane host."
  type        = string
}

variable "alb_sg_id" {
  description = "Security group allowed to reach control-plane service ports."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type for the control-plane host."
  type        = string
  default     = "t3.medium"
}

variable "key_name" {
  description = "Optional EC2 key pair for emergency SSH access."
  type        = string
  default     = null
}

variable "ssh_cidr_blocks" {
  description = "CIDR blocks allowed to SSH into the host. Keep empty to disable SSH ingress."
  type        = list(string)
  default     = []
}

variable "aws_region" {
  description = "AWS region used by bootstrap scripts."
  type        = string
}

variable "user_app_ecr_repository_arn" {
  description = "ECR repository ARN used for user app images."
  type        = string
}

variable "control_plane_ecr_repository_arns" {
  description = "ECR repository ARNs used for Hatch control-plane service images."
  type        = list(string)
  default     = []
}

variable "user_app_task_execution_role_arn" {
  description = "Task execution role passed to user app ECS tasks."
  type        = string
}

variable "user_app_resource_arn_patterns" {
  description = "ARN patterns for user-app ECS/ELB resources managed by the deployer."
  type        = list(string)
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
}

resource "aws_security_group" "host" {
  name        = "${var.project_name}-control-host-sg"
  description = "Hatch control-plane host"
  vpc_id      = var.vpc_id

  ingress {
    description     = "API from ALB"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [var.alb_sg_id]
  }

  ingress {
    description     = "Web from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [var.alb_sg_id]
  }

  dynamic "ingress" {
    for_each = length(var.ssh_cidr_blocks) > 0 ? [1] : []

    content {
      description = "Emergency SSH"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = var.ssh_cidr_blocks
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name  = "${var.project_name}-control-host-sg"
    Plane = "control"
  }
}

resource "aws_iam_role" "host" {
  name = "${var.project_name}-control-host-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.host.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "runtime" {
  name = "${var.project_name}-control-runtime"
  role = aws_iam_role.host.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "AuthenticateToEcr"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid    = "ReadAndPushUserImages"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchDeleteImage",
          "ecr:BatchGetImage",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeImages",
          "ecr:DescribeRepositories",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
        ]
        Resource = concat([var.user_app_ecr_repository_arn], var.control_plane_ecr_repository_arns)
      },
      {
        Sid    = "ManageUserAppEcsAndAlb"
        Effect = "Allow"
        Action = [
          "ecs:CreateService",
          "ecs:DeleteService",
          "ecs:DeregisterTaskDefinition",
          "ecs:DescribeServices",
          "ecs:DescribeTasks",
          "ecs:RegisterTaskDefinition",
          "ecs:UpdateService",
          "elasticloadbalancing:CreateRule",
          "elasticloadbalancing:CreateTargetGroup",
          "elasticloadbalancing:DeleteRule",
          "elasticloadbalancing:DeleteTargetGroup",
          "elasticloadbalancing:DescribeRules",
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:DescribeTargetHealth",
          "elasticloadbalancing:ModifyRule",
          "elasticloadbalancing:ModifyTargetGroup",
          "elasticloadbalancing:SetRulePriorities"
        ]
        Resource = "*"
      },
      {
        Sid    = "ReadUserAppMetrics"
        Effect = "Allow"
        Action = [
          "cloudwatch:GetMetricData",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics"
        ]
        Resource = "*"
      },
      {
        Sid      = "PassUserAppTaskExecutionRole"
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = var.user_app_task_execution_role_arn
      }
    ]
  })
}

resource "aws_iam_instance_profile" "host" {
  name = "${var.project_name}-control-host-profile"
  role = aws_iam_role.host.name
}

resource "aws_instance" "main" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [aws_security_group.host.id]
  iam_instance_profile        = aws_iam_instance_profile.host.name
  key_name                    = var.key_name
  associate_public_ip_address = true

  user_data = <<-EOF
              #!/bin/bash
              set -euxo pipefail
              apt-get update
              apt-get install -y ca-certificates curl git docker.io awscli
              systemctl enable --now docker
              mkdir -p /opt/hatch
              cat >/opt/hatch/README <<'TXT'
              This host is provisioned by Terraform for the Hatch control plane.
              Deploy API, web, builder, and deployer containers here, or replace
              this host with ECS services once builder no longer needs Docker.
              TXT
              EOF

  root_block_device {
    volume_size = 40
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name  = "${var.project_name}-control-host"
    Plane = "control"
  }
}

output "instance_id" {
  value = aws_instance.main.id
}

output "public_ip" {
  value = aws_instance.main.public_ip
}

output "security_group_id" {
  value = aws_security_group.host.id
}

output "iam_role_arn" {
  value = aws_iam_role.host.arn
}
