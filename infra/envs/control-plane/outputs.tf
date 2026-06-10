output "control_alb_dns_name" {
  value = module.control_alb.alb_dns_name
}

output "control_alb_zone_id" {
  value = module.control_alb.alb_zone_id
}

output "control_host_public_ip" {
  value = module.control_host.public_ip
}

output "control_host_instance_id" {
  value = module.control_host.instance_id
}

output "control_host_security_group_id" {
  value = module.control_host.security_group_id
}

output "postgres_endpoint" {
  value = module.postgres.endpoint
}

output "redis_endpoint" {
  value = module.redis.primary_endpoint
}

output "rabbitmq_endpoint" {
  value = module.rabbitmq.endpoint
}

output "control_plane_ecr_repositories" {
  value = {
    for name, repo in module.control_plane_ecr : name => {
      name = repo.repository_name
      url  = repo.repository_url
      arn  = repo.repository_arn
    }
  }
}

output "api_env" {
  description = "Environment values consumed by apps/api."
  sensitive   = true
  value = {
    PORT                 = "8080"
    ENVIRONMENT          = "production"
    FRONTEND_URL         = "https://${var.web_hostnames[0]}"
    GITHUB_CLIENT_ID     = var.github_client_id
    GITHUB_CLIENT_SECRET = var.github_client_secret
    GITHUB_REDIRECT_URI  = "https://${var.api_hostname}/auth/callback"
    JWT_SECRET           = var.jwt_secret
    DATABASE_URL         = module.postgres.database_url
    REDIS_URL            = module.redis.redis_url
    RABBITMQ_URL         = module.rabbitmq.rabbitmq_url
    WEBHOOK_BASE_URL     = "https://${var.api_hostname}"
  }
}

output "web_env" {
  description = "Environment values consumed by apps/web."
  value = {
    NEXT_PUBLIC_API_URL               = "https://${var.api_hostname}"
    NEXT_PUBLIC_DEPLOYMENT_URL_SCHEME = var.user_app_deployment_url_scheme
  }
}

output "builder_env" {
  description = "Environment values consumed by apps/builder."
  sensitive   = true
  value = {
    RABBITMQ_URL   = module.rabbitmq.rabbitmq_url
    REDIS_URL      = module.redis.redis_url
    AWS_REGION     = var.aws_region
    ECR_REGISTRY   = var.user_app_ecr_registry
    ECR_REPOSITORY = var.user_app_ecr_repository_name
    DATABASE_URL   = module.postgres.database_url
  }
}

output "deployer_env" {
  description = "Environment values consumed by apps/deployer."
  sensitive   = true
  value = {
    RABBITMQ_URL            = module.rabbitmq.rabbitmq_url
    REDIS_URL               = module.redis.redis_url
    AWS_REGION              = var.aws_region
    ECS_CLUSTER_NAME        = var.user_app_ecs_cluster_name
    ALB_LISTENER_ARN        = var.user_app_http_listener_arn
    ALB_HTTPS_LISTENER_ARN  = var.user_app_https_listener_arn
    BASE_DOMAIN             = var.user_app_base_domain
    DEPLOYMENT_URL_SCHEME   = var.user_app_deployment_url_scheme
    VPC_ID                  = var.user_app_vpc_id
    SUBNET_A                = var.user_app_subnet_a
    SUBNET_B                = var.user_app_subnet_b
    ECS_SG_ID               = var.user_app_ecs_security_group_id
    TASK_EXECUTION_ROLE_ARN = var.user_app_task_execution_role_arn
    ECR_REGISTRY            = var.user_app_ecr_registry
    DATABASE_URL            = module.postgres.database_url
  }
}
