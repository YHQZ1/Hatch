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
  source              = "../../modules/alb"
  project_name        = var.project_name
  vpc_id              = module.networking.vpc_id
  public_subnet_a     = module.networking.public_subnet_a
  public_subnet_b     = module.networking.public_subnet_b
  alb_sg_id           = module.networking.alb_sg_id
  acm_certificate_arn = "arn:aws:acm:ap-south-1:362041633362:certificate/4fb3dd8e-6a54-4fec-a5da-0e1c8cfe5ad0"
}

module "hatch_server" {
  source       = "../../modules/ec2"
  project_name = var.project_name
  vpc_id       = module.networking.vpc_id
  subnet_id    = module.networking.public_subnet_a
  alb_sg_id    = module.networking.alb_sg_id
  api_tg_arn   = module.alb.api_tg_arn
  key_name     = "hatch"
}

output "hatch_server_ip" { value = module.hatch_server.public_ip }
output "alb_dns_name"     { value = module.alb.alb_dns_name }