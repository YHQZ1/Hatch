variable "repository_name" {
  description = "ECR repository used for built user application images."
  type        = string
}

variable "image_tag_mutability" {
  description = "Whether image tags are mutable or immutable."
  type        = string
  default     = "MUTABLE"
}

variable "scan_on_push" {
  description = "Enable ECR image scanning on push."
  type        = bool
  default     = true
}

resource "aws_ecr_repository" "main" {
  name                 = var.repository_name
  image_tag_mutability = var.image_tag_mutability

  image_scanning_configuration {
    scan_on_push = var.scan_on_push
  }
}

output "repository_name" {
  value = aws_ecr_repository.main.name
}

output "repository_url" {
  value = aws_ecr_repository.main.repository_url
}

output "registry" {
  value = split("/", aws_ecr_repository.main.repository_url)[0]
}
