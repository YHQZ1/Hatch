terraform {
  backend "s3" {
    bucket = "hatch-terraform-state-396913726010"
    key    = "hatch/terraform.tfstate"
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