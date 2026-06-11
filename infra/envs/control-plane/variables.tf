variable "aws_region" {
  description = "AWS region for Hatch control-plane infrastructure."
  type        = string
  default     = "ap-south-1"
}

variable "aws_profile" {
  description = "Optional local AWS CLI profile used by Terraform."
  type        = string
  default     = null
}

variable "project_name" {
  description = "Name prefix for control-plane infrastructure."
  type        = string
  default     = "hatch-control"
}

variable "vpc_cidr" {
  description = "CIDR block for the control-plane VPC."
  type        = string
  default     = "10.30.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones for public control-plane subnets."
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b"]
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs for the control plane."
  type        = list(string)
  default     = ["10.30.1.0/24", "10.30.2.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) >= 2
    error_message = "At least two public subnet CIDRs are required for the ALB."
  }
}

variable "acm_certificate_arn" {
  description = "Issued ACM certificate ARN covering api_hostname and web_hostnames."
  type        = string
}

variable "ssl_policy" {
  description = "TLS policy for the control-plane HTTPS listener."
  type        = string
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
}

variable "api_hostname" {
  description = "Hostname routed to the Hatch API."
  type        = string
  default     = "api.hatchcloud.xyz"
}

variable "web_hostnames" {
  description = "Hostnames routed to the Hatch web console."
  type        = list(string)
  default     = ["app.hatchcloud.xyz"]
}

variable "control_host_instance_type" {
  description = "EC2 instance type for API/web/builder/deployer."
  type        = string
  default     = "t3.medium"
}

variable "control_host_key_name" {
  description = "Optional EC2 key pair for emergency SSH access."
  type        = string
  default     = null
}

variable "control_host_ssh_cidr_blocks" {
  description = "CIDR blocks allowed to SSH into the control host. Keep empty and use SSM by default."
  type        = list(string)
  default     = []
}

variable "control_plane_ecr_repositories" {
  description = "ECR repositories for Hatch control-plane service images."
  type        = list(string)
  default = [
    "hatch-api",
    "hatch-web",
    "hatch-builder",
    "hatch-deployer",
  ]
}

variable "ecr_scan_on_push" {
  description = "Enable image scanning for Hatch control-plane repositories."
  type        = bool
  default     = true
}

variable "postgres_database_name" {
  description = "Control-plane Postgres database name."
  type        = string
  default     = "hatch"
}

variable "postgres_username" {
  description = "Control-plane Postgres username."
  type        = string
  default     = "hatch"
}

variable "postgres_password" {
  description = "Control-plane Postgres password."
  type        = string
  sensitive   = true
}

variable "postgres_instance_class" {
  description = "Control-plane Postgres instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "postgres_allocated_storage" {
  description = "Control-plane Postgres allocated storage in GB."
  type        = number
  default     = 20
}

variable "postgres_engine_version" {
  description = "Control-plane Postgres engine version."
  type        = string
  default     = "16.4"
}

variable "postgres_deletion_protection" {
  description = "Enable deletion protection for control-plane Postgres."
  type        = bool
  default     = true
}

variable "redis_node_type" {
  description = "Control-plane Redis node type."
  type        = string
  default     = "cache.t4g.micro"
}

variable "redis_engine_version" {
  description = "Control-plane Redis engine version."
  type        = string
  default     = "7.1"
}

variable "rabbitmq_username" {
  description = "Control-plane RabbitMQ username."
  type        = string
  default     = "hatch"
}

variable "rabbitmq_password" {
  description = "Control-plane RabbitMQ password."
  type        = string
  sensitive   = true
}

variable "rabbitmq_host_instance_type" {
  description = "Control-plane RabbitMQ broker instance type."
  type        = string
  default     = "mq.t3.micro"
}

variable "rabbitmq_engine_version" {
  description = "Control-plane RabbitMQ engine version."
  type        = string
  default     = "3.13"
}

variable "github_client_id" {
  description = "GitHub OAuth app client ID used by the API env output."
  type        = string
}

variable "github_client_secret" {
  description = "GitHub OAuth app client secret used by the API env output."
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT session signing secret used by the API env output."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.jwt_secret) >= 32
    error_message = "jwt_secret must be at least 32 characters."
  }
}

variable "data_encryption_key" {
  description = "Shared secret used by API, builder, and deployer to encrypt stored tokens and environment variables."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.data_encryption_key) >= 32
    error_message = "data_encryption_key must be at least 32 characters."
  }
}

variable "user_app_base_domain" {
  description = "Base domain used by deployed user apps."
  type        = string
  default     = "hatchcloud.xyz"
}

variable "user_app_deployment_url_scheme" {
  description = "URL scheme emitted for deployed user apps."
  type        = string
  default     = "https"
}

variable "user_app_ecr_registry" {
  description = "ECR registry for user app builds."
  type        = string
}

variable "user_app_ecr_repository_name" {
  description = "ECR repository name for user app builds."
  type        = string
}

variable "user_app_ecr_repository_arn" {
  description = "ECR repository ARN for user app builds."
  type        = string
}

variable "builder_build_timeout" {
  description = "Maximum duration for one user app build before the builder marks it failed."
  type        = string
  default     = "30m"
}

variable "user_app_ecs_cluster_name" {
  description = "ECS cluster used by deployed user apps."
  type        = string
}

variable "user_app_http_listener_arn" {
  description = "HTTP listener ARN for user app routing."
  type        = string
}

variable "user_app_https_listener_arn" {
  description = "HTTPS listener ARN for user app routing."
  type        = string
}

variable "user_app_alb_arn" {
  description = "ALB ARN for user app metrics."
  type        = string
  default     = ""
}

variable "user_app_vpc_id" {
  description = "VPC ID for user app workloads."
  type        = string
}

variable "user_app_subnet_a" {
  description = "First user app subnet."
  type        = string
}

variable "user_app_subnet_b" {
  description = "Second user app subnet."
  type        = string
}

variable "user_app_ecs_security_group_id" {
  description = "Security group used by user app ECS tasks."
  type        = string
}

variable "user_app_task_execution_role_arn" {
  description = "Task execution role used by user app ECS tasks."
  type        = string
}

variable "user_app_resource_arn_patterns" {
  description = "ARN patterns for user app resources managed by Hatch deployer."
  type        = list(string)
  default     = ["*"]
}
