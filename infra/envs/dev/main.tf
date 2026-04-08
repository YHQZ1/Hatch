terraform {
  backend "s3" {
    bucket = "hatch-terraform-state-362041633362"
    key    = "hatch/dev/terraform.tfstate"
    region = "ap-south-1"
  } 

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

module "networking" {
  source       = "../../modules/networking"
  project_name = var.project_name
}

module "ecs" {
  source       = "../../modules/ecs"
  project_name = var.project_name
  aws_region   = var.aws_region
}

module "alb" {
  source         = "../../modules/alb"
  project_name   = var.project_name
  vpc_id         = module.networking.vpc_id
  public_subnet_a = module.networking.public_subnet_a
  public_subnet_b = module.networking.public_subnet_b
  alb_sg_id      = module.networking.alb_sg_id
  acm_certificate_arn = "arn:aws:acm:ap-south-1:362041633362:certificate/4fb3dd8e-6a54-4fec-a5da-0e1c8cfe5ad0"
}

output "alb_dns_name"      { value = module.alb.alb_dns_name }
output "alb_arn"           { value = module.alb.alb_arn }
output "alb_listener_arn"  { value = module.alb.alb_listener_arn }
output "alb_https_listener_arn" { value = module.alb.alb_https_listener_arn }
output "ecs_cluster_name"  { value = module.ecs.cluster_name }
output "ecs_cluster_arn"   { value = module.ecs.cluster_arn }
output "task_execution_role_arn" { value = module.ecs.task_execution_role_arn }
output "vpc_id"            { value = module.networking.vpc_id }
output "public_subnet_a"   { value = module.networking.public_subnet_a }
output "public_subnet_b"   { value = module.networking.public_subnet_b }
output "ecs_sg_id"         { value = module.networking.ecs_sg_id }