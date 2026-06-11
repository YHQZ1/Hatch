# Hatch Control Plane

This stack provisions the infrastructure that runs Hatch itself:

- internet-facing ALB for `api` and web console hostnames
- one EC2 control host for `api`, `web`, `builder`, and `deployer`
- RDS Postgres
- ElastiCache Redis
- Amazon MQ RabbitMQ
- ECR repositories for Hatch control-plane service images
- IAM permissions for the deployer to manage the user-app data plane

The builder currently shells out to Docker, so the first production control plane
uses an EC2 host. Once builds move to CodeBuild, BuildKit, or another remote
builder, API/web/deployer can move cleanly to ECS/Fargate.

## Usage

```bash
cd infra/envs/control-plane
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

After apply, read the sensitive env outputs:

```bash
terraform output -json api_env
terraform output -json web_env
terraform output -json builder_env
terraform output -json deployer_env
```

Point DNS records such as `api.hatchcloud.xyz` and `app.hatchcloud.xyz` at
`control_alb_dns_name`.

## Production HA Knobs

The control-plane stack defaults Redis to TLS, two cache nodes, and automatic
failover. RabbitMQ remains `SINGLE_INSTANCE` by default because Amazon MQ
RabbitMQ clustering requires a supported instance size and at least three
subnets. To move RabbitMQ to HA, expand `availability_zones` and
`public_subnet_cidrs` to three entries, use a supported broker instance type,
then set:

```hcl
rabbitmq_deployment_mode = "CLUSTER_MULTI_AZ"
```

Changing Redis encryption/failover or RabbitMQ deployment mode on an existing
stack may replace managed resources. Plan carefully before applying to a live
control plane.

Do not destroy the old/manual control-plane resources until DNS has been cut
over and API, web, builder, deployer, GitHub OAuth, and a fresh deployment have
all been verified.
