variable "key_name" {
  description = "Name of the SSH key pair"
  type        = string
}
variable "project_name" {}
variable "vpc_id"       {}
variable "subnet_id"    {}
variable "alb_sg_id"    {}
variable "api_tg_arn"   {}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
}

# IAM Role for EC2 (Allows Builder to use ECR)
resource "aws_iam_role" "hatch_server_role" {
  name = "${var.project_name}-server-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecr_power_user" {
  role       = aws_iam_role.hatch_server_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser"
}

resource "aws_iam_instance_profile" "hatch_server_profile" {
  name = "${var.project_name}-server-profile"
  role = aws_iam_role.hatch_server_role.name
}

# Security Group
resource "aws_security_group" "ec2" {
  name   = "${var.project_name}-ec2-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # Recommendation: Restrict to your IP
  }

  ingress {
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [var.alb_sg_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "main" {
  ami                  = data.aws_ami.ubuntu.id
  instance_type        = "m7i-flex.large"
  subnet_id            = var.subnet_id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile = aws_iam_instance_profile.hatch_server_profile.name
  key_name = var.key_name
  
  # User data to auto-install Docker/Go/PM2
  user_data = <<-EOF
              #!/bin/bash
              apt-get update
              apt-get install -y docker.io golang-go nodejs npm
              npm install -g pm2
              EOF

  tags = { Name = "${var.project_name}-server" }
}

resource "aws_lb_target_group_attachment" "api" {
  target_group_arn = var.api_tg_arn
  target_id        = aws_instance.main.id
  port             = 8080
}

output "public_ip" { value = aws_instance.main.public_ip }