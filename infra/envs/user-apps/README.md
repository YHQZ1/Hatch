# Hatch User App Data Plane

This stack provisions the infrastructure used by deployed user applications. It does not host Hatch's own API, web app, builder, deployer, database, Redis, or RabbitMQ.

## What It Creates

- VPC with two public subnets
- Internet-facing user app ALB
- HTTP listener that redirects to HTTPS
- HTTPS listener with a fixed 404 default response
- ECS cluster for user app services
- ECS task execution role
- ECR repository for built user app images
- Security groups for ALB and ECS tasks

## Domain Model

Prefer a dedicated app domain such as:

```text
*.apps.hatchcloud.xyz
```

This keeps Hatch's control plane separate from user workloads:

```text
app.hatchcloud.xyz      -> Hatch web control plane
api.hatchcloud.xyz      -> Hatch API control plane
*.apps.hatchcloud.xyz   -> deployed user applications
```

For the current single-wildcard setup, set:

```hcl
user_app_base_domain = "hatchcloud.xyz"
```

The ACM certificate must cover the chosen base domain and wildcard.

## Required Variable

```hcl
acm_certificate_arn = "arn:aws:acm:ap-south-1:<account-id>:certificate/<id>"
```

## Planning Safely

If you already created Hatch resources manually, avoid using `project_name = "hatch"` for this stack. Names like `hatch-cluster`, `hatch-builds`, and `hatch-ecs-task-execution` may already exist and will collide during apply.

Use the example vars file as the safe starting point:

```bash
cp terraform.tfvars.example terraform.tfvars
terraform plan
```

This creates a parallel Terraform-managed data plane with names such as `hatch-user-apps-cluster` and `hatch-user-app-builds`.

The example file pins Terraform to the local AWS CLI profile:

```hcl
aws_profile = "hatch-new"
```

If an apply accidentally ran against the wrong AWS account, destroy those resources before enabling the new profile:

```bash
terraform destroy
```

Then confirm the profile and apply again:

```bash
aws sts get-caller-identity --profile hatch-new
terraform plan
terraform apply
```

## Outputs To Use

After `terraform apply`, use:

```bash
terraform output deployer_env
terraform output builder_env
```

Those maps correspond to the env vars consumed by `apps/deployer` and `apps/builder`.

Point DNS for the wildcard user app domain to `user_app_alb_dns_name`.
