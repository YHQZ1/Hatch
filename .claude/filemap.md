# File Map

## Structure

```
Hatch-main/
├── .dockerignore
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml
│   │   └── feature_request.yml
│   └── PULL_REQUEST_TEMPLATE.md
├── .gitignore
├── CONTRIBUTING.md
├── Makefile
├── README.md
├── SECURITY.md
├── docker-compose.yaml
├── go.work
├── go.work.sum
├── apps/
│   ├── api/
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   ├── go.mod
│   │   ├── go.sum
│   │   └── cmd/
│   │       └── server/
│   │           └── main.go
│   │   └── internal/
│   │       ├── auth/
│   │       │   ├── github.go
│   │       │   └── middleware.go
│   │       ├── db/
│   │       │   └── db.go
│   │       ├── handlers/
│   │       │   ├── activity.go
│   │       │   ├── deployments.go
│   │       │   ├── github.go
│   │       │   ├── helpers.go
│   │       │   ├── projects.go
│   │       │   └── webhook.go
│   │       ├── middleware/
│   │       │   └── metrics.go
│   │       ├── queue/
│   │       │   └── publisher.go
│   │       └── ws/
│   │           └── hub.go
│   ├── builder/
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   ├── go.mod
│   │   ├── go.sum
│   │   └── cmd/
│   │       └── worker/
│   │           └── main.go
│   │   └── internal/
│   │       ├── docker/
│   │       │   └── build.go
│   │       ├── git/
│   │       │   └── clone.go
│   │       ├── logs/
│   │       │   └── redis.go
│   │       └── queue/
│   │           └── worker.go
│   ├── deployer/
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   ├── go.mod
│   │   ├── go.sum
│   │   └── cmd/
│   │       └── worker/
│   │           └── main.go
│   │   └── internal/
│   │       ├── ecs/
│   │       │   └── deploy.go
│   │       ├── logs/
│   │       │   └── redis.go
│   │       └── queue/
│   │           └── worker.go
│   └── web/
│       ├── .env.example
│       ├── .env.local
│       ├── Dockerfile
│       ├── eslint.config.mjs
│       ├── next-env.d.ts
│       ├── next.config.ts
│       ├── package.json
│       ├── package-lock.json
│       ├── postcss.config.mjs
│       ├── tsconfig.json
│       └── public/
│       │   ├── aws.svg
│       │   ├── hatch.svg
│       │   └── map.svg
│       └── src/
│           └── app/
│               ├── globals.css
│               ├── layout.tsx
│               ├── not-found.tsx
│               ├── page.tsx
│               ├── components/
│               │   ├── LoadingState.tsx
│               │   ├── Navbar.tsx
│               │   └── PageHeader.tsx
│               ├── (pages)/
│               │   ├── auth/
│               │   │   ├── page.tsx
│               │   │   └── success/
│               │   │       └── page.tsx
│               │   └── (protected)/
│               │       ├── layout.tsx
│               │       ├── activity/
│               │       │   ├── ActivityClient.tsx
│               │       │   └── page.tsx
│               │       ├── console/
│               │       │   ├── ConsoleClient.tsx
│               │       │   └── page.tsx
│               │       ├── infrastructure/
│               │       │   ├── InfrastructureClient.tsx
│               │       │   └── page.tsx
│               │       ├── new/
│               │       │   ├── NewProjectClient.tsx
│               │       │   └── page.tsx
│               │       ├── projects/
│               │       │   └── [id]/
│               │       │       ├── ProjectClient.tsx
│               │       │       ├── page.tsx
│               │       │       ├── deployments/
│               │       │       │   └── [deploymentId]/
│               │       │       │       ├── DeploymentDetailClient.tsx
│               │       │       │       └── page.tsx
│               │       │       └── settings/
│               │       │           ├── ProjectSettingsClient.tsx
│               │       │           └── page.tsx
│               │       └── u/
│               │           └── [id]/
│               │               ├── UserClient.tsx
│               │               └── page.tsx
│               └── docs/
│                   ├── layout.tsx
│                   ├── changelog/
│                   │   └── page.tsx
│                   ├── configuration/
│                   │   └── page.tsx
│                   ├── environment-variables/
│                   │   └── page.tsx
│                   ├── quick-start/
│                   │   └── page.tsx
│                   ├── roadmap/
│                   │   └── page.tsx
│                   └── self-hosting/
│                       └── page.tsx
├── infra/
│   ├── envs/
│   │   └── dev/
│   │       ├── main.tf
│   │       └── variables.tf
│   └── modules/
│       ├── alb/
│       │   └── main.tf
│       ├── ec2/
│       │   └── main.tf
│       ├── ecs/
│       │   └── main.tf
│       └── networking/
│           └── main.tf
├── packages/
│   ├── config/
│   │   ├── config.go
│   │   └── go.mod
│   ├── db/
│   │   ├── go.mod
│   │   ├── go.sum
│   │   ├── sqlc.yaml
│   │   ├── gen/
│   │   │   ├── activity.sql.go
│   │   │   ├── db.go
│   │   │   ├── deployments.sql.go
│   │   │   ├── env_vars.sql.go
│   │   │   ├── models.go
│   │   │   ├── projects.sql.go
│   │   │   ├── querier.go
│   │   │   └── users.sql.go
│   │   ├── migrations/
│   │   │   └── 000001_init.up.sql
│   │   └── queries/
│   │       ├── activity.sql
│   │       ├── deployments.sql
│   │       ├── env_vars.sql
│   │       ├── projects.sql
│   │       └── users.sql
│   └── events/
│       ├── events.go
│       └── go.mod
└── scripts/
    ├── internal_bench.js
    └── orchestration_test.js
```

---

## File Index

### API Service (`apps/api`)

**main.go** (`apps/api/cmd/server/main.go`)

