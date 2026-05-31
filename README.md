<div align="center">
  <h1>Hatch</h1>
  <p>A self-hosted deployment platform built on AWS.<br/>Dockerfile in. Live URL out.</p>

![Go](https://img.shields.io/badge/Go-1.23-00ADD8?style=flat-square&logo=go&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=next.js&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-ECS%20%7C%20ECR%20%7C%20ALB-FF9900?style=flat-square&logo=amazon-aws&logoColor=white)
![Terraform](https://img.shields.io/badge/Terraform-IaC-7B42BC?style=flat-square&logo=terraform&logoColor=white)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ-Queue-FF6600?style=flat-square&logo=rabbitmq&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)

</div>

---

<!-- SCREENSHOT: full dashboard overview — replace with actual image -->
<img width="1705" height="853" alt="Screenshot 2026-05-31 at 13 15 18" src="https://github.com/user-attachments/assets/e9f19a22-a7c6-45da-9f74-9acafd2a9e75" />

---

## What is Hatch?

Hatch is a self-hosted deployment platform — a Render / Railway alternative built on AWS — that lets developers go from a GitHub repository to a live, publicly accessible URL without touching any infrastructure.

You bring a `Dockerfile`. Hatch handles the rest: cloning the repo, building the image, pushing it to ECR, registering an ECS task definition, provisioning a Fargate service, and wiring up an Application Load Balancer. Every step streams back to you in real time via WebSockets.

**The core loop:**

```
connect repo → configure → click Deploy
  → live build logs stream to your browser
  → container running on AWS Fargate
  → live URL returned
```

Hatch supports any language, any framework, any runtime — if it runs in a Docker container, Hatch can deploy it.

---

## Architecture

Hatch is a monorepo of independently deployable microservices communicating through RabbitMQ. The API never calls the builder directly — it publishes a job and moves on.

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
     │   RabbitMQ     │────────▶│   Builder Service    │
     │  Message Queue │         │   (Go)               │
     └───────┬────────┘         │                      │
             │                  │  1. Clone via GitHub │
             │                  │  2. docker build     │
             │                  │  3. Push → AWS ECR   │
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
                                │  3. Configure ALB    │
                                │  4. Return live URL  │
                                └──────────────────────┘

     Log streaming: all services → Redis pub/sub → WebSocket → Browser
     Data:          PostgreSQL · Redis
     Infra:         Terraform · AWS ECS Fargate · ECR · ALB
```

### Services

| Service         | Language   | Role                                                      |
| --------------- | ---------- | --------------------------------------------------------- |
| `apps/web`      | Next.js 15 | Frontend dashboard, deploy UI, real-time log terminal     |
| `apps/api`      | Go + Gin   | GitHub OAuth, REST API, WebSocket hub, RabbitMQ publisher |
| `apps/builder`  | Go         | Clones repos, builds Docker images, pushes to ECR         |
| `apps/deployer` | Go         | Provisions ECS services, configures ALB routing           |

### Shared Packages

| Package           | Purpose                                                    |
| ----------------- | ---------------------------------------------------------- |
| `packages/db`     | `sqlc`-generated type-safe database layer + SQL migrations |
| `packages/config` | Environment variable loader                                |

---

## Deployment Flow

What happens between clicking Deploy and getting a live URL:

```
1.  User selects repo + branch
2.  User configures: CPU, memory, port, health check path, env vars
3.  POST /api/deployments → creates deployment record (status: queued)
4.  API publishes BuildJobEvent → hatch.build.jobs

--- Builder picks up job ---

5.  Clones repo using GitHub OAuth token
6.  Runs: docker build --platform linux/amd64 -t {image} .
    → each log line published to Redis → WebSocket → browser
7.  Pushes image to AWS ECR
8.  Publishes DeployJobEvent → hatch.deploy.jobs

--- Deployer picks up job ---

9.  Registers ECS Task Definition
10. Creates ALB target group + listener rule (path-based routing)
11. Creates ECS Fargate service
12. Polls until RunningCount >= 1
13. Updates deployment record: status=live, url={alb-dns}/{subdomain}

--- Frontend ---

14. WebSocket receives final log line with live URL
15. URL displayed in terminal
```

<!-- SCREENSHOT: live build logs streaming in the terminal UI — replace with actual image -->
<img width="1705" height="853" alt="Screenshot 2026-05-31 at 13 16 20" src="https://github.com/user-attachments/assets/c309c96a-3131-4717-9f88-4bc5137b5d39" />
<img width="3410" height="1706" alt="image" src="https://github.com/user-attachments/assets/793714a8-d1d3-401f-9d49-7b4dd1ec0b7f" />

---

## Tech Stack

| Layer              | Technology              | Why                                                          |
| ------------------ | ----------------------- | ------------------------------------------------------------ |
| Frontend           | Next.js 15 (App Router) | Server components, seamless API routes                       |
| API                | Go + Gin                | Goroutines handle concurrent WebSocket connections trivially |
| Builder            | Go                      | Docker SDK + AWS SDK are first-class Go libraries            |
| Deployer           | Go                      | `aws-sdk-go-v2` has excellent ECS/ALB support                |
| Queue              | RabbitMQ                | Durable job delivery, dead letter queues for failed builds   |
| Pub-Sub            | Redis                   | Log streaming bridge between services and WebSocket hub      |
| Database           | PostgreSQL 16           | Relational data, migrations via golang-migrate               |
| Container Runtime  | AWS ECS Fargate         | Serverless containers, no EC2 to manage                      |
| Container Registry | AWS ECR                 | Private Docker image storage                                 |
| Load Balancer      | AWS ALB                 | Routes traffic to ECS services via path-based rules          |
| IaC                | Terraform               | Entire AWS stack provisioned with `terraform apply`          |

---

## Repository Structure

```
hatch/
├── apps/
│   ├── web/                     # Next.js 15 frontend
│   │   └── src/app/
│   │       ├── (pages)/         # Dashboard, projects, deploy UI
│   │       ├── components/      # Navbar, shared components
│   │       └── page.tsx         # Landing page
│   │
│   ├── api/                     # Go · Gin — public API gateway
│   │   ├── cmd/server/
│   │   └── internal/
│   │       ├── auth/            # GitHub OAuth, JWT middleware
│   │       ├── handlers/        # projects, deployments, github endpoints
│   │       ├── ws/              # WebSocket hub (Redis sub → browser)
│   │       ├── queue/           # RabbitMQ publisher
│   │       └── db/              # Postgres connection
│   │
│   ├── builder/                 # Go — clone → build → ECR push
│   │   ├── cmd/worker/
│   │   └── internal/
│   │       ├── git/             # Repo clone via OAuth token
│   │       ├── docker/          # docker build + ECR push
│   │       ├── logs/            # Redis PUBLISH
│   │       └── queue/           # RabbitMQ consumer + publisher
│   │
│   └── deployer/                # Go — ECS + ALB
│       ├── cmd/worker/
│       └── internal/
│           ├── ecs/             # Task definition, service lifecycle, health polling
│           ├── logs/            # Redis PUBLISH
│           └── queue/           # RabbitMQ consumer
│
├── packages/
│   ├── db/
│   │   ├── migrations/          # SQL migration files
│   │   ├── queries/             # sqlc input SQL
│   │   └── gen/                 # sqlc-generated Go code
│   └── config/                  # Shared env var loader
│
├── infra/
│   ├── modules/
│   │   ├── networking/          # VPC, subnets, security groups
│   │   ├── ecs/                 # ECS cluster, IAM roles
│   │   └── alb/                 # Load balancer, listener, target groups
│   └── envs/dev/                # Dev environment Terraform entry point
│
├── docker-compose.yml           # Local dev infrastructure
├── Makefile
└── go.work                      # Go workspace
```

---

## Getting Started

### Prerequisites

- Go 1.23+
- Node.js 20+
- Docker + Docker Compose
- AWS CLI configured with IAM credentials
- Terraform 1.5+

### 1. Clone and install

```bash
git clone https://github.com/YHQZ1/Hatch.git
cd Hatch

cd apps/web && npm install && cd ../..
go work sync
```

### 2. Configure environment

```bash
cp apps/api/.env.example      apps/api/.env
cp apps/builder/.env.example  apps/builder/.env
cp apps/deployer/.env.example apps/deployer/.env
cp apps/web/.env.example      apps/web/.env.local
```

**`apps/api/.env`**

```env
PORT=8080
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=http://localhost:8080/auth/callback
JWT_SECRET=
DATABASE_URL=postgres://hatch:hatch@localhost:5432/hatch?sslmode=disable
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
```

**`apps/builder/.env`**

```env
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
REDIS_URL=redis://localhost:6379
AWS_REGION=ap-south-1
ECR_REGISTRY=<account-id>.dkr.ecr.ap-south-1.amazonaws.com
ECR_REPOSITORY=hatch-builds
```

**`apps/deployer/.env`**

```env
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
REDIS_URL=redis://localhost:6379
AWS_REGION=ap-south-1
ECS_CLUSTER_NAME=hatch-cluster
ALB_LISTENER_ARN=
VPC_ID=
SUBNET_A=
SUBNET_B=
ECS_SG_ID=
TASK_EXECUTION_ROLE_ARN=
ECR_REGISTRY=<account-id>.dkr.ecr.ap-south-1.amazonaws.com
DATABASE_URL=postgres://hatch:hatch@localhost:5432/hatch?sslmode=disable
```

### 3. Start local infrastructure

```bash
make dev   # starts Postgres, Redis, RabbitMQ via Docker Compose
```

### 4. Run migrations

```bash
migrate -path packages/db/migrations \
  -database "postgres://hatch:hatch@localhost:5432/hatch?sslmode=disable" up
```

### 5. Run services

```bash
# four separate terminals
cd apps/api      && go run cmd/server/main.go
cd apps/builder  && go run cmd/worker/main.go
cd apps/deployer && go run cmd/worker/main.go
cd apps/web      && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Provision AWS infrastructure

```bash
# create S3 bucket for Terraform state
aws s3 mb s3://hatch-terraform-state-<account-id> --region ap-south-1

cd infra/envs/dev
terraform init
terraform apply
```

Outputs include `alb_dns_name`, `alb_listener_arn`, `ecs_cluster_name`, subnet IDs, and security group IDs — paste these into `apps/deployer/.env`.

---

## Data Model

```sql
users
  id              UUID PRIMARY KEY
  github_id       BIGINT UNIQUE NOT NULL
  github_username TEXT NOT NULL
  access_token    TEXT NOT NULL
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()

projects
  id          UUID PRIMARY KEY
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE
  repo_name   TEXT NOT NULL
  repo_url    TEXT NOT NULL
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()

deployments
  id           UUID PRIMARY KEY
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE
  branch       TEXT NOT NULL
  status       TEXT NOT NULL DEFAULT 'queued'  -- queued|building|deploying|live|failed
  cpu          INT NOT NULL
  memory_mb    INT NOT NULL
  port         INT NOT NULL
  health_check TEXT NOT NULL DEFAULT '/'
  image_uri    TEXT
  ecs_task_arn TEXT
  subdomain    TEXT UNIQUE
  url          TEXT
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  deployed_at  TIMESTAMPTZ

env_vars
  id            UUID PRIMARY KEY
  deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE
  key           TEXT NOT NULL
  secret_arn    TEXT NOT NULL
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
```

---

## Real-Time Log Streaming

```
Builder / Deployer
  └── redis.Publish("deployment:{id}", logLine)

API — WebSocket Hub
  └── redis.Subscribe("deployment:{id}")
        └── forward each message to connected browser

Browser
  └── WebSocket client appends lines to terminal UI
```

Each deployment gets its own Redis channel. The hub subscribes on WebSocket connect and cleans up on disconnect or terminal deployment state.

---

## RabbitMQ Queues

| Queue               | Publisher | Consumer |
| ------------------- | --------- | -------- |
| `hatch.build.jobs`  | API       | Builder  |
| `hatch.deploy.jobs` | Builder   | Deployer |

---

## Makefile

```bash
make dev      # docker compose up -d postgres redis rabbitmq
make up       # docker compose up (full stack with built images)
make down     # docker compose down
make build    # docker compose build
make migrate  # run pending DB migrations
```

---

## Contributing

Contributions are welcome — bug fixes, features, docs, and everything in between. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR. It covers local setup, branch conventions, commit style, and the PR process.

For security vulnerabilities, see [SECURITY.md](SECURITY.md) — please don't use public issues for security reports.

---

## Roadmap

- [ ] PR preview environments — auto-deploy per pull request, destroyed on merge
- [ ] Cost dashboard — real-time per-deployment cost estimates and right-sizing
- [ ] Native runtimes — Node.js, Python, Go without a Dockerfile
- [ ] Custom domains with automatic TLS provisioning
- [ ] One-click rollbacks to any previous deployment
- [ ] Built-in observability — logs, metrics, traces via OpenTelemetry

---

## License

MIT — see [LICENSE](LICENSE).
