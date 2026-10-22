# Current State

This describes the code as it existed on branch
`stabilize/in-flight-hardening` (audited 2026-10-20), before the Phase 1 move.
File paths refer to that layout; [ADR 0008](decisions/0008-repository-structure.md)
shows where each moved. It is the **old hosted model**: Hatch runs every
user's apps in Hatch's own AWS account. The rebuild changes that; see
[Target architecture](03-architecture.md).

## Summary

The core flow works end to end: GitHub login → pick a repo → build the
Dockerfile → push to ECR → run on ECS Fargate behind an ALB → live URL, with
build logs streamed to the browser. It was deployed to real AWS (the local
Terraform state lists 53 resources). Engineering quality is reasonable:
publisher confirms, staged cancellation, per-user query scoping, encrypted
secrets at rest, CSRF protection, OAuth state checks, graceful shutdown, and
unit tests in every Go module.

It is not production-ready. The main problems are untrusted builds running on
the control-plane host, plain-text secrets in ECS task definitions, and the
hosted cost model.

## Components

```
apps/web        Next.js 16 dashboard and docs site
apps/api        Go + Gin: GitHub OAuth, REST API, WebSocket log hub, queue publisher
apps/builder    Go worker: git clone, docker build, push to ECR
apps/deployer   Go worker: ECS task definition, target group, listener rule, service
packages/db     sqlc-generated queries and golang-migrate migrations
packages/config Environment loading and validation for the API
packages/secrets AES-256-GCM codec for values stored in Postgres
infra/          Terraform: networking, ECS, ALBs, ECR, RDS, ElastiCache, Amazon MQ, EC2 host
```

Each Go app is its own module, joined by `go.work`.

### Runtime dependencies

| Dependency    | Used for                                                                       |
| ------------- | ------------------------------------------------------------------------------ |
| PostgreSQL 16 | Users, projects, deployments, env vars, activity, webhook deliveries           |
| RabbitMQ      | Job queues between API, builder, and deployer                                  |
| Redis         | Log fan-out (pub/sub plus a capped list per deployment) and GitHub API caching |
| Docker daemon | Builder runs `docker build` and `docker push` on its host                      |
| AWS           | ECR, ECS Fargate, ELBv2 (ALB), CloudWatch metrics and logs                     |

### Queues

| Queue                | Publisher | Consumer | Purpose                                           |
| -------------------- | --------- | -------- | ------------------------------------------------- |
| `hatch.build.jobs`   | API       | Builder  | Clone, build, push                                |
| `hatch.deploy.jobs`  | Builder   | Deployer | Register task, wire ALB, create or update service |
| `hatch.cleanup.jobs` | API       | Deployer | Tear down a deleted project                       |
| `hatch.service.jobs` | API       | Deployer | Suspend (desired count 0) or resume (1)           |

### Data model (migrations 000001–000010)

- `users`: GitHub identity and the encrypted OAuth access token.
- `projects`: repo, branch, Dockerfile path, port, subdomain, webhook secret and
  ID, auto-deploy flag, lifecycle status.
- `deployments`: one row per deploy; status, CPU, memory, port, health check,
  image URI, ECS service and target group, commit SHA and message, failure
  metadata. A partial unique index allows one active deployment per project.
- `project_env_vars`: current encrypted env vars per project.
- `env_vars`: a snapshot of env vars per deployment.
- `activity_logs`: user-visible activity feed.
- `webhook_deliveries`: GitHub delivery IDs, used to ignore redeliveries.

### Status values

- **Deployment:** `queued` → `building` → `deploying` → `live`, or `failed` /
  `canceled`.
- **Project:** `active`, `suspending`, `suspended`, `suspend_failed`,
  `resuming`, `resume_failed`, `deleting`, `deleted`, `delete_failed`.

### API surface

Public: `GET /health`, `GET /ready`, `GET /auth/github`, `GET /auth/callback`,
`GET /ws/deployments/:id` (authenticates internally), `POST /api/webhooks/github`
(HMAC-verified).

Authenticated (`/api`, session cookie or bearer token, plus CSRF for cookies):
`/me`, `/csrf`, project CRUD, project env vars, suspend, resume, delete,
deployments (create, get, cancel, logs), project metrics (CloudWatch),
activity, GitHub repo listing, and Dockerfile detection.

### Web app

Pages: landing, auth, console (project list), new project, project detail,
deployment detail with live logs, project settings, insights (metrics),
activity, user profile, and a static docs section.