- Purpose: Entry point. Wires all dependencies (DB, Redis, RabbitMQ publisher, WebSocket hub, config) and registers all HTTP/WS routes on a Gin router.
- Key functions: `main()` — loads config, opens DB connection, creates RabbitMQ publisher, creates Redis client, creates WS hub, configures CORS middleware, registers 4 public routes and 12 authenticated routes under `/api` group, starts server.
- Dependencies: `packages/config`, `apps/api/internal/auth`, `apps/api/internal/db`, `apps/api/internal/handlers`, `apps/api/internal/middleware`, `apps/api/internal/queue`, `apps/api/internal/ws`, `gin`, `gin-contrib/cors`, `go-redis/v9`, `godotenv`
- Called by: OS (process entry point)
- Notes: `StatTracker` middleware is applied globally before CORS. WebSocket route (`/ws/deployments/:id`) and OAuth callback routes are intentionally outside the JWT middleware group. The `rdb` (Redis client) passed to `DeploymentHandler` is a separate instance from the `Hub`'s internal client — two Redis connections.

---

**github.go** (`apps/api/internal/auth/github.go`)

- Purpose: GitHub OAuth 2.0 flow — redirect to GitHub, handle callback, exchange code for token, fetch user profile, upsert user in DB, sign JWT.
- Key functions: `NewHandler()` — constructs handler with OAuth credentials and DB queries. `RedirectToGitHub()` — 302 redirect to GitHub with `repo,user` scopes. `HandleCallback()` — exchanges code, fetches profile, upserts user, signs JWT, redirects to `{FRONTEND_URL}/auth/success?token={jwt}`. `exchangeCodeForToken()` — POST to GitHub token endpoint. `fetchGitHubUser()` — GET `api.github.com/user`. `signJWT()` — HS256 JWT with `user_id`, `github_id`, `username`, `access_token`, 24h expiry.
- Dependencies: `packages/db/gen`, `gin`, `golang-jwt/jwt/v5`, `google/uuid`
- Called by: `main.go` (handler registration)
- Notes: Access token is embedded in JWT claims in plaintext. JWT 24h expiry — no refresh mechanism. `HandleCallback` reads `FRONTEND_URL` via `os.Getenv` directly rather than from the injected config struct.

---

**middleware.go** (`apps/api/internal/auth/middleware.go`)

- Purpose: Gin JWT authentication middleware. Validates Bearer token, extracts claims into Gin context.
- Key functions: `Middleware(jwtSecret string) gin.HandlerFunc` — parses `Authorization: Bearer <token>`, validates HS256 signature, sets `user_id`, `github_id`, `username`, `access_token` in context.
- Dependencies: `gin`, `golang-jwt/jwt/v5`
- Called by: `main.go` (applied to `/api` route group)
- Notes: Does not validate `exp` claim explicitly — `jwt.Parse` handles this. Rejects non-HMAC signing methods to prevent algorithm confusion attacks.

---

**db.go** (`apps/api/internal/db/db.go`)

- Purpose: Opens and pings a Postgres connection using `lib/pq` driver.
- Key functions: `Connect(databaseURL string) *sql.DB` — `sql.Open` + `db.Ping`, fatal on error.
- Dependencies: `database/sql`, `lib/pq` (blank import for driver registration)
- Called by: `main.go`
- Notes: Returns `*sql.DB` (stdlib), not a custom type. Connection pool uses defaults (max 0 open = unlimited, max idle = 2). No pool configuration exposed.

---

**activity.go** (`apps/api/internal/handlers/activity.go`)

- Purpose: Handler for `GET /api/activity`. Returns last 50 activity log entries for the authenticated user.
- Key functions: `(h *ProjectHandler) GetActivity(c *gin.Context)` — extracts user ID, calls `GetActivityLogsByUserID`, returns JSON array (nil-safe: returns empty array if no logs).
- Dependencies: `packages/db/gen`, `gin`
- Called by: `main.go` (route registration on `ProjectHandler`)
- Notes: Activity logging is fire-and-forget from `ProjectHandler.recordActivity()`. Only CREATE and DELETE project events are currently logged.

---

**deployments.go** (`apps/api/internal/handlers/deployments.go`)

- Purpose: Handlers for deployment CRUD and log retrieval.
- Key functions: `NewDeploymentHandler()` — constructor. `CreateDeployment()` — validates request, looks up project, creates deployment record, inserts env vars via raw SQL, publishes `BuildJobEvent` to RabbitMQ. `GetDeployment()` — single deployment by ID. `ListDeployments()` — all deployments for a project. `GetDeploymentLogs()` — reads `logs:{id}` list from Redis. `toDeploymentResponse()` — converts DB model to JSON-safe response type (handles `sql.NullString` → `*string`).
- Dependencies: `packages/db/gen`, `apps/api/internal/queue`, `gin`, `go-redis/v9`, `google/uuid`
- Called by: `main.go`
- Notes: Env vars are inserted via raw `db.ExecContext` (not sqlc) with `key` and `value` columns — `secret_arn` is not populated. Bug: frontend sends `health_check_path` but handler reads `body.HealthCheck` (JSON tag `health_check`) — health check path is silently dropped, defaults to `/`. Debug `fmt.Printf` left in for DB errors.

---

**github.go** (`apps/api/internal/handlers/github.go`)

- Purpose: Proxy GitHub API calls with Redis caching.
- Key functions: `NewGitHubHandler(rdb)` — constructor. `ListRepos()` — fetches user repos from `api.github.com/user/repos?sort=updated&per_page=100`, caches in Redis at `github:repos:{username}` for 5 minutes. `CheckDockerfile()` — checks `api.github.com/repos/{owner}/{repo}/contents/{path}`, caches positive result at `github:dockerfile:{owner}:{repo}:{path}` for 10 minutes.
- Dependencies: `gin`, `go-redis/v9`
- Called by: `main.go`
- Notes: Cache only stores positive Dockerfile check result (`"true"`). Negative results are not cached — every non-existent path check hits GitHub. Token and username extracted from Gin context (set by JWT middleware).

---

**helpers.go** (`apps/api/internal/handlers/helpers.go`)

- Purpose: Shared utility for extracting authenticated user ID from Gin context.
- Key functions: `getUserID(c *gin.Context) (uuid.UUID, error)` — reads `user_id` string from context, parses as UUID.
- Dependencies: `gin`, `google/uuid`
- Called by: `activity.go`, `deployments.go`, `projects.go`

---

**projects.go** (`apps/api/internal/handlers/projects.go`)

