<div align="center">
  <h1>Hatch</h1>
  <p>Render-style deploys into your own AWS account, with cost guardrails built in.</p>

![Go](https://img.shields.io/badge/Go-1.26-00ADD8?style=flat-square&logo=go&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-ECS%20Fargate-FF9900?style=flat-square&logo=amazon-aws&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)

</div>

> [!IMPORTANT]
> **Hatch is being rebuilt and is not ready for use.** The code in this
> repository is a working prototype of an earlier design that ran every app
> in Hatch's own AWS account. The new version deploys into *your* account
> instead. This README describes what the code does today; the plan is in
> [`docs/`](docs/README.md) and progress is tracked in the
> [roadmap](docs/05-roadmap.md).

<img width="1705" height="853" alt="Hatch dashboard" src="https://github.com/user-attachments/assets/e9f19a22-a7c6-45da-9f74-9acafd2a9e75" />

## Why

Managed platforms like Render and Railway make deploying easy, but your apps
run on their infrastructure at their prices. Deploying to AWS yourself keeps
you in control, but it takes a lot of setup, and resources left running can
quietly turn into a large bill.

Hatch aims to give you the managed-platform experience (connect a repo, push,
get a URL, watch logs) on infrastructure you own, with spending limits,
idle shutdown, and complete teardown as first-class features. See the
[vision](docs/01-vision.md) and [cost guardrails](docs/04-cost-guardrails.md).

## What works today

The prototype runs the full flow on AWS:

- Sign in with GitHub, browse your repositories, and detect the Dockerfile and
  exposed port.
- Create a project; Hatch registers a GitHub webhook so pushes redeploy
  automatically.
- Build the Dockerfile, push the image to ECR, and run it on ECS Fargate behind
  a shared Application Load Balancer, with a subdomain per project.
- Stream build and deploy logs to the browser live, and cancel a deployment at
  any stage.
- Suspend, resume, and delete projects; deletion cleans up the ECS service,
  target group, task definitions, and images.
- Store environment variables encrypted in Postgres.

Known problems, including the ones the rebuild exists to fix, are listed in
[Current state](docs/02-current-state.md#known-problems).

<img width="1705" height="853" alt="Live build logs" src="https://github.com/user-attachments/assets/c309c96a-3131-4717-9f88-4bc5137b5d39" />

## How the prototype works

```text
Browser ── REST + WebSocket ──▶ API (Go, Gin)
                                 │  GitHub OAuth, sessions, projects, webhooks
                                 │
                                 ▼  RabbitMQ: hatch.build.jobs
                               Builder (Go)
                                 │  git clone → docker build → push to ECR
                                 │
                                 ▼  RabbitMQ: hatch.deploy.jobs
                               Deployer (Go)
                                    task definition → target group →
                                    host-based ALB rule → ECS service →
                                    wait until healthy

Logs:  builder / deployer → Redis → API WebSocket hub → browser
Data:  PostgreSQL (sqlc queries, golang-migrate migrations)
```

The API also sends project cleanup and suspend/resume jobs to the deployer
through `hatch.cleanup.jobs` and `hatch.service.jobs`.

## Where it is going

The rebuild replaces this with one Go program and Postgres. You connect your
AWS account by launching a CloudFormation stack that creates a limited role,
and Hatch builds with CodeBuild and runs your apps on ECS Fargate in that
account. A local Docker target comes first, so the whole flow can be developed
and tested without AWS. Details are in the
[architecture](docs/03-architecture.md) and the
[decision records](docs/decisions/README.md).

## Running locally

You need Go 1.26 (an older Go downloads it automatically), Node.js 24 (see
`.nvmrc`), Docker, [`golang-migrate`](https://github.com/golang-migrate/migrate),
and a [GitHub OAuth app](https://github.com/settings/developers) with the
callback URL `http://localhost:8080/auth/callback`.

```bash
git clone https://github.com/YHQZ1/Hatch.git && cd Hatch
(cd web && npm install)

# Configuration: fill in the GitHub OAuth values, JWT_SECRET, and
# DATA_ENCRYPTION_KEY. Every hatch subcommand reads this one file.
cp .env.example .env

make infra     # Postgres, Redis, and RabbitMQ in Docker
make migrate   # apply database migrations
make dev       # run hatch api, builder, and deployer, and the web app
```

Open <http://localhost:3000>. `make stop-dev` stops everything `make dev`
started.

Signing in, browsing repositories, and creating projects work with only the
local services. Building and deploying need an AWS account with an ECR
repository, an ECS cluster, and an ALB, set in `.env`. The rebuild removes
that requirement for local development.

## Repository layout

```text
cmd/hatch          the hatch binary: `api`, `builder`, and `deployer` subcommands
internal/api       REST API, GitHub OAuth and webhooks, WebSocket log hub
internal/build     cloning, building, and pushing images
internal/runtime   ECS services and ALB routing
internal/store     database access (sqlc) and migrations
internal/config    configuration loading
internal/secrets   encryption at rest
web/               Next.js dashboard
infra/             Terraform for the old hosted model (to be removed)
docs/              vision, architecture, roadmap, and decision records
```

Where this layout is heading, and why, is in
[ADR 0008](docs/decisions/0008-repository-structure.md).

## Documentation

| Document | Contents |
| --- | --- |
| [Vision](docs/01-vision.md) | What Hatch is for and who it serves |
| [Current state](docs/02-current-state.md) | What the prototype does and its known problems |
| [Architecture](docs/03-architecture.md) | The target design |
| [Cost guardrails](docs/04-cost-guardrails.md) | How Hatch keeps cloud spend under control |
| [Roadmap](docs/05-roadmap.md) | Phases, checklists, and current status |
| [Open questions](docs/06-open-questions.md) | Decisions still to make, and decided ones |

## Security

Please report security issues privately as described in
[SECURITY.md](SECURITY.md), not in public issues.

## License

[MIT](LICENSE)
