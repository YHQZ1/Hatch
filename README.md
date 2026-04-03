# Hatch

> A self-hosted deployment platform built on AWS. Dockerfile in. Live HTTPS URL out.

![Go](https://img.shields.io/badge/Go-1.23-00ADD8?style=flat-square&logo=go&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=next.js&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-ECS%20%7C%20ECR%20%7C%20RDS-FF9900?style=flat-square&logo=amazon-aws&logoColor=white)
![Terraform](https://img.shields.io/badge/Terraform-IaC-7B42BC?style=flat-square&logo=terraform&logoColor=white)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ-Queue-FF6600?style=flat-square&logo=rabbitmq&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)

---

## What is Hatch?

Hatch is a self-hosted deployment platform — a **Render / Railway alternative** built on AWS — that lets developers go from a GitHub repository to a live, HTTPS-enabled URL without touching any infrastructure.

You bring a `Dockerfile`. Hatch handles the rest: building the image, pushing it to a private container registry, provisioning compute on AWS ECS Fargate, wiring up a load balancer, and pointing a subdomain at your running container. Every step streams back to you in real time via WebSockets.

**The core loop:**

```
git push → connect repo on Hatch → click Deploy
  → live build logs in your browser
  → yourapp.hatch.dev is live
```

Hatch supports **any language, any framework, any runtime** — if it runs in a Docker container, Hatch can deploy it.

---

## Architecture Overview

Hatch is built as a **monorepo of independently deployable microservices**, communicating through a RabbitMQ message queue. Services are intentionally decoupled — the API never calls the builder directly; it publishes a job and moves on.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js Frontend                         │
│              Dashboard · Deploy UI · Live Log Terminal          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST + WebSocket
┌──────────────────────────▼──────────────────────────────────────┐
│                      API Service  (Go · Gin)                    │
│         GitHub OAuth · JWT Auth · WebSocket Hub · CRUD          │
└────────────┬────────────────────────────────────────────────────┘
             │ Publishes BuildJobEvent
             │
     ┌───────▼────────┐         ┌──────────────────────┐
     │   RabbitMQ     │────────▶│   Builder Service     │
     │  Message Queue │         │   (Go)                │
     └───────┬────────┘         │                       │
             │                  │  1. Clone via GitHub  │
             │ BuildCompleteEvt │  2. docker build      │
             │◀─────────────────│  3. Push → AWS ECR    │
             │                  └──────────────────────┘
             │ Publishes DeployJobEvent
             │
             │                  ┌──────────────────────┐
             └─────────────────▶│   Deployer Service   │
                                │   (Go)               │
                                │                      │
                                │  1. Register ECS     │
                                │     Task Definition  │
                                │  2. Launch Fargate   │
                                │     Service          │
                                │  3. Configure ALB    │
                                │  4. Upsert Route53   │
                                │     DNS record       │
                                └──────────────────────┘

     Log streaming (all services → Redis pub/sub → WebSocket → Browser)

     Data layer:  PostgreSQL (RDS) · Redis (ElastiCache) · AWS Secrets Manager
     Infra:       Terraform · AWS ECS Fargate · ECR · ALB · Route53 · ACM
```

### Service Responsibilities

| Service         | Language   | Role                                                                  |
| --------------- | ---------- | --------------------------------------------------------------------- |
| `apps/web`      | Next.js 15 | Frontend dashboard, deploy UI, real-time log terminal                 |
| `apps/api`      | Go + Gin   | Auth, GitHub OAuth, REST API, WebSocket hub, job publisher            |
| `apps/builder`  | Go         | RabbitMQ consumer — clones repos, builds Docker images, pushes to ECR |
| `apps/deployer` | Go         | RabbitMQ consumer — provisions ECS, configures ALB, manages DNS       |

### Shared Packages

| Package           | Purpose                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `packages/events` | Canonical RabbitMQ message schemas (shared between all Go services) |
| `packages/db`     | `sqlc`-generated type-safe database layer + SQL migrations          |
| `packages/config` | Environment variable loader, AWS config factory                     |

---

## Deployment Flow (In Detail)

Here is exactly what happens between "click Deploy" and a live URL.

```
1.  User selects repo + branch on the frontend
2.  User sets configuration:
      - CPU (256 / 512 / 1024 Fargate units)
      - Memory (512MB → 4GB)
      - Exposed port (the port your container listens on)
      - Health check path (e.g. /health)
      - Environment variables (encrypted at rest via AWS Secrets Manager)
3.  POST /api/deployments → API creates a deployment record (status: queued)
4.  API publishes BuildJobEvent → hatch.build.jobs queue
5.  API opens WebSocket → subscribes to Redis channel deployment:{id}

--- Builder Service picks up job ---

6.  Clones repository using user's GitHub OAuth token
7.  Validates Dockerfile exists at repo root
8.  Runs: docker build -t {image} .
      → Each log line is published to Redis channel deployment:{id}
      → WebSocket hub fans it out to the connected browser in real time
9.  Tags and pushes image to AWS ECR
10. Publishes BuildCompleteEvent → hatch.deploy.jobs queue
      (contains the ECR image URI)

--- Deployer Service picks up job ---

11. Registers a new ECS Task Definition (image URI, CPU, memory, env vars)
12. Creates or updates an ECS Service on the Fargate cluster
13. Waits for the service to reach RUNNING state
      → Polls ECS and streams status updates via Redis → WebSocket
14. Registers the ECS service as a target in the Application Load Balancer
15. Creates a listener rule routing yourapp.hatch.dev → this target group
16. Upserts a Route53 A record: yourapp.hatch.dev → ALB DNS name
      (wildcard *.hatch.dev is pre-provisioned by Terraform)
17. ACM certificate (wildcard) is already attached to the ALB listener → HTTPS works immediately

--- Back in the API ---

18. Deployment record updated: status: live, url: https://yourapp.hatch.dev
19. Frontend receives the final WebSocket event and displays the live URL
```

Total time: **~90 seconds** for a typical project.

---

## Tech Stack

### Application

| Layer           | Technology              | Why                                                                              |
| --------------- | ----------------------- | -------------------------------------------------------------------------------- |
| Frontend        | Next.js 15 (App Router) | Server components for dashboard, seamless API routes                             |
| API Gateway     | Go 1.23 + Gin           | Native goroutines handle thousands of concurrent WebSocket connections trivially |
| Builder         | Go 1.23                 | Docker SDK + GitHub API + AWS SDK — all first-class Go libraries                 |
| Deployer        | Go 1.23                 | AWS SDK for Go (`aws-sdk-go-v2`) has excellent ECS/Route53 support               |
| Message Queue   | RabbitMQ (Amazon MQ)    | Dead letter queues for failed builds, durable job delivery                       |
| Cache / Pub-Sub | Redis (ElastiCache)     | Log streaming bridge between services and WebSocket hub                          |
| Database        | PostgreSQL 16 (RDS)     | Relational data, encrypted at rest, automated backups                            |
| Secret Storage  | AWS Secrets Manager     | User environment variables, encrypted per-deployment                             |

### Infrastructure (AWS)

| Component          | Service               | Purpose                                                            |
| ------------------ | --------------------- | ------------------------------------------------------------------ |
| Container Runtime  | ECS Fargate           | Serverless container execution — no EC2 instances to manage        |
| Container Registry | AWS ECR               | Private Docker image storage per user project                      |
| Load Balancer      | AWS ALB               | Routes `yourapp.hatch.dev` traffic to the correct ECS service      |
| DNS                | AWS Route53           | Wildcard `*.hatch.dev` A record pointing to the ALB                |
| TLS                | AWS ACM               | Wildcard certificate, auto-renewed, attached to ALB HTTPS listener |
| Networking         | VPC + Private Subnets | Services run in private subnets; only the ALB is public-facing     |
| IaC                | Terraform             | One `terraform apply` provisions the entire stack                  |

### Developer Tooling

- **sqlc** — SQL-first, type-safe database queries. Write SQL, get Go.
- **golang-migrate** — Version-controlled database migrations
- **gorilla/websocket** — WebSocket implementation for the log streaming hub
- **Docker Compose** — Full local environment (all services + Postgres + Redis + RabbitMQ) with one command

---

## Repository Structure

```
hatch/
├── apps/
│   ├── web/                     # Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/          # Login, GitHub OAuth callback
│   │   │   ├── dashboard/       # Project overview
│   │   │   ├── projects/[id]/   # Project detail + new deployment
│   │   │   └── deployments/[id]/# Live log terminal + status
│   │   ├── components/
│   │   ├── hooks/               # useWebSocket, useDeployment, useProjects
│   │   └── lib/                 # API client, type definitions
│   │
│   ├── api/                     # Go · Gin — public-facing API gateway
│   │   ├── cmd/server/          # main.go
│   │   └── internal/
│   │       ├── auth/            # GitHub OAuth flow, JWT middleware
│   │       ├── handlers/        # /projects, /deployments, /github
│   │       ├── ws/              # WebSocket hub — Redis sub → browser fan-out
│   │       ├── queue/           # RabbitMQ publisher
│   │       └── db/              # Postgres queries (imports packages/db)
│   │
│   ├── builder/                 # Go — clone → build → push
│   │   ├── cmd/worker/          # main.go
│   │   └── internal/
│   │       ├── git/             # Repo clone via GitHub OAuth token
│   │       ├── docker/          # docker build, ECR tag + push
│   │       ├── logs/            # Redis PUBLISH log lines
│   │       └── queue/           # RabbitMQ consumer + publisher
│   │
│   └── deployer/                # Go — ECS + ALB + Route53
│       ├── cmd/worker/          # main.go
│       └── internal/
│           ├── ecs/             # Task definition, service lifecycle, health polling
│           ├── dns/             # Route53 A record upsert
│           ├── tls/             # ACM certificate attachment
│           ├── logs/            # Redis PUBLISH deploy status
│           └── queue/           # RabbitMQ consumer
│
├── packages/                    # Shared Go code — imported by all services
│   ├── db/
│   │   ├── migrations/          # 001_init.sql, 002_add_env_vars.sql, ...
│   │   ├── queries/             # Raw SQL files consumed by sqlc
│   │   └── gen/                 # sqlc-generated models + query functions
│   ├── events/
│   │   └── events.go            # Canonical RabbitMQ message structs
│   └── config/
│       └── config.go            # Env var loader, AWS config factory
│
├── infra/                       # Terraform
│   ├── modules/
│   │   ├── networking/          # VPC, subnets, security groups, NAT gateway
│   │   ├── ecs/                 # ECS cluster, task execution role, Fargate config
│   │   ├── ecr/                 # Container registries
│   │   ├── alb/                 # Load balancer, HTTPS listener, target groups
│   │   ├── dns/                 # Route53 hosted zone, wildcard ACM certificate
│   │   ├── rds/                 # PostgreSQL on RDS (Multi-AZ in prod)
│   │   ├── elasticache/         # Redis cluster
│   │   └── mq/                  # Amazon MQ — managed RabbitMQ
│   ├── envs/
│   │   ├── dev/                 # Dev environment variable values
│   │   └── prod/                # Production variable values
│   └── backend.tf               # S3 remote state + DynamoDB lock table
│
├── .github/
│   └── workflows/
│       ├── ci.yml               # PR check: lint + test all services
│       ├── deploy-api.yml       # Merge to main: build → ECR → ECS rolling deploy
│       ├── deploy-builder.yml
│       └── deploy-deployer.yml
│
├── scripts/
│   ├── dev-up.sh                # Start local docker-compose environment
│   ├── migrate.sh               # Run pending DB migrations
│   └── seed.sh                  # Insert local test data
│
├── docker-compose.yml           # Local dev: all services + Postgres + Redis + RabbitMQ
├── Makefile                     # make dev | make build | make test | make deploy
└── go.work                      # Go workspace linking all modules
```

---

## Data Model

```sql
-- Core tables (abbreviated)

users
  id              UUID PRIMARY KEY
  github_id       BIGINT UNIQUE NOT NULL
  github_username TEXT NOT NULL
  access_token    TEXT NOT NULL    -- encrypted, stored in Secrets Manager
  created_at      TIMESTAMPTZ DEFAULT now()

projects
  id              UUID PRIMARY KEY
  user_id         UUID REFERENCES users(id)
  repo_name       TEXT NOT NULL
  repo_url        TEXT NOT NULL
  created_at      TIMESTAMPTZ DEFAULT now()

deployments
  id              UUID PRIMARY KEY
  project_id      UUID REFERENCES projects(id)
  branch          TEXT NOT NULL
  status          TEXT NOT NULL    -- queued | building | deploying | live | failed
  cpu             INT NOT NULL     -- Fargate CPU units (256, 512, 1024, 2048)
  memory_mb       INT NOT NULL
  port            INT NOT NULL
  health_check    TEXT NOT NULL    -- e.g. /health
  image_uri       TEXT             -- ECR URI, set after build
  ecs_task_arn    TEXT             -- set after deploy
  subdomain       TEXT UNIQUE      -- e.g. "myapp" → myapp.hatch.dev
  url             TEXT             -- final HTTPS URL, set when live
  created_at      TIMESTAMPTZ DEFAULT now()
  deployed_at     TIMESTAMPTZ

env_vars
  id              UUID PRIMARY KEY
  deployment_id   UUID REFERENCES deployments(id)
  key             TEXT NOT NULL
  secret_arn      TEXT NOT NULL    -- AWS Secrets Manager ARN, value never stored here
  created_at      TIMESTAMPTZ DEFAULT now()
```

---

## RabbitMQ Message Schemas

All message types are defined once in `packages/events/events.go` and imported by every service — there is no schema drift.

```go
// Published by: API Service
// Consumed by:  Builder Service
type BuildJobEvent struct {
    DeploymentID string `json:"deployment_id"`
    RepoURL      string `json:"repo_url"`
    Branch       string `json:"branch"`
    UserToken    string `json:"user_token"`  // GitHub OAuth token (encrypted)
    Port         int    `json:"port"`
}

// Published by: Builder Service
// Consumed by:  Deployer Service
type BuildCompleteEvent struct {
    DeploymentID string `json:"deployment_id"`
    ImageURI     string `json:"image_uri"`   // ECR image URI with digest
    Success      bool   `json:"success"`
    Error        string `json:"error,omitempty"`
}

// Published by: Builder Service (on BuildCompleteEvent.Success == true)
// Consumed by:  Deployer Service
type DeployJobEvent struct {
    DeploymentID    string            `json:"deployment_id"`
    ImageURI        string            `json:"image_uri"`
    CPU             int               `json:"cpu"`
    MemoryMB        int               `json:"memory_mb"`
    Port            int               `json:"port"`
    HealthCheckPath string            `json:"health_check_path"`
    EnvVars         map[string]string `json:"env_vars"`
    Subdomain       string            `json:"subdomain"`
}
```

Queue names: `hatch.build.jobs`, `hatch.deploy.jobs`
Dead letter queues: `hatch.build.jobs.dlq`, `hatch.deploy.jobs.dlq`

---

## Real-Time Log Streaming

Build and deploy logs are streamed to the browser with minimal latency using a Redis pub/sub bridge.

```
Builder/Deployer process
  └─▶ redis.Publish("deployment:{id}", logLine)

API Service — WebSocket Hub
  └─▶ redis.Subscribe("deployment:{id}")
        └─▶ goroutine: fan-out to all connected WebSocket clients for this deployment

Browser (Next.js)
  └─▶ WebSocket client appends each line to terminal UI
```

Each deployment gets its own Redis channel. The API's WebSocket hub maintains a registry of `deploymentID → []wsConn` and routes messages accordingly. When a deployment reaches terminal state (`live` or `failed`), the channel is cleaned up.

---

## Getting Started

### Prerequisites

- Go 1.23+
- Node.js 20+
- Docker + Docker Compose
- AWS CLI (configured with an IAM user that has ECS, ECR, RDS, Route53 permissions)
- Terraform 1.9+
- A registered domain pointing to Route53 (for `*.yourdomain.com`)

### 1. Clone and install

```bash
git clone https://github.com/yourusername/hatch.git
cd hatch

# Install frontend dependencies
cd apps/web && npm install && cd ../..

# Tidy Go workspaces
go work sync
```

### 2. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
cp apps/builder/.env.example apps/builder/.env
cp apps/deployer/.env.example apps/deployer/.env
cp apps/web/.env.local.example apps/web/.env.local
```

Required variables (see `.env.example` files for full reference):

```env
# GitHub OAuth App credentials
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=http://localhost:3000/auth/callback

# JWT signing secret
JWT_SECRET=

# Database
DATABASE_URL=postgres://hatch:hatch@localhost:5432/hatch?sslmode=disable

# Redis
REDIS_URL=redis://localhost:6379

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672/

# AWS (for deployer and builder)
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
ECR_REGISTRY=<your-account-id>.dkr.ecr.ap-south-1.amazonaws.com
ECS_CLUSTER_NAME=hatch-cluster
ALB_LISTENER_ARN=
ROUTE53_HOSTED_ZONE_ID=
BASE_DOMAIN=hatch.dev
```

### 3. Start local development environment

```bash
make dev
# Equivalent to: docker compose up postgres redis rabbitmq
# Then starts all Go services and the Next.js dev server
```

Or start services individually:

```bash
# Infrastructure only (Postgres, Redis, RabbitMQ)
docker compose up -d postgres redis rabbitmq

# Run migrations
make migrate

# API service
cd apps/api && go run cmd/server/main.go

# Builder service
cd apps/builder && go run cmd/worker/main.go

# Deployer service
cd apps/deployer && go run cmd/worker/main.go

# Frontend
cd apps/web && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Provision AWS infrastructure

```bash
cd infra/envs/dev

# Initialise Terraform with S3 backend
terraform init

# Preview what will be created
terraform plan

# Create all AWS resources (~5 minutes)
terraform apply
```

This provisions: VPC, private/public subnets, NAT gateway, ECS cluster, ECR repositories, RDS PostgreSQL, ElastiCache Redis, Amazon MQ (RabbitMQ), Application Load Balancer, Route53 hosted zone, and an ACM wildcard certificate.

### 5. Deploy Hatch's own services to AWS

Push to `main` — GitHub Actions handles the rest:

```
.github/workflows/deploy-api.yml
  → docker build apps/api
  → push to ECR
  → rolling ECS deployment (zero downtime)
```

The same workflow exists for `builder` and `deployer`.

---

## Makefile Reference

```bash
make dev          # Start full local environment (docker compose + all services)
make build        # Build Docker images for all three Go services
make test         # Run all Go tests + Next.js type-check
make migrate      # Run pending database migrations
make seed         # Insert local seed data
make lint         # golangci-lint (Go) + ESLint (Next.js)
make infra-plan   # terraform plan (dev environment)
make infra-apply  # terraform apply (dev environment)
make deploy       # Trigger GitHub Actions deploy workflows
```

---

## GitHub Actions CI/CD

Every pull request runs:

```yaml
# .github/workflows/ci.yml
- Go build + vet (all three services)
- golangci-lint
- Go tests
- Next.js type check (tsc --noEmit)
- ESLint
```

Every merge to `main` runs per-service deploy pipelines:

```yaml
# .github/workflows/deploy-api.yml
- docker build apps/api --platform linux/amd64
- aws ecr get-login-password | docker login
- docker push {ECR_REGISTRY}/hatch-api:{sha}
- aws ecs update-service --force-new-deployment
- Wait for service stability
```

---

## Configuration Options (User-Facing)

When a user creates a deployment on Hatch, they configure:

| Setting               | Options                          | Notes                                    |
| --------------------- | -------------------------------- | ---------------------------------------- |
| Branch                | Any branch from their repo       | Fetched live from GitHub API             |
| CPU                   | 0.25 vCPU / 0.5 / 1 / 2          | Fargate CPU units                        |
| Memory                | 512MB / 1GB / 2GB / 4GB          | Must be compatible with CPU selection    |
| Port                  | Integer (e.g. 3000, 8080)        | The port your container exposes          |
| Health check path     | e.g. `/health`, `/`              | Used by ALB to verify container health   |
| Environment variables | Key-value pairs                  | Encrypted, stored in AWS Secrets Manager |
| Region                | ap-south-1, us-east-1, eu-west-1 | Where your container runs                |

---

## Security

- **GitHub OAuth tokens** are never stored in the database. They are stored in AWS Secrets Manager and retrieved at job execution time, then discarded.
- **User environment variables** are stored exclusively as Secrets Manager ARNs in the database. The plaintext values are injected into ECS task definitions at deploy time and never logged.
- **JWT tokens** are short-lived (1 hour) and signed with a rotating secret.
- **All services run in private VPC subnets.** Only the Application Load Balancer is exposed to the public internet.
- **Database and Redis** are not publicly accessible. They accept connections only from within the VPC.
- **TLS everywhere.** All traffic to `*.hatch.dev` is served over HTTPS via an ACM wildcard certificate. HTTP requests are redirected to HTTPS at the ALB.

---

## Roadmap

- [ ] **PR Preview Environments** — Auto-deploy every pull request to a unique URL (`pr-42.myapp.hatch.dev`), destroyed on merge
- [ ] **Cost Dashboard** — Real-time per-deployment cost estimates, right-sizing recommendations, scale-to-zero for idle services
- [ ] **Native Runtimes** — First-class support for Node.js, Python (FastAPI/Flask), and Go without a Dockerfile
- [ ] **Custom Domains** — Bring your own domain with automatic TLS provisioning
- [ ] **Rollbacks** — One-click rollback to any previous deployment from the dashboard
- [ ] **Persistent Storage** — EFS volume mounts for stateful workloads
- [ ] **Built-in Observability** — Logs, metrics, and traces (OpenTelemetry) without any configuration

---

## Contributing

Contributions are welcome. Please open an issue before submitting a pull request for significant changes.

```bash
# Fork the repo, then:
git checkout -b feature/your-feature
make test                    # ensure tests pass
git commit -m "feat: ..."
git push origin feature/your-feature
# Open a pull request
```

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built with Go, Next.js, and AWS · Designed to make deployment invisible

</div>
