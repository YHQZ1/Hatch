# Roadmap

Work proceeds in phases. A phase is done only when its acceptance criteria
pass, tests cover the new behaviour, and the docs match the code.

## Current status

_Update this section at the end of every working session._

| Field | Value |
| --- | --- |
| Current phase | 1, Simplify the core and build the local target |
| Branch | `main` (the sign-in branch is merged, PR #41) |
| Last done | The App webhook is tried against GitHub itself: through a smee.io relay, a real ping answered 200 (the signature check passes with the App's secret), and a real push to a project's branch queued one deployment with that commit's id and message, which went live (smee drops its connection now and then and does not replay what it missed, so a missed delivery is redelivered from the App's Recent Deliveries). Before that, old logs are pruned: a daily job (and one at start-up) deletes the log lines of finished deployments 30 days after they were created, except that each project's newest five keep theirs, and a deployment that is still running is never touched; the deployment stays and its page says no log was kept (`internal/jobs/prune_logs.go`, ADR 0012). Before that, Shorter addresses, and the Insights page is gone. A project is named in its address by the name it is served under (`/projects/portfolio`, `/projects/portfolio/settings`), which cannot change once it exists, and falls back to its id only for the rare project without one; a deployment has a page of its own named by the first eight characters of its id (`/deployments/430b592c`) and no longer lives under its project, since it knows which one it belongs to. `GET /api/deployments/:id` takes either a whole UUID or eight or more hex digits of one, looked up as a range over the primary key among the signed-in user's own deployments only, and answers 409 ("use more of the id") if the digits fit two. Every address is built in one module (`web/src/lib/paths.ts`); older addresses (a project's id, a deployment's whole id, `/projects/:project/deployments/:id`) still work and are replaced in the address bar by the short ones. The Insights page (about 1,400 lines, not in the navigation, still in the old style) is deleted along with the `PageTitle`, `MetricCard` and `StatusText` components only it used; `/insights` and `/infrastructure` go to the Overview. Before that, The single Deployment page is rebuilt in the style of the Project page and shares its pieces: the project's icon, name and repository, the same summary block (status and how long it took, commit, branch, what it ran with, why it failed), the full log (live while it runs, from the log stream) and a Details panel (id with copy, started, finished, how long it took, the commit on GitHub, the image and whether it is still kept, cloud resources only where there are any), with Roll back, Cancel and Visit where they apply and links to the deployments either side. The AWS-only rows (ECS service, target group, task) no longer show on the local target, the pipeline panel that inferred "done" and "wait" from the status is gone, and cancelling no longer appends its own log line (the server writes it). Before that, The rest of Phase 1's checklist. Live logs: lines are stored in Postgres (`deployment_logs`, numbered per deployment, capped) and streamed to the browser as server-sent events (`GET /api/deployments/:id/logs/stream`, resumable from `Last-Event-ID`, with explicit `status` and `end` events so the page no longer guesses a deployment's status from words in the log); Redis and the WebSocket hub are gone, and GitHub's Dockerfile check keeps its answers in memory. Rollback: a release that went live and still has its image can be run again as a new deployment (its image, settings and environment, nothing built), from the Project page or the Deployments page; images are kept for the newest five releases of a project, and a deploy that fails for good no longer leaves its image behind. Pushes: the GitHub App's own webhook replaces per-project hooks and their stored secrets (migration 000015), and creating a project, changing its branch and deploying read the repository as the App, saying "install the App" up front, while the user's own token stays the check on who may use a repository. Before that, Project settings is rebuilt as one page of sections that each save on their own (General, Source, Build and run, Environment variables, Runtime, Delete project), with a list of links that follows the scroll on wide screens. Save and Discard appear only on a section with changes; saving what a deployment reads when it starts (branch, build settings, variables) offers "Deploy now". Environment variable values are hidden until shown, and pasting KEY=value lines adds them as rows. The page no longer repeats the status, branch and project details three times, drops the side panel, and no longer says "ECS" or "AWS" in its suspend and delete text. Three behaviours changed underneath it: the health check path is now stored on the project (migration 000013, backfilled from each project's latest deployment) and can be edited, instead of living only on deployments; redeploying from the Overview, the Project page, the settings page or a push now uses the project's current branch, port and health check (the buttons used to copy the last deployment's, so a settings change did not reach them); and a project's name is the name it was given, not its address, everywhere it is shown. Suspend and Resume now refresh the project's own page. The settings page is titled Project Settings and, on wide screens, has the title, Back and the list of sections in a fixed left column with the content column scrolling the full height beside them (the "Saved. Deploy now" banner stays pinned at its top), and the list highlights each section in turn as you read (a marker line that moves down the column as you scroll, so the short sections at the end are reached too; a section you click stays marked until you scroll yourself). The signed-in pages' `overflow-x-hidden` wrapper had been turning the page into its own scroll container, which stopped every `position: sticky` (this list, and the Deploy panel on New project) from sticking, so it is now `overflow-x-clip`. Before that, The Project page is rebuilt in the style of the Overview and Deployments pages: the project's icon, name, repository and address with a copy button at the top, then one block for the deployment you are looking at (status with how long it took, commit, branch, age, what it ran with, and the reason when it failed; Visit and Cancel where they apply), then the log and the list of every deployment side by side. Choosing a deployment shows its log and details. The log numbers its lines instead of stamping each with the time the page loaded (which was the time it was opened, not when the line was written), follows new lines only while you are at the end, and scrolls inside its own box rather than moving the page. The stat strip, the Quick actions panel and the Current deployment panel are gone (they repeated the header and the new block); the page now says so when a project does not exist. The page was one 940-line file; it is now a short page plus `routes/project/`, with a `StatusLine` and a `toServiceRow` shared with the Overview and Deployments pages. Before that, The New project page is redone: the same 24px heading as the other pages, a bar at the top to paste a GitHub address (`github.com/owner/repo`, `owner/repo` or a `git@` address, with or without a branch path or `.git`), and under it the repositories the Hatch App can see (newest activity first, a search, an account switch when the App is on more than one account, "Show more", and a link to change what Hatch can access). Choosing one opens the settings: the project name set large at the top with its address editable beneath it (checked with the server as you type, since addresses are unique across all accounts: `GET /api/subdomains/:name` says free, taken or reserved), the repository with whether a Dockerfile was found, then Build (branch, Dockerfile folder), Run (port, taken from the Dockerfile's `EXPOSE` unless edited, and health check path) and environment variables, and beside them a Deploy checklist showing what is done and what is missing. Pasting KEY=value lines into a variable name box adds them as rows, and a `.env` import now merges instead of replacing. A warning shows when the repository was pasted and the App cannot see it. The page is split into `routes/newProject/` (one 1,100-line file before) with tests for the address parsing and the form checks. Before that, the Activity page is gone: its events were the same data as the Overview's Recent activity panel, and only four kinds are recorded (project created, settings updated, deletion queued, suspend or resume queued), with deployments living on their own page. The panel's "View all" now opens the rest in place (up to the 50 events the server returns), `/activity` redirects to `/overview`, and the nav is Overview, Deployments, Cost, Resources, Settings. A full activity page comes back with the cost guardrails (Phase 4), whose automatic actions (idle pauses, cap reached, sweeps) will need an audit trail. Before that, a new Deployments page, after Vercel's: a 14-day chart of deployments per day (succeeded, failed, canceled, in progress) with the count, the success rate and the median build time, then one aligned line per deployment, newest first: the project (with its icon), the commit message, the status with its duration (Ready, Building, Failed, Canceled), a Current or Replaced pill, the commit id, the branch and the age, plus a menu (View logs, Open project, Visit, Cancel while it runs). Search, a project filter and a status filter are kept in the address; on a phone each line becomes three. Before that, one page for projects: the Projects page is gone and the Overview is where projects are listed and managed. It gained the sort (recent activity, name, traffic, failed first), delete in each project's menu, and a strip of each project's latest deployments on its card (each mark opens that deployment); `/projects` and `/services` redirect to `/overview`, and the nav has no Projects tab. Before that, projects in the UI: a deployable repository is now called a project everywhere users read it (the API and database already did), with `/projects` as the list (`/services` redirects), and a project's icon is the favicon its running site declares, fetched by `GET /api/projects/:id/icon` (from the app itself only; Hatch's mark when there is none). The Overview was redesigned after Vercel's dashboard: search, grid or list and "New project" across the top, projects on the right, and Right now, Traffic, Recent activity and the AWS panel in a column on the left, all in Inter with sentence-case labels. Before that, a new Overview: search and status filters (kept in the address, `/` focuses the search), a grid or list of services, a "Right now" panel for builds in progress (stage, elapsed time, newest log line, Cancel), a per-service menu (visit, redeploy, suspend or resume, logs, settings), and a Traffic panel with a sparkline per service, fed by request counts from the built-in proxy (`GET /api/traffic`, last hour, in memory). `GET /api/deployments/:id/logs` takes `?tail=N`. Before that, the local target: `HATCH_TARGET=local` (the default) builds with the host's Docker, runs each app as a container (new version beside the old, health-checked, then swapped), and serves it at `http://<name>.localhost:8081` through a reverse proxy built into `hatch serve` (ADR 0018, which also records Caddy as a later step); pause, resume and delete work; no AWS settings are needed. Tested with real containers (opt-in `HATCH_TEST_DOCKER=1`). Before that, River replaces RabbitMQ: jobs (build, deploy, destroy_app, scale) live in Postgres and are queued in the same transaction as the change that causes them; the driver is a native pgx pool and sqlc generates for `pgx/v5`; `Builder`, `Runtime` and `CostEstimator` interfaces with fakes sit under the jobs, with the Docker/ECR builder and the ECS deployer behind them; RabbitMQ is gone from the code, compose and config. Before that, seven top-bar tabs (Overview, Services, Deployments, Activity, Cost, Resources, Settings; the bar scrolls on small screens) and no logo in the bar. Deployments is a real page, a filterable feed of every build and release across all services. Cost and Resources are deliberately empty pages until the AWS phase. Before that, placeholders for the AWS phase so the console reads as a whole: an AWS status chip in the top bar, "Estimated cost" and "AWS account" cards on Overview, AWS and Guardrails sections in Settings, and an estimated-cost row on the new-service page, all plain text driven by `useAwsConnection()` in `web/src/lib/aws.ts`. Before that, stable loading and theme switching: `<html>` carries the theme (the toggle no longer leaves the canvas and scrollbars on the old theme), the last-seen data is kept per tab so a reload paints real content at once, and placeholders hold the stats strip and setup checklist so nothing jumps (reload layout shift 0.123 to 0). Before that, one Settings page at `/settings` (formerly the account page at `/u/<username>`, which redirects) with Account, GitHub and This browser sections; the GitHub section shows where the App is installed. Before that, console information architecture: a top bar (Overview, Services, Settings), a new Overview page at `/overview` (formerly `/console`, which redirects; stats, needs-attention list, service cards, recent activity, and a short setup checklist that disappears once done), the services table moved to `/services`, and the console edges matched to the landing page. Insights and Activity no longer have nav links (Activity is a module on Overview; Insights waits for the per-service Metrics tab). Before that, installation tokens: builds clone with a short-lived, read-only token for one repository, minted from the App's private key. Before that, the console redesign (new navbar and shell, the services page, every console page on the design tokens, light and dark). Before that, repository access, backend: GitHub token refresh (single-use refresh tokens, serialized per user), repository listing through the App's installations, and an install prompt on the new-service page. Before that, the auth success page (an opening hatch) and the sign-in page redesign. Before that, sign-in: GitHub App sign-in and server-side sessions (nothing pushed). Before that, landing page rewritten: Render-style positioning, cost guardrails, Available / In development / Planned badges, a light purple accent, scroll effects, a light theme with a circular switch, and eased scrolling (Lenis, landing only). Before that, foundation finished: pgx driver with real-Postgres tests for every query group, structured logging with slog, and Hatch as one program (`serve`, `worker`, `migrate`). Before that: React + Vite UI embedded in the binary |
| Next | Conclude Phase 1: every page is defined (Overview, Deployments, Project, Project Settings, Deployment, New project; Cost and Resources are placeholders until the AWS phase). Left over: a run of Phase 1's "Done when" list on a clean machine. Then Phase 2, connecting an AWS account |
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
- [x] Per-project webhooks and their stored secret are replaced by the App's
  own webhook: one endpoint, one secret (`GITHUB_WEBHOOK_SECRET`), signature
  checked first, redeliveries ignored, one push deploys every project of the
  repository that follows the branch. It needs a public URL to receive pushes;
  tried against GitHub itself through a smee.io relay (a ping and a push).

**Slice: see and create a service**

- [x] Console restyled: new shell and navbar, the services page, and all other
  console pages on the design tokens, in both themes.
- [x] New-service flow on the GitHub App: repositories from the installation,
  and creating a project without a webhook. Creating a project, changing its
  branch or folder, and deploying read the repository with an installation token
  and say "install the App on owner/repo" up front. The signed-in user's own
  token still decides who may use a repository (an installation token reads every
  repository the App is on) and still does the Dockerfile check on the New
  project page.

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
  wait for it to answer;
  reading an app's own logs waits for the runtime log viewer (Phase 5).
- [x] `deployment_logs`, `LISTEN/NOTIFY`, and server-sent events replace Redis
  and the WebSocket hub
  ([ADR 0012](decisions/0012-server-sent-events-for-logs.md)). Send deployment
  status changes as explicit events: the UI currently infers status from log
  text (for example any line containing `error:` marks a deployment failed and
  closes the stream), which a build can trigger by accident.
- [x] Remove Redis from `docker-compose.yaml` and the config (RabbitMQ is
  already gone). `stream.Redis` is the only thing left using it, behind the
  `stream.Sink` interface.

**Slice: operate it**

- [x] Settings, environment variables, pause, resume, delete, and rollback on
  the local target ([0019](decisions/0019-rollback-runs-a-kept-image-again.md)).

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