## What works

- GitHub sign-in through a GitHub App with state validation; server-side
  sessions in Postgres (ADR 0010 and 0013), the session ID in an HttpOnly
  cookie. Before the sign-in slice this was an OAuth App with a JWT cookie.
- Repo listing with pagination and Dockerfile and EXPOSE-port detection.
- Project creation with GitHub webhook registration for auto-deploy, plus
  signature verification and redelivery deduplication.
- Build pipeline with live logs, stage-aware cancellation, timeouts, and
  publisher confirms.
- ECS deploy with health polling, subdomain routing on a shared ALB, and HTTPS
  via an ACM wildcard certificate.
- Suspend and resume (scale to 0 and 1), project deletion with ECS, target
  group, task definition, and ECR image cleanup.
- Env vars encrypted at rest in Postgres.
- Unit tests pass in all Go modules; the web app lints and builds.

## Known problems

Severity is for the target product, not the old hosted model.

| #   | Problem                                                                                                                                                                                | Where                                                                               | Severity |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| 1   | User Dockerfiles run with `docker build` on the control-plane EC2 host, which also holds an IAM role that can create and delete any ECS service. Instance metadata is not locked down. | `apps/builder/internal/docker/build.go`, `infra/modules/control_plane_host/main.tf` | Critical |
| 2   | Env vars are decrypted and written as plain `Environment` values into ECS task definitions, visible to anyone with ECS read access.                                                    | `apps/deployer/internal/ecs/deploy.go` (`registerTaskDefinition`)                   | High     |
| 3   | Hosted cost model: every user app runs in Hatch's account as an always-on Fargate service. This produced a large bill.                                                                 | Whole design                                                                        | High     |
| 4   | Each app takes one listener rule on a shared ALB; the default quota is about 100 rules per load balancer.                                                                              | `apps/deployer/internal/ecs/deploy.go` (`upsertListenerRule`)                       | Medium   |
| 5   | Listener rule priority is picked by scanning existing rules; concurrent deploys can collide.                                                                                           | `nextAvailablePriority`                                                             | Medium   |
| 6   | The GitHub OAuth App requests the `repo` scope, which grants access to all of the user's repositories. Fixed in the sign-in slice: Hatch is now a GitHub App.                                                                                 | `apps/api/internal/auth/github.go`                                                  | Medium   |
| 7   | Sessions are stateless JWTs and cannot be revoked before expiry. Fixed in the sign-in slice: server-side sessions.                                                                                                                       | `apps/api/internal/auth`                                                            | Medium   |
| 8   | Four services plus Postgres, Redis, and RabbitMQ is a heavy install for a self-hosted tool.                                                                                            | Whole design                                                                        | Medium   |
| 9   | No rollback, custom domains, or runtime log viewer.                                                                                                                                    | —                                                                                   | Medium   |
| 10  | Resolved 2026-10-21: CI added (`.github/workflows/ci.yml`).                                                                                                                            | `.github/`                                                                          | Medium   |
| 11  | Several React client components exceed 1,000 lines.                                                                                                                                    | `apps/web/src/app/(pages)/(protected)/**`                                           | Low      |
| 12  | Migrations are up-only.                                                                                                                                                                | `packages/db/migrations`                                                            | Low      |

## Keep, change, drop

|            | Items                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Keep**   | GitHub login and webhook verification, encrypted secrets codec, project and deployment model, staged cancellation, live log streaming concept, ECS and ALB deploy logic, health polling, cleanup logic, most of the web UI, sqlc and migrations                                                                                                 |
| **Change** | Builds move to CodeBuild in the user's account (AWS) or Docker on the Hatch host (local target). Env vars move to AWS Secrets Manager. All AWS calls go through an assumed role in the user's account. Terraform for Hatch's own account becomes a CloudFormation template for the user's account. Separate services merge into one Go program. |
| **Drop**   | RabbitMQ, Redis, the separate builder and deployer binaries, the EC2 control host, Terraform for hosting user apps in Hatch's account                                                                                                                                                                                                           |

## Repository notes

- `infra/envs/*/terraform.tfstate` and `terraform.tfvars` exist locally but are
  gitignored. The AWS account they describe is suspended.
- `docs/Hatch.excalidraw` is the original architecture diagram. It describes
  the old design and is untracked.
- The README describes the old hosted model and will be rewritten when the
  rebuild lands.
