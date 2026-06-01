# Project Context

## Project

**Name:** Hatch  
**Purpose:** Self-hosted deployment platform (Render/Railway alternative) that takes a Dockerfile and outputs a live HTTPS URL on the user's own AWS account. Handles the full pipeline: clone repo → build image → push to ECR → register ECS task definition → provision Fargate service → configure ALB host-header routing → return live URL. Every step streams back in real time over WebSocket.  
**Status:** Active development. Core deployment pipeline, log streaming, GitHub OAuth, webhook auto-deploy, and the full frontend dashboard are functional. Project settings save is an explicit stub. Rollback, custom domains, PR previews, cost dashboard, and native runtimes are roadmap items.

---

## Architecture

**Pattern:** Async microservices monorepo. API never calls builder or deployer directly — it publishes a job to RabbitMQ and returns immediately. Builder consumes, builds, then hands off to deployer via a second queue. Deployer provisions AWS and writes final status directly to Postgres.

**Services:**

| Service         | Port | Role                                                                                             |
| --------------- | ---- | ------------------------------------------------------------------------------------------------ |
| `apps/api`      | 8080 | HTTP/WebSocket gateway, GitHub OAuth, CRUD, RabbitMQ publisher                                   |
| `apps/builder`  | —    | RabbitMQ consumer: git clone → docker build → ECR push → publishes DeployJobEvent                |
| `apps/deployer` | —    | RabbitMQ consumer: ECS task def → ALB target group → listener rule → Fargate service → DB update |
| `apps/web`      | 3000 | Next.js 15 App Router frontend dashboard                                                         |

All four services run on a single EC2 instance (`m7i-flex.large`, Ubuntu 24, provisioned by Terraform). The platform uses ECS Fargate for user workloads but not for its own services.

**Communication:**

- Browser → API: REST + WebSocket
- API → Builder: RabbitMQ `hatch.build.jobs` (durable, persistent delivery)
- Builder → Deployer: RabbitMQ `hatch.deploy.jobs` (durable, persistent delivery)
- API → Deployer: RabbitMQ `hatch.cleanup.jobs` (project delete)
- Builder/Deployer → Browser: Redis pub/sub (`deployment:{id}`) → WebSocket hub → browser
- API ↔ Postgres: sqlc-generated queries via `database/sql`
- Deployer ↔ Postgres: raw `database/sql` for status updates (bypasses sqlc layer)
- API ↔ Redis: GitHub repo cache (5min TTL), Dockerfile check cache (10min TTL), log list reads
- Frontend ↔ API: Bearer JWT in Authorization header

**Data Flow:**

```
POST /api/deployments
  → INSERT deployment (status=queued)
  → PublishBuildJob → hatch.build.jobs

Builder:
  git clone --depth=1 (OAuth token from JWT claim, embedded in queue message)
  docker build --platform linux/amd64
  ECR GetAuthorizationToken → docker login → docker push
  Publish each stdout/stderr line:
    Redis RPUSH logs:{id} + PUBLISH deployment:{id}  (pipelined)
  PublishDeployJob → hatch.deploy.jobs

Deployer:
  UPDATE deployments SET status='deploying'
  SELECT env_vars WHERE deployment_id = ...
  RegisterTaskDefinition (awsvpc, Fargate, awslogs driver)
  DescribeTargetGroups → upsert (delete+recreate if port changed)
  DescribeRules → upsert listener rule (host-header: {subdomain}.{baseDomain})
  DescribeServices → UpdateService OR CreateService (Fargate, AssignPublicIpEnabled)
  Poll DescribeServices every 15s, timeout 8min → RunningCount >= 1
  UPDATE deployments SET status='live', url=..., deployed_at=now()

WS Hub (API):
  On connect: LRange logs:{id} → replay history → Subscribe deployment:{id}
  Forward each pub/sub message to browser WebSocket
```

---

## Stack in Use

