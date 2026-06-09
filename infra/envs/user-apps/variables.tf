variable "aws_region" {
  description = "AWS region for the user app data plane."
  type        = string
  default     = "ap-south-1"
}

variable "aws_profile" {
  description = "Optional local AWS CLI profile used by Terraform."
  type        = string
  default     = null
}

variable "project_name" {
  description = "Name prefix for data-plane infrastructure."
  type        = string
  default     = "hatch"
}

variable "user_app_base_domain" {
  description = "Base domain used by deployed user apps. Prefer apps.hatchcloud.xyz for isolation."
  type        = string
  default     = "apps.hatchcloud.xyz"
}

variable "deployment_url_scheme" {
  description = "URL scheme emitted by Hatch for deployed user apps."
  type        = string
  default     = "https"
}

variable "acm_certificate_arn" {
  description = "Issued ACM certificate ARN covering user_app_base_domain and its wildcard."
  type        = string
}

variable "ssl_policy" {
  description = "TLS policy for the user app HTTPS listener."
  type        = string
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
}

variable "vpc_cidr" {
  description = "CIDR block for the user app VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones for public user app subnets."
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b"]
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs for the user app data plane."
  type        = list(string)
  default     = ["10.20.1.0/24", "10.20.2.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) >= 2
    error_message = "At least two public subnet CIDRs are required for an ALB."
  }
}

variable "container_insights" {
  description = "ECS Container Insights setting for user app workloads."
  type        = string
  default     = "disabled"
}

variable "ecr_repository_name" {
  description = "ECR repository for built user app images."
  type        = string
  default     = "hatch-builds"
}

variable "ecr_scan_on_push" {
  description = "Enable ECR image scanning for built user app images."
  type        = bool
  default     = true
}
