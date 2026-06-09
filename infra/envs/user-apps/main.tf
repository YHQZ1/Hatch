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

module "ecs" {
  source             = "../../modules/ecs"
  project_name       = var.project_name
  aws_region         = var.aws_region
  container_insights = var.container_insights
}

module "ecr" {
  source          = "../../modules/ecr"
  repository_name = var.ecr_repository_name
  scan_on_push    = var.ecr_scan_on_push
}

module "user_app_alb" {
  source              = "../../modules/user_app_alb"
  project_name        = var.project_name
  vpc_id              = module.networking.vpc_id
  public_subnet_ids   = module.networking.public_subnet_ids
  alb_sg_id           = module.networking.alb_sg_id
  acm_certificate_arn = var.acm_certificate_arn
  ssl_policy          = var.ssl_policy
}