**Languages:** Go 1.23+ (API, Builder, Deployer — go.work uses workspace), TypeScript (Next.js frontend)  
**Frameworks:** Gin v1.12 (API HTTP), gorilla/websocket v1.5 (WebSocket), Next.js 16.2 / React 19 (frontend), Tailwind CSS v4  
**Databases:** PostgreSQL 16 (primary data store — pgcrypto for UUID generation, 5 tables), Redis 7 (log pub/sub + list persistence + GitHub API cache)  
**Queue:** RabbitMQ 3 (3 durable queues: hatch.build.jobs, hatch.deploy.jobs, hatch.cleanup.jobs)  
**ORM/Query:** sqlc v1.30 (type-safe codegen from SQL), golang-migrate (schema migrations)  
**AWS SDKs:** aws-sdk-go-v2 (ECR in builder; ECS + ELBv2 in deployer)  
**Auth:** GitHub OAuth 2.0 → HS256 JWT (24h expiry, access_token embedded in claims)  
**Infra:** Terraform ~> 5.0, S3 backend (ap-south-1), AWS provider  
**AWS Resources:** ECS Fargate cluster, ALB (HTTPS, TLS 1.3, wildcard cert via ACM), ECR, VPC (10.0.0.0/16, 2 public subnets across AZs), EC2 m7i-flex.large (API/Builder/Deployer host), IAM roles  
**Observability:** Custom `StatTracker` middleware (stdout latency log + `X-Hatch-Trace-Duration` response header). No Prometheus/Grafana/OpenTelemetry yet (roadmap item). Build/deploy logs persisted in Redis with 7-day TTL.  
**Dev tooling:** Docker Compose (Postgres 16, Redis 7, RabbitMQ 3 with management UI), k6 (load testing scripts)

---

## What's Built

### API Service (`apps/api`)

- **What it does:** HTTP gateway. GitHub OAuth flow (redirect → callback → JWT). JWT middleware for all `/api/*` routes. CRUD for projects (create, list, get, delete) and deployments (create, list, get). GitHub repo listing with 5-min Redis cache. Dockerfile existence check with 10-min cache. Activity log retrieval (last 50). WebSocket hub for deployment log streaming. Webhook handler for GitHub push events (auto-deploy). Cleanup job publisher on project delete. Custom request metrics middleware.

- **Key design decisions:** API is fully stateless — no in-memory state beyond request lifetime. WebSocket hub creates a fresh Redis client per `Hub` instance (separate from the main `rdb` client). Each WebSocket connection gets its own Redis subscription goroutine; no shared connection pool or fan-out manager. CORS configured with `AllowCredentials: true`, single origin from `cfg.FrontendURL`. GitHub access token travels in JWT claims and is re-extracted from JWT in every handler that needs it (repo listing, deployment creation, webhook handler). Webhook secret verification is conditional: if `webhook_secret` is NULL in DB, signature check is skipped (flexible but weakens security guarantees). Activity logging is fire-and-forget in a goroutine (non-critical path). `recordActivity` uses `context.Background()` not the request context to avoid cancellation.

- **Performance characteristics:** GitHub repo list is cached per-username in Redis (5min TTL) — avoids hammering GitHub API on repeated console loads. Dockerfile check is cached per `owner/repo/path` (10min TTL). Console page client-side caches in localStorage (5min TTL) to reduce API round-trips on navigation. No connection pooling on `database/sql` beyond its default idle pool.

- **Known limitations:** No `PATCH /api/projects/:id` endpoint — project settings save is a stub on the frontend. No token revocation — GitHub access token rotation invalidates session silently. WS upgrader has `CheckOrigin: always true` (no origin validation). ALB listener rule priority uses `time.Now().Unix()%49000 + 1000` — not globally unique if two deployments are triggered within the same second. No pagination on deployment or project listing.

---

### Builder Service (`apps/builder`)

- **What it does:** Single-purpose RabbitMQ worker. Consumes `hatch.build.jobs`. For each job: creates a temp dir under `/tmp/hatch-builds/{deploymentID}`, clones the repo using the user's GitHub OAuth token via HTTPS, runs `docker build --platform linux/amd64`, streams stdout+stderr to Redis (both list + pub/sub) via goroutines, gets ECR auth token via `GetAuthorizationToken`, `docker login --password-stdin`, `docker push`, then publishes a `DeployJobEvent` to `hatch.deploy.jobs`. Cleans up temp dir on completion (defer).

