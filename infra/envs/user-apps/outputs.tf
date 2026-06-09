output "vpc_id" {
  value = module.networking.vpc_id
}

output "public_subnet_ids" {
  value = module.networking.public_subnet_ids
}

output "ecs_security_group_id" {
  value = module.networking.ecs_sg_id
}

output "alb_security_group_id" {
  value = module.networking.alb_sg_id
}

output "ecs_cluster_name" {
  value = module.ecs.cluster_name
}

output "task_execution_role_arn" {
  value = module.ecs.task_execution_role_arn
}

output "user_app_alb_dns_name" {
  value = module.user_app_alb.alb_dns_name
}

output "user_app_alb_zone_id" {
  value = module.user_app_alb.alb_zone_id
}

output "user_app_http_listener_arn" {
  value = module.user_app_alb.http_listener_arn
}

output "user_app_https_listener_arn" {
  value = module.user_app_alb.https_listener_arn
}

output "ecr_registry" {
  value = module.ecr.registry
}

output "ecr_repository" {
  value = module.ecr.repository_name
}

output "ecr_repository_url" {
  value = module.ecr.repository_url
}

output "deployer_env" {
  description = "Environment values consumed by apps/deployer."
  value = {
    AWS_REGION              = var.aws_region
    ECS_CLUSTER_NAME        = module.ecs.cluster_name
    ALB_LISTENER_ARN        = module.user_app_alb.http_listener_arn
    ALB_HTTPS_LISTENER_ARN  = module.user_app_alb.https_listener_arn
    BASE_DOMAIN             = var.user_app_base_domain
    DEPLOYMENT_URL_SCHEME   = var.deployment_url_scheme
    VPC_ID                  = module.networking.vpc_id
    SUBNET_A                = module.networking.public_subnet_ids[0]
    SUBNET_B                = module.networking.public_subnet_ids[1]
    ECS_SG_ID               = module.networking.ecs_sg_id
    TASK_EXECUTION_ROLE_ARN = module.ecs.task_execution_role_arn
    ECR_REGISTRY            = module.ecr.registry
  }
}

output "builder_env" {
  description = "Environment values consumed by apps/builder."
  value = {
    AWS_REGION     = var.aws_region
    ECR_REGISTRY   = module.ecr.registry
    ECR_REPOSITORY = module.ecr.repository_name
  }
}
