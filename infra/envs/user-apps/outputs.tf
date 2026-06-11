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

output "user_app_alb_arn" {
  value = module.user_app_alb.alb_arn
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

output "control_plane_tfvars" {
  description = "Values from this data-plane stack that should be copied into infra/envs/control-plane/terraform.tfvars."
  value = {
    user_app_base_domain             = var.user_app_base_domain
    user_app_deployment_url_scheme   = var.deployment_url_scheme
    user_app_ecr_registry            = module.ecr.registry
    user_app_ecr_repository_name     = module.ecr.repository_name
    user_app_ecr_repository_arn      = module.ecr.repository_arn
    user_app_ecs_cluster_name        = module.ecs.cluster_name
    user_app_http_listener_arn       = module.user_app_alb.http_listener_arn
    user_app_https_listener_arn      = module.user_app_alb.https_listener_arn
    user_app_alb_arn                 = module.user_app_alb.alb_arn
    user_app_vpc_id                  = module.networking.vpc_id
    user_app_subnet_a                = module.networking.public_subnet_ids[0]
    user_app_subnet_b                = module.networking.public_subnet_ids[1]
    user_app_ecs_security_group_id   = module.networking.ecs_sg_id
    user_app_task_execution_role_arn = module.ecs.task_execution_role_arn
  }
}