- **Key design decisions:** Uses `exec.CommandContext` for git, docker build, and docker push — shells out rather than using Docker SDK. This is intentional to get streaming output line-by-line (Docker SDK's image build output is JSON-wrapped). Build target is hardcoded to `linux/amd64` for ECS Fargate compatibility. Image tag is `{registry}/{repo}:{deploymentID[:8]}`. `capture()` goroutines for stdout and stderr run concurrently — log ordering between stdout/stderr is not guaranteed. Dockerfile path resolution: if path contains `/`, splits at last slash to set build context dir and Dockerfile name. Failed messages are Nack'd with `requeue=false` — go to dead letter if configured, otherwise dropped.

- **Performance characteristics:** Each job is processed serially (single-goroutine consumer loop). Build time is fully dependent on image size and layer caching. No caching mechanism — every build is a fresh `docker build` with no layer reuse between deployments (no BuildKit cache mounts, no registry cache). ECR auth token is fetched fresh per build.

- **Known limitations:** Serial processing — only one build at a time. No concurrency. No build timeout (relies on `context.Background()` passed down — never cancelled). No dead letter queue configured by default. Token in queue message is in plaintext. `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env.example` are unused by the builder (leftover/wrong).

---

### Deployer Service (`apps/deployer`)

- **What it does:** RabbitMQ consumer for two queues: `hatch.deploy.jobs` and `hatch.cleanup.jobs`. For deploy: fetches env vars from Postgres, registers ECS task definition (awsvpc, Fargate, awslogs with `awslogs-create-group: true`), upserts ALB target group (creates or reuses if port matches, deletes+recreates if port changed), upserts ALB listener rule (host-header condition: `{subdomain}.{baseDomain}`), upserts ECS Fargate service (UpdateService if exists and port matches, else Force-delete + recreate), polls `DescribeServices` every 15s until `RunningCount >= 1`, updates deployment to `live` with URL and `deployed_at`. For cleanup: calls `Teardown()` which deletes listener rule, force-deletes ECS service (5s sleep), deletes target group.

- **Key design decisions:** Deployer has its own direct Postgres connection — updates deployment status directly rather than calling the API. This avoids an HTTP round-trip but creates a second data writer for the deployments table. Env vars are fetched via raw SQL (`SELECT key, value FROM env_vars`) at deploy time and injected as ECS container environment variables in plaintext (not Secrets Manager, despite `secret_arn` column existing in schema). Service naming convention: `hatch-{subdomain}` for ECS service, `h-{subdomain}` (truncated at 32 chars) for target group. Stability check polls every 15s with 8-minute timeout. Runs cleanup jobs in a separate goroutine (`handleCleanupJobs`) so they don't block deploy processing.

- **Performance characteristics:** End-to-end deployment time dominated by ECS service convergence (typically 1-3 minutes for Fargate cold start + health check). The 15s poll interval means up to 15s of unnecessary wait after the task becomes healthy. Teardown is sequential — `time.Sleep(5 * time.Second)` hardcoded to wait for service to drain before deleting target group.

- **Known limitations:** No retry on ECS API failures — if `RegisterTaskDefinition` fails, the deployment is marked failed with no recovery. Teardown does not delete the ECS task definition (only the service and TG) — task definition revisions accumulate indefinitely. `BASE_DOMAIN` config not included in `packages/config` (deployer reads it directly via `mustGetEnv`). The `upsertListenerRule` function uses `time.Now().Unix()%49000 + 1000` as rule priority — potential collision.

---

### Frontend (`apps/web`)

- **What it does:** Next.js 15 App Router SPA-style dashboard. Landing page with animated terminal simulator. GitHub OAuth initiation (redirect to API). Auth success page stores JWT in `localStorage`. Protected route group wraps authenticated pages in Navbar layout. Console: project table with live/building/failed status indicators, stat cards, delete with confirm. New Service: 2-step wizard (repo select → configure), debounced Dockerfile existence check, .env file import/bulk paste modal, service manifest preview panel, validation checklist. Project detail: deployment list, WebSocket terminal for live log streaming, re-deploy trigger. Deployment detail: pipeline progress bar (Queued→Building→Deploying→Live), spec cards, live URL link. Activity log: event timeline. Infrastructure view: resource utilization cards. Settings page (tabs: general, build, compute, vars, danger — save is a stub). User profile page. Docs pages (quick-start, configuration, env vars, self-hosting, roadmap, changelog).

- **Key design decisions:** Auth is entirely client-side — no server-side session, no httpOnly cookies. JWT stored in `localStorage` and decoded client-side for username/avatar (no signature verification in browser). All protected pages check `localStorage` for token on mount and redirect to `/auth` if missing. WebSocket connects to `NEXT_PUBLIC_WS_URL` (inferred from API URL), sends `"READY"` handshake, then receives log lines. Each page implements its own localStorage cache with TTL (2-5 min) to reduce API calls on navigation. The console page fetches all projects then fans out parallel requests for each project's latest deployment — N+1 pattern, acceptable at small project counts. Next.js `output: "standalone"` for containerized deployment. `lodash.debounce` for Dockerfile check (600ms).

- **Performance characteristics:** Cold load hits API for projects + N deployment lists in parallel. Subsequent loads within TTL window are served from localStorage cache. No SSR data fetching — all pages are client components that fetch on mount. Images use `remotePatterns` only for `cdn.simpleicons.org`.

- **Known limitations:** JWT access token visible in browser localStorage. No refresh token. Session expires silently after 24h — user sees unauthorized errors until they re-auth. No CSRF protection (API token auth mitigates this). Settings save is a no-op (confirmed in comments). `health_check_path` sent as `health_check_path` in deploy request JSON but handler reads `health_check` — field name mismatch means health check path from the new-project form is silently ignored.

---

### Database Package (`packages/db`)

- **What it does:** Single shared Go package containing sqlc-generated type-safe query code, migration files, raw SQL queries, and sqlc config. Exposes a `Querier` interface and concrete `Queries` struct. All queries use positional parameters (`$1`, `$2`). Users table uses `ON CONFLICT (github_id) DO UPDATE` — upsert on every login (token refresh). Five tables: `users`, `projects`, `deployments`, `env_vars`, `activity_logs`. Indexes on all foreign keys plus `deployments.status`.

- **Key design decisions:** sqlc over GORM — no reflection, compile-time type checking, zero-abstraction SQL. `emit_interface: true` enables mock testing. `emit_prepared_queries: false` — no prepared statement caching. `pgcrypto` extension for `gen_random_uuid()`. `env_vars.value` stored as `TEXT NOT NULL DEFAULT ''` — plaintext. `secret_arn` column exists but is never populated by any current code path. `deployments.subdomain` has UNIQUE constraint — prevents two active deployments with the same subdomain.

- **Known limitations:** No migration down files — only `000001_init.up.sql`. No soft deletes. `env_vars` schema has both `value` and `secret_arn` columns suggesting planned Secrets Manager integration that was never completed. Activity log hard-capped at 50 rows per query (no cursor/offset pagination).

---

### Config Package (`packages/config`)

- **What it does:** Shared config loader for the API service only. Calls `godotenv.Load()` then reads env vars with `mustGetEnv` (fatal on missing) or `getEnv` (with fallback). Exports a `Config` struct.

- **Known limitations:** Only used by `apps/api` — builder and deployer implement their own inline env reading. `packages/events` also exists but is unused by any service.

---

### Events Package (`packages/events`)

- **What it does:** Defines `BuildJobEvent` and `DeployJobEvent` structs intended for sharing across services.

- **Known limitations:** **Completely unused.** Both structs are redefined locally in `apps/api/internal/queue`, `apps/builder/internal/queue`, and `apps/deployer/internal/queue`. Any drift between the package and local definitions would cause silent JSON deserialization failures.

---

### Infrastructure (`infra/`)

- **What it does:** Terraform modules for full AWS stack. `networking/` — VPC (10.0.0.0/16), Internet Gateway, 2 public subnets (ap-south-1a/1b), route table, ALB SG (80/443 open), ECS SG (all TCP from ALB SG). `ecs/` — ECS cluster (container insights disabled), IAM task execution role (AmazonECSTaskExecutionRolePolicy + ECRReadOnly + CloudWatch Logs inline policy). `alb/` — ALB, HTTP→HTTPS 301 redirect, HTTPS listener (TLS 1.3 PQ policy, ACM cert), default 404 fixed-response, API target group (port 8080, instance type), listener rule for `api.hatchcloud.xyz`. `ec2/` — Ubuntu 24.04 on m7i-flex.large, IAM role with ECRPowerUser, user_data installs docker/go/nodejs/npm/pm2, attached to ALB API target group. `envs/dev/` — wires modules, S3 backend (hard-coded bucket name with account ID).

- **Key design decisions:** All subnets are public (no NAT gateway) — ECS tasks get public IPs (`AssignPublicIpEnabled`). EC2 SSH open to 0.0.0.0/0 (documented as "restrict to your IP"). State stored in S3 (`hatch-terraform-state-362041633362`, ap-south-1). Hard-coded ACM certificate ARN, account ID, and bucket name in committed code.

- **Known limitations:** Hard-coded account ID and certificate ARN in `envs/dev/main.tf` — not parameterized. No private subnets or NAT — all workloads on public subnets. `alb_listener_arn` Terraform output points to the HTTP listener (port 80), but deployer needs the HTTPS listener ARN for host-header rules (HTTPS listener is exported as `alb_https_listener_arn`). README instructs users to use `alb_listener_arn` but this would put rules on the HTTP listener that just redirects to HTTPS — effectively no routing for deployed services.

---

## Decisions & Tradeoffs

| Decision                     | Chosen                                 | Rejected                               | Why                                                                                                                      |
| ---------------------------- | -------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Service communication        | RabbitMQ async queues                  | Direct HTTP calls between services     | API returns immediately after publish; builder/deployer are independently scalable; queue absorbs burst                  |
| Log streaming bridge         | Redis pub/sub + list                   | Direct WebSocket from builder/deployer | Builder and deployer don't have HTTP servers; Redis decouples the streaming concern cleanly                              |
| Log persistence              | Redis RPUSH with 7-day TTL             | PostgreSQL log table                   | High write frequency, ephemeral by nature; Postgres would create hot table with fast churn                               |
| DB query layer               | sqlc codegen                           | GORM / sqlx                            | Compile-time type safety, zero reflection, explicit SQL, no magic                                                        |
| Auth                         | GitHub OAuth + HS256 JWT               | Email/password, Google OAuth           | GitHub is the only identity source (repos); GitLab shown as disabled/planned                                             |
| JWT storage                  | localStorage                           | httpOnly cookie                        | Simpler for SPA; tradeoff is XSS exposure; no server-side session infrastructure needed                                  |
| Docker build execution       | `exec.Command("docker", ...)`          | Docker SDK (`moby/moby`)               | CLI output is already line-buffered and human-readable; SDK output requires JSON parsing; streaming is simpler via pipes |
| ECR login                    | Per-build `GetAuthorizationToken`      | Shared cached token                    | ECR tokens expire every 12h; simpler to refresh each build than manage token lifecycle                                   |
| ECS networking               | Public subnet + public IP              | Private subnet + NAT                   | Eliminates NAT Gateway cost (~$32/month); appropriate for self-hosted single-tenant use                                  |
| Fargate over EC2 launch type | Fargate                                | EC2                                    | No cluster capacity management; per-task billing; appropriate for variable workload count                                |
| Monorepo structure           | Go workspace (`go.work`) + Next.js app | Separate repos                         | Shared packages (db, config, events) without publishing to a registry; local replace directives                          |
| Terraform state              | S3 backend                             | Local state / Terraform Cloud          | Persistent, shareable, supports locking without cost                                                                     |
| ALB routing                  | Host-header rules per deployment       | Path-based rules                       | Each deployment gets its own subdomain; cleaner isolation; no URL prefix required in user app                            |
| Deployer DB writes           | Direct Postgres connection             | API endpoint call                      | Avoids inter-service HTTP; simpler failure handling; acceptable since deployer already needs DB for env_vars             |
| Container insights           | Disabled                               | Enabled                                | Cost savings on default; noted in Terraform                                                                              |
| HTTPS/TLS                    | ACM wildcard cert + ALB                | Let's Encrypt on EC2                   | Managed renewal, no cert rotation ops; requires Route 53 or DNS validation upfront                                       |

---

## Bugs Solved

| Bug                                                       | Root Cause                                                                                                                | Fix                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Webhook always rejecting valid pushes                     | GitHub sends repo URLs with or without `.git` suffix; `repo_url` stored without `.git` but comparison was direct equality | Added `strings.TrimSuffix(payload.Repository.HTMLURL, ".git")` before DB lookup                                                        |
| Deployment logs not persisting across page refresh        | Initial WS implementation only used pub/sub with no history                                                               | Added `RPUSH logs:{id}` alongside `PUBLISH deployment:{id}` in `Streamer.Publish()`; WS hub replays list on connect before subscribing |
| ECR push failing on fresh deploy                          | Docker login was receiving base64-encoded token directly without decoding                                                 | Added `base64.StdEncoding.DecodeString` before splitting on `:` to get username/password                                               |
| ECS service creation failing on redeploy with port change | `UpdateService` cannot change load balancer config; AWS returns an error                                                  | Added port-change detection in `upsertService`; force-deletes old service + 5s sleep before creating new one                           |
| Target group creation failing on redeploy                 | CreateTargetGroup fails if name already exists with different port                                                        | Added `DescribeTargetGroups` check; if exists with same port, reuse; if different port, delete then recreate                           |

---

## Current State

**Last worked on:** May 31, 2026 (per README screenshot dates)

**What's done:**

- Full deployment pipeline (clone → build → push ECR → ECS Fargate → ALB)
- GitHub OAuth + JWT auth
- WebSocket real-time log streaming with Redis-backed history
- Project CRUD with GitHub webhook registration on create
- Auto-deploy on push (branch-filtered, HMAC-verified)
- Project delete with ECS/ALB cleanup via queue
- Console, new service wizard, project detail, deployment detail, activity, infrastructure, profile pages
- Full Terraform stack for AWS infrastructure
- Docker Compose for local dev
- k6 load test scripts
- Docs pages (quick-start, configuration, env vars, self-hosting, roadmap, changelog)

**What's in progress:**

- Nothing explicitly in-progress; clean commit state implied

**What's next (roadmap):**

- PR preview environments (auto-deploy per PR, destroy on merge)
- Cost dashboard (per-deployment cost estimates)
- Native runtimes (Node.js, Python, Go without Dockerfile)
- Custom domains + automatic TLS provisioning
- One-click rollbacks
- Built-in observability (OpenTelemetry, Prometheus, Grafana, Jaeger)
- `PATCH /api/projects/:id` endpoint (needed for settings page to function)
- GitLab auth (shown as disabled in UI)

**Open questions:**

- Why does `packages/events` exist if nothing imports it? Likely intended to be the shared type source but each service ended up with local copies before the package was connected.
- `go.work` specifies `go 1.25.10` which does not exist — likely a typo for 1.23 or 1.24.
- `alb_listener_arn` Terraform output gives HTTP listener ARN; deployer needs HTTPS listener ARN (`alb_https_listener_arn`). README setup instructions would misconfigure this.
- `env_vars.secret_arn` column and `CreateEnvVar` sqlc method accept a `secret_arn`, but no code path populates it. Planned AWS Secrets Manager integration that was shelved?
- Builder `.env.example` includes `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` — unused by the builder. Wrong file or leftover from a previous design?

---

## Performance Benchmarks

| Endpoint/Service         | RPS                | Latency            | Conditions                                                                                 |
| ------------------------ | ------------------ | ------------------ | ------------------------------------------------------------------------------------------ |
| GET /api/projects        | Target: p95 < 50ms | Target: p95 < 50ms | k6: ramp 0→50→100→0 VU over 50s, 0.1s sleep between iterations, batched with GET /activity |
| GET /api/activity        | Target: p95 < 50ms | Target: p95 < 50ms | Same k6 batch as above                                                                     |
| POST /api/deployments    | N/A                | N/A                | k6 script exists (10 VU, 30s), placeholder project_id, no real AWS calls in test           |
| Full deployment pipeline | N/A                | ~3-8 minutes       | Build time varies by image; ECS convergence ~1-3 min; 15s poll granularity                 |

No actual benchmark results are stored in the codebase — only the k6 scripts with threshold targets.
