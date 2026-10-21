# Roadmap

Work proceeds in phases. A phase is done only when its acceptance criteria
pass, tests cover the new behaviour, and the docs match the code.

## Current status

_Update this section at the end of every working session._

| Field | Value |
| --- | --- |
| Current phase | 1, Simplify the core and build the local target |
| Branch | `phase1/pgx` (pull request to `main`) |
| Last done | Foundation finished: pgx driver with real-Postgres tests for every query group, structured logging with slog, and Hatch as one program (`serve`, `worker`, `migrate`). Before that: React + Vite UI embedded in the binary |
| Next | The landing page slice (the owner's choice), then sign-in (needs a GitHub App from the owner) |
| Blockers | None. No AWS access (by design until Phase 6) |

## Phase 0: Foundation

Goal: a clean, documented, checked starting point.

- [x] Commit the in-flight hardening work in logical commits.
- [x] Write vision, current state, architecture, guardrails, roadmap, and
  decision records.
- [x] Decide the repository structure
  ([ADR 0008](decisions/0008-repository-structure.md)).
- [x] Repository hygiene: fix `.dockerignore` so nested `.env` files stay out
  of build contexts; add `LICENSE`; remove false claims from `README.md`,
  `CONTRIBUTING.md`, and `SECURITY.md`; delete the unused `packages/events`;
  align Go versions across modules and Dockerfiles; add `.golangci.yml`,
  `.editorconfig`, and Dependabot.
- [x] Settle the open questions needed for Phase 1 (ADRs 0009–0013).
- [x] Merge the stabilization branch into `main` (PR #14); protect `main`
  with required CI checks.
- [x] Add GitHub Actions CI: golangci-lint, `go test -race`, web lint and
  build, on pushes to `main` and on every pull request.

Done when: CI is green on `main` and the docs are reviewed.

## Phase 1: Simplify the core and build the local target

Goal: the full flow works on a laptop with only Postgres running, from one
`hatch` binary that also serves the UI.

Work is a foundation, then slices by step of the user's journey. Each slice is
a pull request that changes API, UI, tests, and docs together and ends with
something that can be demonstrated on a laptop.

**Done**

- [x] Layout from [ADR 0008](decisions/0008-repository-structure.md): one root
  Go module, `cmd/hatch` + `internal/`, `web/`; `infra/` and the in-app docs
  pages removed.
- [x] React + Vite single-page app with React Router and TanStack Query,
  embedded in and served by the Go binary
  ([ADR 0009](decisions/0009-react-spa-served-by-go.md),
  [ADR 0016](decisions/0016-pnpm-for-the-web-app.md)).
- [x] One program: `hatch serve`, `hatch worker`, `hatch migrate`; one config
  loader that reports every missing variable at once; migrations embedded in
  the binary; tests against real Postgres (CI sets `HATCH_TEST_DATABASE_URL`).

**Foundation (no visible change)**

- [x] Structured logging with `log/slog`: JSON in production, request IDs, a
  request log in place of Gin's default
  ([ADR 0017](decisions/0017-structured-logging-with-slog.md)).
- [x] Use pgx as the Postgres driver (through `database/sql`), and test every
  query group against real Postgres
  ([ADR 0011](decisions/0011-river-and-pgx.md#sequencing-added-2026-10-21)).
  The native pgx pool and sqlc regenerated for `pgx/v5` come with River below.

**Slice: sign in**

- [ ] GitHub App for sign-in, repository access, and webhooks
  ([ADR 0010](decisions/0010-github-app.md)) and server-side sessions
  ([ADR 0013](decisions/0013-server-side-sessions.md)), replacing the OAuth App
  and JWT cookie. Needs a GitHub App created by the owner. Touches the auth
  pages, navbar, and sign-out.

**Slice: see and create a service**

- [ ] Console and new-service pages: repositories from the GitHub App
  installation, Dockerfile detection, creating a project.

**Slice: deploy and watch it**

- [ ] River jobs replace RabbitMQ, on a native pgx pool; sqlc is regenerated
  for `pgx/v5`; `Builder`, `Runtime`, and `CostEstimator` interfaces with a
  fake for tests ([ADR 0011](decisions/0011-river-and-pgx.md)).
- [ ] Local Docker provider (build, run, route `<app>.localhost` through
  Caddy, scale, destroy, runtime logs); the existing ECS/ALB code moves behind
  the `Runtime` interface unchanged.
- [ ] `deployment_logs`, `LISTEN/NOTIFY`, and server-sent events replace Redis
  and the WebSocket hub
  ([ADR 0012](decisions/0012-server-sent-events-for-logs.md)). Send deployment
  status changes as explicit events: the UI currently infers status from log
  text (for example any line containing `error:` marks a deployment failed and
  closes the stream), which a build can trigger by accident.
- [ ] Remove RabbitMQ and Redis from `docker-compose.yaml` and the config.

**Slice: operate it**

- [ ] Settings, environment variables, pause, resume, delete, and rollback on
  the local target.

Done when: on a clean machine, `make dev` starts Postgres and Hatch; a user can
sign in through the GitHub App, deploy a sample repo locally, watch logs
(including after a reconnect), cancel, redeploy, pause, resume, and delete;
restarting Hatch mid-build resumes or fails the job cleanly; tests cover the
job runner and providers with fakes and run against real Postgres.

## Phase 2: Connect an AWS account

Goal: a user can connect their AWS account safely.

- [ ] `hatch-connect` CloudFormation template (roles, VPC, cluster, ALB, ECR,
  CodeBuild project, log group, budget), validated with `cfn-lint`.
- [ ] Quick-create link with a per-connection ExternalId.
- [ ] STS AssumeRole with ExternalId; connection verification job; stack
  version check.
- [ ] `cloud_connections` table and connection UI (status, region, budget,
  errors).
- [ ] IAM policy for `hatch-control` scoped to `hatch-` resources and tags.

Done when: connection logic is covered by tests against faked STS and
CloudFormation clients; the template passes `cfn-lint`; the IAM policy has
been reviewed line by line.

## Phase 3: Build and run in the user's account

Goal: deploys on AWS happen entirely inside the user's account.

- [ ] CodeBuild `Builder`: start build with source and image overrides, stream
  logs, cancel. Short-lived source credentials only.
- [ ] ECS `Runtime` using assumed-role credentials and stack outputs instead of
  Hatch's own environment variables.
- [ ] Secrets Manager for secret env vars, referenced from task definitions.
- [ ] Resource inventory written for every created resource, with tags.
- [ ] Listener rule priority allocation without collisions.
- [ ] Rollback to any previous release without rebuilding.

Done when: the AWS providers pass the same provider test suite as the local
provider, using faked AWS clients; inventory is complete for every resource a
deploy creates.

## Phase 4: Cost guardrails

Goal: the guarantees in [Cost guardrails](04-cost-guardrails.md).

- [ ] Cost estimator and its UI.
- [ ] Spend cap tracking and enforcement.
- [ ] Idle detection and automatic pause.
- [ ] Expiry for projects.
- [ ] Orphan sweeper.
- [ ] Tear down everything, with a verification report.

Done when: the acceptance tests in the guardrails document pass.

## Phase 5: Product completeness

- [ ] Runtime log viewer.
- [ ] Zero-downtime deploys (new tasks healthy before old ones drain).
- [ ] Health-check configuration and clearer failure messages.
- [ ] Break up the 1,000+ line React components; consistent UI states.
- [ ] Custom domains with ACM certificates _(may move after v1)_.
- [ ] Review the landing page's claims (zero-downtime rollouts, automated TLS
  and DNS) against what exists, and replace the placeholder logo by
  overwriting `web/public/hatch.svg` (the old one was the Habr brand icon and
  was removed).

## Phase 6: Production readiness

- [ ] Verify end to end on a real AWS account with a hard spending limit and
  a teardown checklist (see [Testing without AWS](#testing-without-aws)).
- [ ] End-to-end test suite against the local provider in CI.
- [ ] Observability for Hatch itself: structured logs, metrics, job failure
  alerts.
- [ ] Security review: IAM policy, secrets flow, session handling, webhook
  verification.
- [ ] Rewrite the README to describe only what exists, with real screenshots.
- [ ] Decide and set up control-plane hosting.

## After v1

Planned, in priority order ([ADR 0015](decisions/0015-v1-runs-web-services-only.md)):

1. Background workers and cron jobs.
2. Suggest a Dockerfile when a repository has none.
3. Managed data services: SQS, then Postgres on RDS with strict guardrails,
   caches last.

Later: preview environments per pull request, Dockerfile-less builds, teams
and roles, more clouds.

## Testing without AWS

No AWS account is available, and none is needed until Phase 6.

1. **Interfaces and fakes.** Every AWS call goes through a small client
   interface (for example the subset of ECS calls Hatch uses). Unit tests use
   fakes that record calls and return scripted results, including errors and
   throttling.
2. **Shared provider test suite.** One set of behavioural tests (deploy,
   scale, destroy, cancel, retry after failure) runs against the fake, local,
   and AWS providers.
3. **Local provider as the real end-to-end path.** Everything except
   AWS-specific calls is exercised for real with Docker.
4. **Static checks for AWS artifacts.** `cfn-lint` for the CloudFormation
   template; manual review of IAM policies.
5. **Real AWS, later and capped.** In Phase 6, use an account with a hard
   spending limit (for example AWS's credit-based free plan, if available to
   the account) and run the teardown checklist after every session. Never
   leave a test deployment running.

## Working rules

- Small, focused commits; each one builds and passes tests.
- No command or test may create real cloud resources unless the task
  explicitly says so and a teardown step is included.
- Update [Current status](#current-status) and any affected docs in the same
  change as the code.