- Purpose: Handlers for project CRUD plus async GitHub webhook registration.
- Key functions: `NewProjectHandler()` — constructor. `ListProjects()` — returns user's projects ordered by created_at DESC. `CreateProject()` — creates project record, generates 32-byte hex webhook secret, registers GitHub webhook asynchronously in a goroutine, records CREATE activity. `GetProject()` — single project by ID. `DeleteProject()` — publishes cleanup job to `hatch.cleanup.jobs`, deletes DB record, records DELETE activity. `registerGitHubWebhook()` — POST to `api.github.com/repos/{owner}/{repo}/hooks` with push event. `parseRepoURL()` — extracts owner/repo from GitHub HTTPS URL. `generateSecret()` — crypto/rand 32 bytes → hex. `recordActivity()` — async goroutine, best-effort.
- Dependencies: `packages/db/gen`, `apps/api/internal/queue`, `gin`, `google/uuid`
- Called by: `main.go`
- Notes: Webhook registration runs in a goroutine — project creation succeeds even if GitHub webhook registration fails silently. `subdomain` is lowercased and trimmed. `branch` defaults to `"main"` if not provided. Unique constraint violation on subdomain returns 409.

---

**webhook.go** (`apps/api/internal/handlers/webhook.go`)

- Purpose: Handler for `POST /api/webhooks/github` — receives GitHub push webhooks and triggers auto-deploy.
- Key functions: `NewWebhookHandler()` — constructor. `HandlePush()` — validates event type, reads body, normalizes repo URL (trims `.git`), looks up project, checks `auto_deploy` flag, conditionally verifies HMAC-SHA256 signature, checks branch match, fetches user token, creates deployment record, publishes `BuildJobEvent`. `verifySignature()` — HMAC-SHA256 constant-time comparison.
- Dependencies: `packages/db/gen`, `apps/api/internal/queue`, `gin`
- Called by: `main.go` (public route, no JWT middleware)
- Notes: Returns 202 (not 404) if project not found — prevents GitHub from retrying on unknown repos. Signature verification is skipped if `webhook_secret` is NULL/empty in DB. Auto-deploy CPU/memory hardcoded to 512/1024 — not user-configurable for webhook-triggered deploys. Webhook endpoint is unauthenticated (public).

---

**metrics.go** (`apps/api/internal/middleware/metrics.go`)

- Purpose: Request latency logging middleware. Logs method, path, status, and duration to stdout with ANSI color coding. Sets `X-Hatch-Trace-Duration` response header.
- Key functions: `StatTracker() gin.HandlerFunc`
- Dependencies: `gin`
- Called by: `main.go` (global middleware, applied before CORS)
- Notes: Stdout only — not exported to Prometheus or any metrics backend. Status 4xx = yellow, 5xx = red, 2xx/3xx = green.

---

**publisher.go** (`apps/api/internal/queue/publisher.go`)

- Purpose: RabbitMQ publisher. Declares queues and publishes `BuildJobEvent` and cleanup job messages.
- Key functions: `NewPublisher(url string) *Publisher` — dials AMQP, opens channel, declares `hatch.build.jobs` (durable) and `hatch.cleanup.jobs` (durable). `PublishBuildJob(ctx, BuildJobEvent) error` — JSON marshal + publish to `hatch.build.jobs` with `DeliveryMode: Persistent`. `PublishCleanupJob(ctx, []string) error` — publishes subdomain list to `hatch.cleanup.jobs`. `Close()` — closes channel then connection.
- Dependencies: `amqp091-go`
- Called by: `main.go` (instantiation), `deployments.go`, `projects.go`, `webhook.go`
- Notes: `BuildJobEvent` struct is defined locally here (also defined in builder and the unused `packages/events`). `hatch.deploy.jobs` is NOT declared here — builder declares it when publishing. Single AMQP connection and channel — no reconnect logic.

---

**hub.go** (`apps/api/internal/ws/hub.go`)

- Purpose: WebSocket handler that streams deployment logs to connected browsers via Redis pub/sub.
- Key functions: `NewHub(url string) *Hub` — creates Hub with dedicated Redis client. `HandleDeploymentLogs(c *gin.Context)` — upgrades HTTP to WebSocket, waits for `"READY"` message from client, replays log history from `logs:{id}` Redis list (50ms delay), then subscribes to `deployment:{id}` and forwards each message until connection closes or context done.
- Dependencies: `gin`, `gorilla/websocket`, `go-redis/v9`
- Called by: `main.go` (route: `/ws/deployments/:id`)
- Notes: `CheckOrigin` always returns `true` — no origin validation on WS upgrade. Each connection creates its own Redis `Subscribe()` — no connection reuse. The 50ms sleep before history replay is a race condition mitigation (not a guarantee). No auth on the WebSocket route — anyone with a deployment ID can subscribe.

---

### Builder Service (`apps/builder`)

**main.go** (`apps/builder/cmd/worker/main.go`)

- Purpose: Entry point for builder worker. Reads env, constructs worker, starts in goroutine, blocks on SIGINT/SIGTERM.
- Key functions: `main()` — loads env, builds inline config struct, creates queue.Worker, starts `worker.Start()` in goroutine, waits for signal. `getEnv(key string) string` — reads env var, fatals if missing.
- Dependencies: `apps/builder/internal/queue`, `godotenv`
- Called by: OS
- Notes: Uses inline anonymous struct for config (not the shared `packages/config`). Graceful shutdown is signal-triggered but `worker.Close()` is never called from signal handler — connections are dropped on exit.

---

**worker.go** (`apps/builder/internal/queue/worker.go`)

- Purpose: RabbitMQ consumer for `hatch.build.jobs`. Orchestrates the clone → build → push → handoff pipeline.
- Key functions: `NewWorker()` — constructs worker with Streamer and Builder. `Start() error` — dials AMQP, declares both queues (`hatch.build.jobs`, `hatch.deploy.jobs`), starts consuming, processes each message. `process(job BuildJobEvent)` — creates temp dir, clones repo, calls `BuildAndPush`, calls `handoff`. `handoff()` — publishes `DeployJobEvent` to `hatch.deploy.jobs`. `Close()` — closes channel and connection.
- Dependencies: `apps/builder/internal/docker`, `apps/builder/internal/git`, `apps/builder/internal/logs`, `amqp091-go`
- Called by: `main.go`
- Notes: `BuildJobEvent` is redefined locally (duplicate of `packages/events`). `DeployJobEvent` is also defined locally. Failed Nack with `requeue=false`. Temp dir cleaned via `defer os.RemoveAll`. `process()` runs synchronously in the consumer loop — one job at a time.

