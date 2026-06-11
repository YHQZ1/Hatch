terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

module "networking" {
  source              = "../../modules/networking"
  project_name        = var.project_name
  vpc_cidr            = var.vpc_cidr
  availability_zones  = var.availability_zones
  public_subnet_cidrs = var.public_subnet_cidrs
}

module "control_plane_ecr" {
  source          = "../../modules/ecr"
  for_each        = toset(var.control_plane_ecr_repositories)
  repository_name = each.value
  scan_on_push    = var.ecr_scan_on_push
}

module "control_host" {
  source                            = "../../modules/control_plane_host"
  project_name                      = var.project_name
  aws_region                        = var.aws_region
  vpc_id                            = module.networking.vpc_id
  subnet_id                         = module.networking.public_subnet_ids[0]
  alb_sg_id                         = module.networking.alb_sg_id
  instance_type                     = var.control_host_instance_type
  key_name                          = var.control_host_key_name
  ssh_cidr_blocks                   = var.control_host_ssh_cidr_blocks
  user_app_ecr_repository_arn       = var.user_app_ecr_repository_arn
  control_plane_ecr_repository_arns = [for repo in module.control_plane_ecr : repo.repository_arn]
  user_app_task_execution_role_arn  = var.user_app_task_execution_role_arn
  user_app_resource_arn_patterns    = var.user_app_resource_arn_patterns
}

module "postgres" {
  source                     = "../../modules/rds_postgres"
  project_name               = var.project_name
  vpc_id                     = module.networking.vpc_id
  subnet_ids                 = module.networking.public_subnet_ids
  allowed_security_group_ids = [module.control_host.security_group_id]
  database_name              = var.postgres_database_name
  username                   = var.postgres_username
  password                   = var.postgres_password
  instance_class             = var.postgres_instance_class
  allocated_storage          = var.postgres_allocated_storage
  engine_version             = var.postgres_engine_version
  deletion_protection        = var.postgres_deletion_protection
}

module "redis" {
  source                     = "../../modules/elasticache_redis"
  project_name               = var.project_name
  vpc_id                     = module.networking.vpc_id
  subnet_ids                 = module.networking.public_subnet_ids
  allowed_security_group_ids = [module.control_host.security_group_id]
  node_type                  = var.redis_node_type
  engine_version             = var.redis_engine_version
  num_cache_clusters         = var.redis_num_cache_clusters
  automatic_failover_enabled = var.redis_automatic_failover_enabled
  transit_encryption_enabled = var.redis_transit_encryption_enabled
}

module "rabbitmq" {
  source                     = "../../modules/rabbitmq_broker"
  project_name               = var.project_name
  vpc_id                     = module.networking.vpc_id
  subnet_ids                 = module.networking.public_subnet_ids
  allowed_security_group_ids = [module.control_host.security_group_id]
  username                   = var.rabbitmq_username
  password                   = var.rabbitmq_password
  host_instance_type         = var.rabbitmq_host_instance_type
  engine_version             = var.rabbitmq_engine_version
  deployment_mode            = var.rabbitmq_deployment_mode
}

module "control_alb" {
  source              = "../../modules/control_plane_alb"
  project_name        = var.project_name
  vpc_id              = module.networking.vpc_id
  public_subnet_ids   = module.networking.public_subnet_ids
  alb_sg_id           = module.networking.alb_sg_id
  acm_certificate_arn = var.acm_certificate_arn
  api_hostname        = var.api_hostname
  web_hostnames       = var.web_hostnames
  target_instance_id  = module.control_host.instance_id
  ssl_policy          = var.ssl_policy
}
