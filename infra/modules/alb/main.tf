variable "project_name"    {}
variable "vpc_id"          {}
variable "public_subnet_a" {}
variable "public_subnet_b" {}
variable "alb_sg_id"       {}
variable "acm_certificate_arn" {
  description = "The ARN of the issued ACM certificate"
}

resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_sg_id]
  subnets            = [var.public_subnet_a, var.public_subnet_b]

  tags = { Name = "${var.project_name}-alb" }
}

# Default target group (returns 404 for unmatched routes)
resource "aws_lb_target_group" "default" {
  name        = "${var.project_name}-default-tg"
  port        = 80
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
  }
}

# HTTP listener
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
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

# HTTPS listener
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy = "ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Hatch: No project mapped to this subdomain."
      status_code  = "404"
    }
  }
}

output "alb_arn"          { value = aws_lb.main.arn }
output "alb_dns_name"     { value = aws_lb.main.dns_name }
output "alb_listener_arn" { value = aws_lb_listener.http.arn }
output "alb_https_listener_arn" { value = aws_lb_listener.https.arn }
output "vpc_id"           { value = var.vpc_id }