---

**build.go** (`apps/builder/internal/docker/build.go`)

- Purpose: Docker build + ECR push with real-time log streaming.
- Key functions: `NewBuilder()` — constructor. `BuildAndPush(ctx, id, repoDir, dockerfilePath) (string, error)` — orchestrates build then push, returns image URI. `runBuild()` — constructs `docker build --platform linux/amd64 -t {tag} -f {dockerfile} .`, sets `cmd.Dir` to context directory, calls `executeAndStream`. `runPush()` — decodes ECR base64 token, `docker login --password-stdin`, `docker push`, calls `executeAndStream`. `executeAndStream()` — creates stdout/stderr pipes, starts command, launches two `capture` goroutines, waits. `capture()` — scanner loop publishing each non-empty line to Redis. `getAuthToken()` — loads AWS SDK config, calls `ecr.GetAuthorizationToken`.
- Dependencies: `apps/builder/internal/logs`, `aws-sdk-go-v2/config`, `aws-sdk-go-v2/service/ecr`
- Called by: `worker.go`
- Notes: Image tag: `{registry}/{repo}:{deploymentID[:8]}` — short ID, potential collision if two deployments share the same 8-char prefix (UUID collision is astronomically unlikely but worth noting). Build context is derived from `dockerfilePath` by splitting on last `/`. stdout and stderr are captured in separate goroutines — interleaved order is not deterministic. No build timeout beyond context cancellation.

---

**clone.go** (`apps/builder/internal/git/clone.go`)

- Purpose: Clones a GitHub repository using the user's OAuth token via HTTPS.
- Key functions: `Clone(ctx, repoURL, token, destDir string) error` — removes existing dest dir, creates it, runs `git clone --depth=1 https://{token}@{repoPath} {destDir}`.
- Dependencies: `os`, `os/exec`
- Called by: `worker.go`
- Notes: Shallow clone (`--depth=1`) — faster, no history. Token embedded directly in URL — appears in process list and git logs on the build machine. Branch is not specified in clone (uses default branch) — BUILD DOES NOT CHECKOUT THE REQUESTED BRANCH. This is a potential bug: if the deployment branch differs from the repo's default branch, the wrong code is built.

---

**redis.go** (`apps/builder/internal/logs/redis.go`)

- Purpose: Redis log streamer — appends log lines to a persistent list and publishes to pub/sub channel atomically.
- Key functions: `NewStreamer(url string) *Streamer` — parses Redis URL (falls back to treating URL as address). `(s *Streamer) Publish(ctx, id, message string)` — pipelined `RPUSH logs:{id}` + `EXPIRE logs:{id} 604800` (7 days) + `PUBLISH deployment:{id}`.
- Dependencies: `go-redis/v9`
- Called by: `worker.go` (via Builder and directly), `build.go`
- Notes: Identical implementation to `apps/deployer/internal/logs/redis.go` — duplicated across both services. The `EXPIRE` is reset on every publish (sliding TTL). Pipeline errors are silently discarded (`_, _ = pipe.Exec(ctx)`).

---

### Deployer Service (`apps/deployer`)

**main.go** (`apps/deployer/cmd/worker/main.go`)

