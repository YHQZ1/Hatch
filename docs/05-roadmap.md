# Roadmap

Work proceeds in phases. A phase is done only when its acceptance criteria
pass, tests cover the new behaviour, and the docs match the code.

## Current status

_Update this section at the end of every working session._

| Field | Value |
| --- | --- |
| Current phase | 1, Simplify the core and build the local target |
| Branch | `feat/sign-in`, stacked on `feat/landing-page` (nothing pushed) |
| Last done | The local target: `HATCH_TARGET=local` (the default) builds with the host's Docker, runs each app as a container (new version beside the old, health-checked, then swapped), and serves it at `http://<name>.localhost:8081` through a reverse proxy built into `hatch serve` (ADR 0018, which also records Caddy as a later step); pause, resume and delete work; no AWS settings are needed. Tested with real containers (opt-in `HATCH_TEST_DOCKER=1`). Before that, River replaces RabbitMQ: jobs (build, deploy, destroy_app, scale) live in Postgres and are queued in the same transaction as the change that causes them; the driver is a native pgx pool and sqlc generates for `pgx/v5`; `Builder`, `Runtime` and `CostEstimator` interfaces with fakes sit under the jobs, with the Docker/ECR builder and the ECS deployer behind them; RabbitMQ is gone from the code, compose and config. Before that, seven top-bar tabs (Overview, Services, Deployments, Activity, Cost, Resources, Settings; the bar scrolls on small screens) and no logo in the bar. Deployments is a real page, a filterable feed of every build and release across all services. Cost and Resources are deliberately empty pages until the AWS phase. Before that, placeholders for the AWS phase so the console reads as a whole: an AWS status chip in the top bar, "Estimated cost" and "AWS account" cards on Overview, AWS and Guardrails sections in Settings, and an estimated-cost row on the new-service page, all plain text driven by `useAwsConnection()` in `web/src/lib/aws.ts`. Before that, stable loading and theme switching: `<html>` carries the theme (the toggle no longer leaves the canvas and scrollbars on the old theme), the last-seen data is kept per tab so a reload paints real content at once, and placeholders hold the stats strip and setup checklist so nothing jumps (reload layout shift 0.123 to 0). Before that, one Settings page at `/settings` (formerly the account page at `/u/<username>`, which redirects) with Account, GitHub and This browser sections; the GitHub section shows where the App is installed. Before that, console information architecture: a top bar (Overview, Services, Settings), a new Overview page at `/overview` (formerly `/console`, which redirects; stats, needs-attention list, service cards, recent activity, and a short setup checklist that disappears once done), the services table moved to `/services`, and the console edges matched to the landing page. Insights and Activity no longer have nav links (Activity is a module on Overview; Insights waits for the per-service Metrics tab). Before that, installation tokens: builds clone with a short-lived, read-only token for one repository, minted from the App's private key. Before that, the console redesign (new navbar and shell, the services page, every console page on the design tokens, light and dark). Before that, repository access, backend: GitHub token refresh (single-use refresh tokens, serialized per user), repository listing through the App's installations, and an install prompt on the new-service page. Before that, the auth success page (an opening hatch) and the sign-in page redesign. Before that, sign-in: GitHub App sign-in and server-side sessions (nothing pushed). Before that, landing page rewritten: Render-style positioning, cost guardrails, Available / In development / Planned badges, a light purple accent, scroll effects, a light theme with a circular switch, and eased scrolling (Lenis, landing only). Before that, foundation finished: pgx driver with real-Postgres tests for every query group, structured logging with slog, and Hatch as one program (`serve`, `worker`, `migrate`). Before that: React + Vite UI embedded in the binary |
| Next | Try a real deployment from the console (sign in, install the GitHub App on a repository with a Dockerfile, deploy). Then `deployment_logs` with `LISTEN/NOTIFY` and server-sent events in place of Redis. Iterate on the console with the owner (service page tabs, services view). The App's own webhook in place of per-project webhooks (needs a public URL). Build the Cost and Resources pages (empty today) once an AWS connection exists |
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

- [x] Sign-in with a GitHub App ([ADR 0010](decisions/0010-github-app.md)) and
  server-side sessions ([ADR 0013](decisions/0013-server-side-sessions.md)),
  replacing the OAuth App and JWT cookie; a new sign-in page that shows why a
  sign-in failed and what comes next. Setup is in
  [07-github-app-setup.md](07-github-app-setup.md).
- [x] Refresh the GitHub App user token (it expires after 8 hours), list
  repositories through the App's installations, and send users to install the
  App ([ADR 0010](decisions/0010-github-app.md#as-built-repository-access-2026-10-22)).
- [x] Installation tokens for cloning: builds read one repository with a
  short-lived, read-only token minted from the App's private key, and no longer
  touch the user's token.
- [ ] Still to do for repository access: replace per-project webhooks (and
  their stored secret) with the App's own webhook, which needs a public URL.

**Slice: see and create a service**

- [x] Console restyled: new shell and navbar, the services page, and all other
  console pages on the design tokens, in both themes.
- [ ] New-service flow end to end on installation tokens: repositories from the
  GitHub App installation (listing is done), Dockerfile detection, creating a
  project without a per-project webhook.

**Slice: deploy and watch it**

- [x] River jobs replace RabbitMQ, on a native pgx pool; sqlc is regenerated
  for `pgx/v5`; `Builder`, `Runtime`, and `CostEstimator` interfaces with a
  fake for tests ([ADR 0011](decisions/0011-river-and-pgx.md#as-built-added-2026-10-22)).
  Tested against real Postgres, including a build interrupted by shutdown that
  resumes on the next start.
- [x] Local Docker provider: build (`build/docker`, local mode), run
  (`runtime/docker`), route `<app>.localhost` through the built-in proxy
  (`internal/proxy`, [ADR 0018](decisions/0018-built-in-proxy-for-the-local-target.md)),
  scale, and destroy. Known limits: an environment value with a line break is
  refused (Docker's env-file format cannot carry it); resuming an app does not
  wait for it to answer; the Insights page has no data for local deployments;
  reading an app's own logs waits for the runtime log viewer (Phase 5).
- [ ] `deployment_logs`, `LISTEN/NOTIFY`, and server-sent events replace Redis
  and the WebSocket hub
  ([ADR 0012](decisions/0012-server-sent-events-for-logs.md)). Send deployment
  status changes as explicit events: the UI currently infers status from log
  text (for example any line containing `error:` marks a deployment failed and
  closes the stream), which a build can trigger by accident.
- [ ] Remove Redis from `docker-compose.yaml` and the config (RabbitMQ is
  already gone). `stream.Redis` is the only thing left using it, behind the
  `stream.Sink` interface.

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
- [x] Review the landing page's claims against what exists (done in the
  landing page rewrite; every feature carries a status badge).
- [ ] Replace the placeholder logo by overwriting `web/public/hatch.svg` (the
  old one was the Habr brand icon and was removed).
- [ ] Keep the landing page's badges in step with this roadmap as features
  land.

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

Later: Caddy in front of the local target or at the control plane's edge, for
HTTPS and custom domains ([ADR 0018](decisions/0018-built-in-proxy-for-the-local-target.md));
preview environments per pull request, Dockerfile-less builds, teams
and roles, more clouds, and documented, supported self-hosting (Hatch is
hosted-first; anyone can run the code, but it is not a supported path yet).

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
