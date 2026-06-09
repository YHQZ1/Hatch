variable "project_name" {
  description = "Name prefix for data-plane ALB resources."
  type        = string
}

variable "vpc_id" {
  description = "VPC that contains user app targets."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnets for the internet-facing user app ALB."
  type        = list(string)
}

variable "alb_sg_id" {
  description = "Security group attached to the user app ALB."
  type        = string
}

variable "acm_certificate_arn" {
  description = "Issued ACM certificate ARN for the user app wildcard domain."
  type        = string
}

variable "ssl_policy" {
  description = "TLS policy for the HTTPS listener."
  type        = string
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
}

resource "aws_lb" "main" {
  name               = "${var.project_name}-apps-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_sg_id]
  subnets            = var.public_subnet_ids

  tags = {
    Name  = "${var.project_name}-apps-alb"
    Plane = "data"
  }
}

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

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = var.ssl_policy
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Hatch: No user app mapped to this subdomain."
      status_code  = "404"
    }
  }
}

output "alb_arn" {
  value = aws_lb.main.arn
}

output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "alb_zone_id" {
  value = aws_lb.main.zone_id
}

output "http_listener_arn" {
  value = aws_lb_listener.http.arn
}

output "https_listener_arn" {
  value = aws_lb_listener.https.arn
}