- Purpose: Entry point for deployer worker. Reads env into `queue.Config`, constructs worker, starts in goroutine, blocks on signal.
- Key functions: `main()` — loads env, populates `queue.Config`, calls `queue.NewWorker`, starts, waits for SIGINT/SIGTERM. `mustGetEnv()` — fatals on missing.
- Dependencies: `apps/deployer/internal/queue`, `godotenv`
- Called by: OS
- Notes: `BASE_DOMAIN` is read here and passed to config — this var is absent from `packages/config` (API doesn't need it). `worker.Close()` is not called on shutdown.

---

**worker.go** (`apps/deployer/internal/queue/worker.go`)

- Purpose: RabbitMQ consumer for `hatch.deploy.jobs` and `hatch.cleanup.jobs`. Manages deployment lifecycle in DB and delegates AWS operations to ECS deployer.
- Key functions: `NewWorker(cfg Config) *Worker` — creates Streamer, Deployer, opens Postgres. `Start() error` — dials AMQP, declares two queues, starts cleanup consumer in goroutine, processes deploy jobs serially. `processJob()` — updates status to `deploying`, fetches env vars, calls `deployer.Deploy()`, calls `finalizeDeployment` or updates to `failed`. `fetchEnvVars()` — raw `SELECT key, value FROM env_vars WHERE deployment_id = $1`. `updateDeploymentStatus()` — raw `UPDATE deployments SET status`. `finalizeDeployment()` — raw `UPDATE deployments SET status='live', image_uri, url, deployed_at=now()`. `handleCleanupJobs()` — goroutine consuming cleanup slugs, calls `deployer.Teardown()` for each.
- Dependencies: `apps/deployer/internal/ecs`, `apps/deployer/internal/logs`, `amqp091-go`, `lib/pq`
- Called by: `main.go`
- Notes: Has direct Postgres connection — writes deployment status independently of API. This is a second writer to the `deployments` table. `DeployJobEvent` redefined locally (third copy; packages/events is unused). `finalizeDeployment` uses raw SQL rather than the sqlc `UpdateDeploymentLive` method which also sets `ecs_task_arn` — ECS task ARN is never populated in DB by current deployer.

---

**deploy.go** (`apps/deployer/internal/ecs/deploy.go`)

- Purpose: All AWS ECS and ALB operations for provisioning and tearing down user deployments.
- Key functions: `NewDeployer()` — loads AWS SDK config, constructs ECS and ELBv2 clients. `Deploy(ctx, DeployInput) (string, error)` — full provisioning pipeline: register task def → upsert TG → upsert listener rule → upsert service → wait for stability. `registerTaskDefinition()` — awsvpc, Fargate, `awslogs-create-group: true`, env vars as KV pairs. `upsertTargetGroup()` — check existing by name, reuse if same port, delete+recreate if port changed, 2s sleep after delete. `upsertListenerRule()` — scan all rules for matching host-header, ModifyRule if found, CreateRule with timestamp-based priority if not. `upsertService()` — DescribeServices, UpdateService if exists and port matches, force-delete+5s sleep+CreateService if port changed or service inactive. `waitForStability()` — 15s ticker, 8min timeout, checks `RunningCount >= 1 && PendingCount == 0`. `Teardown(ctx, slug string)` — deletes listener rule by host-header, force-deletes ECS service, 5s sleep, deletes target group.
- Dependencies: `apps/deployer/internal/logs`, `aws-sdk-go-v2/service/ecs`, `aws-sdk-go-v2/service/elasticloadbalancingv2`
- Called by: `worker.go`
- Notes: Rule priority: `time.Now().Unix()%49000 + 1000` — range 1000-49999, not globally unique within the same second. ECS Fargate tasks get public IPs (`AssignPublicIpEnabled`). CloudWatch log group auto-created via `awslogs-create-group: true`. Task definition family: `hatch-{subdomain}`. Service name: `hatch-{subdomain}`. Target group name: `h-{subdomain}` (max 32 chars). Teardown does not delete ECS task definition revisions. `Teardown` does not delete CloudWatch log group.

---

**redis.go** (`apps/deployer/internal/logs/redis.go`)

- Purpose: Identical to `apps/builder/internal/logs/redis.go`. Redis log streamer with RPUSH + EXPIRE + PUBLISH pipeline.
- Key functions: `NewStreamer()`, `Publish()`
- Dependencies: `go-redis/v9`
- Called by: `worker.go`, `deploy.go`
- Notes: Exact code duplicate of builder's logs package. Should be extracted to a shared package.

---

### Web App (`apps/web`)

**page.tsx** (`apps/web/src/app/page.tsx`)

- Purpose: Public landing page. Full marketing page with terminal simulator, architecture diagram, tech grid, feature descriptions.
- Key functions: `Hatch()` — root component. `TerminalSimulator()` — animated deploy log replay using `useEffect` + `setTimeout` chain. `ArchitectureDiagram()` — SVG-based architecture visualization. `Header()`, `Footer()`, `HeroSection()`, `HowItWorks()`, `SupportedTechnologies()`, `WorkloadPrimitives()`, `ProductFeatures()`.
- Dependencies: Next.js `Link`
- Called by: Next.js router at `/`
- Notes: Client component (`"use client"`). Tech icons loaded from `cdn.simpleicons.org`. Terminal simulator is purely decorative — not a real WebSocket.

---

**layout.tsx** (`apps/web/src/app/layout.tsx`)

- Purpose: Root HTML layout. Sets metadata, fonts (Inter + JetBrains Mono), NextTopLoader, global CSS, background grid pattern.
- Key functions: `RootLayout()` — sets `<html>` with dark class, wraps children in `<main>`.
- Dependencies: `next/font/google`, `nextjs-toploader`
- Called by: Next.js App Router (wraps all pages)
- Notes: `output: "standalone"` set in `next.config.ts`. Metadata includes author `Uttkarsh Ruparel`.

---

**not-found.tsx** (`apps/web/src/app/not-found.tsx`)

- Purpose: Custom 404 page. Links back to `/console` or `router.back()`.
- Dependencies: Next.js `Link`, `useRouter`
- Called by: Next.js App Router on unmatched routes

---

**globals.css** (`apps/web/src/app/globals.css`)

- Purpose: Tailwind v4 import, CSS custom properties (hatch color tokens), body base styles, `.bg-grid-pattern` SVG background, `::selection` override.
- Called by: `layout.tsx`

---

**Navbar.tsx** (`apps/web/src/app/components/Navbar.tsx`)

- Purpose: Sticky top nav with Hatch logo, main nav links (Console, Activity, Infrastructure), New button, user avatar dropdown with sign out.
- Key functions: `Navbar()` — decodes JWT from localStorage client-side to get username/avatar. Active link indicated by bottom border. Dropdown closes on outside click. `handleSignOut()` removes token and pushes to `/`.
- Dependencies: Next.js `Link`, `useRouter`, `usePathname`
- Called by: `(protected)/layout.tsx`
- Notes: JWT decoded without verification in browser (no signature check — trust is in server-side JWT validation at API). Avatar loaded from `https://github.com/{username}.png`.

---

**LoadingState.tsx** (`apps/web/src/app/components/LoadingState.tsx`)

- Purpose: Skeleton loading UI components for various page states.
- Key functions: `TableLoadingState()` — animated skeleton rows matching the console table layout. `CardLoadingState()` — grid of skeleton cards. `PageLoadingState()` — full-screen spinner. `InlineLoadingState()` — small centered spinner.
- Dependencies: None (pure Tailwind)
- Called by: Most protected page clients during fetch

---

**PageHeader.tsx** (`apps/web/src/app/components/PageHeader.tsx`)

- Purpose: Reusable page header with title, optional description, and optional action button/link.
- Key functions: `PageHeader({ title, description, actionLabel, actionHref, onAction })`
- Dependencies: Next.js `Link`
- Called by: `ConsoleClient.tsx`, `ActivityClient.tsx`, `InfrastructureClient.tsx`, `UserClient.tsx`

---

**layout.tsx** (`apps/web/src/app/(pages)/(protected)/layout.tsx`)

- Purpose: Layout wrapper for all authenticated pages. Renders `Navbar` and grid background overlay.
- Dependencies: `Navbar`
- Called by: Next.js App Router for all routes under `(protected)/`

---

**page.tsx / auth/page.tsx** (`apps/web/src/app/(pages)/auth/page.tsx`)

- Purpose: Login page. GitHub OAuth initiation button linking to `{NEXT_PUBLIC_API_URL}/auth/github`. GitLab button shown but disabled. Email/password inputs shown but disabled.
- Key functions: `AuthPage()` — client component with mount guard. `ActivityPip()` — animated grid pips in the decorative dashboard preview panel.
- Dependencies: React, Next.js `Link`
- Called by: Next.js router at `/auth`
- Notes: `process.env.NEXT_PUBLIC_API_URL` used directly for OAuth redirect — must be set in `.env.local`.

---

**page.tsx / auth/success/page.tsx** (`apps/web/src/app/(pages)/auth/success/page.tsx`)

- Purpose: Receives JWT from callback redirect, stores in `localStorage`, animates status text, redirects to `/console`.
- Key functions: `AuthSuccessContent()` — reads `?token=` query param, sets `localStorage.hatch_token`, navigates after 1.5s. Wrapped in `Suspense` for `useSearchParams`.
- Dependencies: `useRouter`, `useSearchParams`
- Called by: API redirect from OAuth callback

---

**ConsoleClient.tsx** (`apps/web/src/app/(pages)/(protected)/console/ConsoleClient.tsx`)

- Purpose: Main dashboard. Project table with status, resources, branch, last updated. Stat cards (total/live/building/failed). Delete with confirm. 5-minute localStorage cache.
- Key functions: `ConsoleClient()` — fetches projects then fans out to fetch latest deployment per project (N+1). `ProjectRow()` — single project row with status indicator, live URL, delete button. `formatRelativeTime()` — human-readable timestamps. `EmptyState()` — first-deploy CTA.
- Dependencies: `LoadingState`, `PageHeader`, Next.js `Link`, `useRouter`
- Called by: `console/page.tsx`
- Notes: Projects cache includes deployment data — cache key `hatch_projects_cache`. Delete also invalidates cache. Status computed from `lastDeployment[0]` (latest deployment).

---

**console/page.tsx** (`apps/web/src/app/(pages)/(protected)/console/page.tsx`)

- Purpose: Server component wrapper that renders `ConsoleClient`.
- Dependencies: `ConsoleClient`
- Notes: No server-side data fetching — purely delegates to client component.

---

**NewProjectClient.tsx** (`apps/web/src/app/(pages)/(protected)/new/NewProjectClient.tsx`)

- Purpose: 2-step project creation wizard. Step 1: repo selection with search. Step 2: configure identity (name, subdomain), resources (cpu, memory, port, health check), build (root dir, branch), env vars. Right panel shows live service manifest. Deploys by creating project then deployment in sequence.
- Key functions: `NewProjectClient()` — main component. `handleSelectRepo()` — auto-fills port by language (Go=8080, Python=8000, else 80), triggers Dockerfile check, advances to step 2. `handleDeploy()` — POST /api/projects then POST /api/deployments, redirects to project detail. `debouncedCheck()` — debounced Dockerfile existence check (600ms). `parseBulkEnv()` — parses `.env` format text into key/value pairs, supports `#` comments and quoted values. `handleFileUpload()` — reads file for bulk env import. `validationErrors` — computed via `useMemo`.
- Dependencies: `lodash/debounce`, `LoadingState`, Next.js `useRouter`
- Called by: `new/page.tsx`
- Notes: CPU/memory pairings enforce Fargate's valid combinations (e.g., 256 vCPU only allows 512MB). Bug: sends `health_check_path` key in deploy request but API handler reads `health_check` — path is dropped.

---

**new/page.tsx** (`apps/web/src/app/(pages)/(protected)/new/page.tsx`)

- Purpose: Server component wrapper rendering `NewProjectClient`.

---

**ProjectClient.tsx** (`apps/web/src/app/(pages)/(protected)/projects/[id]/ProjectClient.tsx`)

- Purpose: Project detail page. Shows project info, deployment history list, WebSocket terminal for live log streaming. Re-deploy button triggers new deployment.
- Key functions: `ProjectDetail()` — loads project + deployments, connects WebSocket to `ws/deployments/{id}` on active deployment, streams logs into `LogLine[]` state, auto-scrolls. WebSocket sends `"READY"` handshake. Categorizes log lines as info/success/error/muted/system by content matching. Re-deploy creates new deployment via POST.
- Dependencies: `LoadingState`, Next.js `Link`, `useParams`, `useRouter`
- Called by: `projects/[id]/page.tsx`
- Notes: Uses `wsRef` and `activeIdRef` to avoid stale closure issues. WS URL derived from `NEXT_PUBLIC_API_URL` with `http(s)` replaced by `ws(s)`. 2-minute localStorage cache for project/deployment data.

---

**projects/[id]/page.tsx**

- Purpose: Server component wrapper for `ProjectClient`.

---

**DeploymentDetailClient.tsx** (`apps/web/src/app/(pages)/(protected)/projects/[id]/deployments/[deploymentId]/DeploymentDetailClient.tsx`)

- Purpose: Deployment detail view. Pipeline progress bar (Queued→Building→Deploying→Live). Spec cards (CPU, memory, port, health check, image URI, subdomain, duration). Live URL link. 5-minute localStorage cache.
- Key functions: `DeploymentDetailClient()` — fetches deployment, computes pipeline index from status, calculates duration. `getPipelineIndex()` — maps status string to 0-3 integer.
- Dependencies: `LoadingState`, Next.js `Link`, `useParams`
- Called by: `deployments/[deploymentId]/page.tsx`

---

**deployments/[deploymentId]/page.tsx**

- Purpose: Server component wrapper for `DeploymentDetailClient`.

---

**ProjectSettingsClient.tsx** (`apps/web/src/app/(pages)/(protected)/projects/[id]/settings/ProjectSettingsClient.tsx`)

- Purpose: Tabbed settings UI (general, build, compute, vars, danger zone). Loads project data. Save is a stub (no-op with 600ms artificial delay). Danger zone has project delete with name-confirmation input.
- Key functions: `ProjectSettingsClient()` — tab-based UI with 5 tabs. `handleSave()` — explicit stub, comment: "extend when PATCH /api/projects/:id is available". Delete: verifies typed name matches project name before calling DELETE.
- Dependencies: Next.js `useParams`, `useRouter`, `Link`
- Called by: `settings/page.tsx`
- Notes: Settings save does nothing. Only delete works end-to-end.

---

**settings/page.tsx**

- Purpose: Server component wrapper for `ProjectSettingsClient`.

---

**ActivityClient.tsx** (`apps/web/src/app/(pages)/(protected)/activity/ActivityClient.tsx`)

- Purpose: Activity event timeline. Fetches from `GET /api/activity`, renders events with type badge and timestamp. 2-minute localStorage cache.
- Dependencies: `PageHeader`, `LoadingState`, `useRouter`
- Called by: `activity/page.tsx`

---

**activity/page.tsx**

- Purpose: Server component wrapper for `ActivityClient`.

---

**InfrastructureClient.tsx** (`apps/web/src/app/(pages)/(protected)/infrastructure/InfrastructureClient.tsx`)

- Purpose: Infrastructure overview page. Fetches all projects then all their latest deployments. Shows resource utilization cards per deployment (CPU, memory, subdomain). 3-minute localStorage cache.
- Dependencies: `PageHeader`, `LoadingState`, `useRouter`
- Called by: `infrastructure/page.tsx`
- Notes: Also N+1 fetch pattern (same as console).

---

**infrastructure/page.tsx**

- Purpose: Server component wrapper for `InfrastructureClient`.

---

**UserClient.tsx** (`apps/web/src/app/(pages)/(protected)/u/[id]/UserClient.tsx`)

- Purpose: User profile page. Decodes JWT for user info, fetches project count, shows GitHub avatar, account details, joined date. Copy-to-clipboard for user ID and GitHub username.
- Dependencies: `PageHeader`, `LoadingState`, `useRouter`, `useParams`
- Called by: `u/[id]/page.tsx`
- Notes: Profile only shows current user's own data (JWT validated against URL param).

---

**u/[id]/page.tsx**

- Purpose: Server component wrapper for `UserClient`.

---

**docs/layout.tsx**

- Purpose: Layout for all documentation pages. Likely provides sidebar navigation and consistent docs styling.
- Called by: All pages under `/docs/`

---

**docs/quick-start/page.tsx**, **docs/configuration/page.tsx**, **docs/environment-variables/page.tsx**, **docs/self-hosting/page.tsx**, **docs/roadmap/page.tsx**, **docs/changelog/page.tsx**

- Purpose: Static documentation pages. Client components with copy-to-clipboard functionality via `CopyButton` component. No dynamic data fetching.
- Notes: All contain inline styled content. Quick-start has step-by-step setup walkthrough. Self-hosting covers Terraform provisioning. Roadmap and changelog are static lists.

---

**next.config.ts** (`apps/web/next.config.ts`)

- Purpose: Next.js config. Sets `output: "standalone"` for Docker deployment. Allows `cdn.simpleicons.org` as remote image pattern.

---

**package.json** (`apps/web/package.json`)

- Purpose: Node dependencies. Runtime: `next@16.2.2`, `react@19.2.4`, `react-dom@19.2.4`, `lodash@^4.18.1`, `nextjs-toploader@^3.9.17`. Dev: `tailwindcss@^4`, TypeScript, ESLint.

---

### Database Package (`packages/db`)

**sqlc.yaml** (`packages/db/sqlc.yaml`)

- Purpose: sqlc v2 config. PostgreSQL engine, queries from `./queries`, schema from `./migrations`, output to `./gen`, emit JSON tags and interface, no prepared queries.

---

**000001_init.up.sql** (`packages/db/migrations/000001_init.up.sql`)

- Purpose: Initial schema migration. Creates `users`, `projects`, `deployments`, `env_vars`, `activity_logs` tables with constraints, defaults, and indexes. Enables `pgcrypto` extension.
- Notes: No down migration file. `deployments.subdomain` is UNIQUE. `env_vars.value` default is empty string. `secret_arn` column exists in both `deployments` and `env_vars` but is unused.

---

**models.go** (`packages/db/gen/models.go`)

- Purpose: sqlc-generated Go structs for all 5 DB tables. `ActivityLog`, `Deployment`, `EnvVar`, `Project`, `User`.
- Notes: Nullable columns use `sql.NullString` / `sql.NullTime`. Auto-generated, do not edit.

---

**querier.go** (`packages/db/gen/querier.go`)

- Purpose: sqlc-generated `Querier` interface. 17 methods covering all CRUD operations across all tables.
- Notes: `var _ Querier = (*Queries)(nil)` — compile-time interface check.

---

**db.go** (`packages/db/gen/db.go`)

- Purpose: sqlc-generated base. Defines `DBTX` interface, `Queries` struct, `New(db DBTX)` constructor, `WithTx(tx)`.

---

**projects.sql.go** (`packages/db/gen/projects.sql.go`)

- Purpose: Generated implementations for CreateProject, GetProjectsByUserID, GetProjectByID, GetProjectByRepoURL, GetProjectBySubdomain, UpdateProjectWebhook, DeleteProject.

---

**deployments.sql.go** (`packages/db/gen/deployments.sql.go`)

- Purpose: Generated implementations for CreateDeployment, GetDeploymentByID, GetDeploymentsByProjectID, UpdateDeploymentStatus, UpdateDeploymentLive.

---

**users.sql.go** (`packages/db/gen/users.sql.go`)

- Purpose: Generated implementations for CreateUser (upsert), GetUserByGithubID, GetUserByID.

---

**activity.sql.go** (`packages/db/gen/activity.sql.go`)

- Purpose: Generated implementations for CreateActivityLog, GetActivityLogsByUserID (LIMIT 50, DESC).

---

**env_vars.sql.go** (`packages/db/gen/env_vars.sql.go`)

- Purpose: Generated implementations for CreateEnvVar, GetEnvVarsByDeployment.
- Notes: `CreateEnvVar` accepts `secret_arn` parameter — this method is never called by current code. Handlers use raw SQL insert that omits `secret_arn`.

---

**queries/projects.sql**, **queries/deployments.sql**, **queries/users.sql**, **queries/activity.sql**, **queries/env_vars.sql**

- Purpose: Source SQL query files for sqlc code generation. These are the inputs; `gen/` contains the outputs.

---

### Config Package (`packages/config`)

**config.go** (`packages/config/config.go`)

- Purpose: Loads env vars into `Config` struct for the API service. `mustGetEnv` fatals on missing required vars. `getEnv` provides defaults.
- Key functions: `Load() *Config`
- Dependencies: `godotenv`
- Called by: `apps/api/cmd/server/main.go`
- Notes: Only used by API. Builder and deployer implement their own inline env loading. `WebhookBaseURL` and `Environment` included here but not in builder/deployer.

---

**go.mod** (`packages/config/go.mod`)

- Purpose: Go module definition for config package. No external dependencies.

---

### Events Package (`packages/events`)

**events.go** (`packages/events/events.go`)

- Purpose: Defines `BuildJobEvent` and `DeployJobEvent` structs intended as canonical shared type definitions.
- Notes: **Unused by all services.** Each service re-defines these structs locally. This package is vestigial.

---

**go.mod** (`packages/events/go.mod`)

- Purpose: Go module definition. No dependencies.

---

### Infrastructure (`infra/`)

**infra/envs/dev/main.tf**

- Purpose: Terraform entry point for dev environment. Wires networking, ecs, alb, and ec2 modules. Configures S3 backend (hard-coded bucket + key). Outputs `hatch_server_ip` and `alb_dns_name`.
- Notes: Hard-coded ACM certificate ARN (`arn:aws:acm:ap-south-1:362041633362:...`) and S3 bucket name with account ID. Not parameterized.

---

**infra/envs/dev/variables.tf**

- Purpose: Variable definitions: `aws_region` (default ap-south-1), `project_name` (default hatch), `ecr_registry` (hard-coded registry URL). `ecr_registry` is defined but not used in any module.

---

**infra/modules/networking/main.tf**

- Purpose: VPC (10.0.0.0/16), Internet Gateway, 2 public subnets (ap-south-1a/1b, /24 each), route table with 0.0.0.0/0 via IGW, ALB security group (80/443 inbound open), ECS security group (all TCP from ALB SG only). Outputs: vpc_id, public_subnet_a/b, alb_sg_id, ecs_sg_id.

---

**infra/modules/ecs/main.tf**

- Purpose: ECS cluster (container insights disabled), IAM task execution role (`AmazonECSTaskExecutionRolePolicy` + `AmazonEC2ContainerRegistryReadOnly` + inline CloudWatch Logs policy). Outputs: cluster_arn, cluster_name, task_execution_role_arn.

---

**infra/modules/alb/main.tf**

- Purpose: Internet-facing ALB across 2 public subnets. HTTP listener (port 80) redirects to HTTPS. HTTPS listener (port 443, TLS 1.3 PQ policy, ACM cert) with default 404 fixed-response. API target group (port 8080, instance type, `/health` health check). Listener rule for `api.hatchcloud.xyz` → API TG (priority 10). Outputs: api_tg_arn, alb_arn, alb_dns_name, alb_listener_arn (HTTP), alb_https_listener_arn (HTTPS).
- Notes: Bug: `alb_listener_arn` output is the HTTP listener. Deployer needs the HTTPS listener ARN (`alb_https_listener_arn`) for host-header rules. README's setup instructions reference `alb_listener_arn` which would configure the wrong listener.

---

**infra/modules/ec2/main.tf**

- Purpose: Ubuntu 24.04 EC2 instance (`m7i-flex.large`), IAM role with `AmazonEC2ContainerRegistryPowerUser` (for builder ECR push), security group (SSH 0.0.0.0/0, port 8080 from ALB SG), user_data installs docker/golang/nodejs/npm/pm2, attached to ALB API target group. Outputs: public_ip.
- Notes: SSH open to world — documented caveat to restrict to IP. Uses latest Ubuntu Noble 24.04 AMI from Canonical. `m7i-flex.large` = 2 vCPU, 8GB RAM Intel Flex.

---

### Scripts (`scripts/`)

**internal_bench.js** (`scripts/internal_bench.js`)

- Purpose: k6 load test for GET /api/projects and GET /api/activity. Batched requests per iteration. Ramp: 0→50→100→0 VU over 50s. Thresholds: p95 < 50ms, error rate < 1%.
- Dependencies: k6 (external tool)
- Notes: Requires `HATCH_BASE_URL` and `HATCH_TOKEN` env vars. No actual recorded results in repo.

---

**orchestration_test.js** (`scripts/orchestration_test.js`)

- Purpose: k6 test for POST /api/deployments. 10 VU, 30s. Checks status 201/200 and presence of `id` in response. Placeholder `project_id` — not a real end-to-end test.
- Dependencies: k6
- Notes: Does not trigger real builds (placeholder project_id). Tests queue acceptance, not pipeline completion.

---

### Root-Level Files

**docker-compose.yaml**

- Purpose: Local dev infrastructure. Postgres 16 (host port 5433, not 5432 — avoids conflict with local installs), Redis 7 (6379), RabbitMQ 3 with management plugin (5672 + 15672). All with healthchecks and named volumes.
- Notes: All 3 services on a shared `hatch` bridge network. Postgres on 5433 locally but migration command in Makefile uses 5433 (correct). `.env.example` files use 5432 — mismatch.

---

**Makefile**

- Purpose: Dev shortcuts. `make dev`/`make infra` — `docker compose up -d postgres redis rabbitmq`. `make build` — `docker compose build`. `make up` — full `docker compose up`. `make down` — `docker compose down`. `make migrate` — runs golang-migrate against local Postgres on port 5433.

---

**go.work**

- Purpose: Go workspace file. Lists 6 modules: `apps/api`, `apps/builder`, `apps/deployer`, `packages/config`, `packages/db`, `packages/events`.
- Notes: Specifies `go 1.25.10` — Go 1.25 does not exist. Likely a typo for 1.23.x or 1.24.x.

---

**go.work.sum**

- Purpose: Workspace checksum database. Auto-generated.

---

**CONTRIBUTING.md**

- Purpose: Contribution guidelines — local setup, branch naming, commit style, PR process.

---

**SECURITY.md**

- Purpose: Security disclosure policy. Instructs reporters not to use public issues for vulnerabilities.

---

**README.md**

- Purpose: Full project documentation. Architecture diagram (ASCII), deployment flow, stack table, repo structure, getting started (prereqs, setup, env, infra), data model, log streaming and queue documentation, roadmap.

---

**.dockerignore**

- Purpose: Excludes node_modules, .git, .env files from Docker build context.

---

**.gitignore**

- Purpose: Standard Go + Node ignores plus .env files.

---

**.github/ISSUE_TEMPLATE/bug_report.yml**

- Purpose: GitHub issue template for bug reports with structured fields.

---

**.github/ISSUE_TEMPLATE/feature_request.yml**

- Purpose: GitHub issue template for feature requests.

---

**.github/PULL_REQUEST_TEMPLATE.md**

- Purpose: PR template with description, type-of-change checkboxes, testing notes.
