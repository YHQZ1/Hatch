# Roadmap

Work proceeds in phases. A phase is done only when its acceptance criteria
pass, tests cover the new behaviour, and the docs match the code.

## Current status

_Update this section at the end of every working session._

| Field | Value |
| --- | --- |
| Current phase | 2, Connect an AWS account (Phase 1 is done apart from one run on a machine that has never run Hatch) |
| Branch | `main` (the sign-in branch is merged, PR #41) |
| Last done | Real-AWS testing is allowed before Phase 6, in the maintainer's capped account, with conditions (ADR 0023); the rules in `CLAUDE.md` and these docs now say so. Nothing has been run against AWS yet. Before that, the Overview's "Get started" checklist follows the journey in the vision doc: sign in with GitHub, install the Hatch App, connect your AWS account, deploy your first service. The AWS step (to the AWS page of Settings) is optional: it is offered with its own button, does not count towards the progress, and does not keep the list open, since nothing needs it until deploys to AWS exist; it is listed only where the server can connect an account, and it says that deploys to AWS arrive in the next phase and projects run on local Docker until then. Before that, seeing the connection page's failed state for real showed a raw STS error (a request id and `InvalidClientTokenId`) for a problem only the operator can fix, Hatch's own AWS credentials being invalid. A credential error is now reported as that, in words that say it is not the user's to fix, apart from a wrong role or ExternalId (`AccessDenied`), which is. Before that, the `hatch-control` policy is reviewed line by line (`docs/08-iam-policy-review.md`) and rewritten: creates must carry the `hatch:managed` tag, changes and deletes only apply to resources that carry it, grants nothing calls are gone, reads are scoped where IAM allows, and `DeregisterTaskDefinition` (which IAM cannot scope) and the task-definition tagging it could not have done without are fixed. A second reader and a run against a real account are still to come. Before that, the connection page is built, in the AWS section of Settings: a form that says the account's fixed cost before anything is created, the two steps to finish in the user's own AWS console (open the link, paste the role ARN), the check's result in the server's own words with what to do about it, and a summary once connected, including a warning when apps are served over plain HTTP; the top bar's AWS chip and the Overview's AWS panel now read the real connection (and say nothing until it has loaded), and the server tells the page whether connecting is set up at all (`aws_connections` in `GET /api/config`). The landing page lists connecting an AWS account as being built, and no longer says it is one click. Before that, the `verify_connection` job is built: giving a role (or `POST /api/connections/:id/verify`) queues a check that assumes the role, reads the stack and records `connected` with what the stack reported or `error` with a message the user can act on; one check per connection and role at a time, a result about a replaced role is dropped by the update itself (checked by removing that guard and watching the test fail), and a check interrupted by shutdown runs again. A server with no AWS credentials of its own records that instead of failing to start. Before that, the `cloud_connections` table (migration 000016) and its API are built: `POST /api/connections` records a pending connection with its own ExternalId and returns the quick-create link, `GET` lists or reads them, `PUT .../role` saves the role ARN, `DELETE` forgets one, all scoped to the signed-in user (another user's is "not found"); the ExternalId is in the link and nowhere else in a response; two new settings, `HATCH_AWS_PRINCIPAL_ARN` and `HATCH_CONNECT_TEMPLATE_URL`, switch it on and must be set together. Before that, Phase 2's Go side has started: the `internal/cloud/aws` package builds the quick-create link and an ExternalId, and verifies a connection (assume the role, read the stack, check it finished, has every output and names the same role, and say whether its template is current) behind `STS` and `Stacks` interfaces with a fake that refuses a wrong ExternalId; the SDK versions are thin and untried. Tests read the template, so a renamed output or parameter, or a template version raised on one side only, fails the build. Credentials print as a placeholder. The open question of where the template is published (CloudFormation reads it only from S3) is decided in ADR 0022: a public bucket, versioned path, address a setting. Before that, Phase 2 has started. Two open questions are decided (ADRs 0020 and 0021: the connection role trusts a configured principal, so a hosted Hatch and a self-hosted one use the same code; the certificate and domain are optional, so an app without them is served over HTTP with a warning), and the `hatch-connect` template is written and linted, in CI as well. Before that, Phase 1's flow is walked through by hand on a laptop, against a private test repository (`YHQZ1/hatch-walkthrough`, a tiny nginx app with a `slow-build` branch whose Dockerfile sleeps for 90 seconds): a push deploys it through the webhook, a build can be canceled, redeploy, rollback runs the kept image with nothing built, suspend and resume, and deleting the project leaves no deployment, log, container or image of it behind. The walkthrough found one bug, now fixed with a test: stopping Hatch part-way through a build recorded the deployment as failed for good (`docker build failed: exit status 130`) instead of running it again on the next start, because a job's context is only canceled after the grace period while the docker child is signalled at once (by the terminal, or by `make dev`'s stop-dev). `jobs.Run` now flags shutdown as soon as it begins and the build is handed back to River; the docker child also runs in its own process group. Before that, the App webhook is tried against GitHub itself: through a smee.io relay, a real ping answered 200 (the signature check passes with the App's secret), and a real push to a project's branch queued one deployment with that commit's id and message, which went live (smee drops its connection now and then and does not replay what it missed, so a missed delivery is redelivered from the App's Recent Deliveries). Before that, old logs are pruned: a daily job (and one at start-up) deletes the log lines of finished deployments 30 days after they were created, except that each project's newest five keep theirs, and a deployment that is still running is never touched; the deployment stays and its page says no log was kept (`internal/jobs/prune_logs.go`, ADR 0012). Before that, Shorter addresses, and the Insights page is gone. A project is named in its address by the name it is served under (`/projects/portfolio`, `/projects/portfolio/settings`), which cannot change once it exists, and falls back to its id only for the rare project without one; a deployment has a page of its own named by the first eight characters of its id (`/deployments/430b592c`) and no longer lives under its project, since it knows which one it belongs to. `GET /api/deployments/:id` takes either a whole UUID or eight or more hex digits of one, looked up as a range over the primary key among the signed-in user's own deployments only, and answers 409 ("use more of the id") if the digits fit two. Every address is built in one module (`web/src/lib/paths.ts`); older addresses (a project's id, a deployment's whole id, `/projects/:project/deployments/:id`) still work and are replaced in the address bar by the short ones. The Insights page (about 1,400 lines, not in the navigation, still in the old style) is deleted along with the `PageTitle`, `MetricCard` and `StatusText` components only it used; `/insights` and `/infrastructure` go to the Overview. Before that, The single Deployment page is rebuilt in the style of the Project page and shares its pieces: the project's icon, name and repository, the same summary block (status and how long it took, commit, branch, what it ran with, why it failed), the full log (live while it runs, from the log stream) and a Details panel (id with copy, started, finished, how long it took, the commit on GitHub, the image and whether it is still kept, cloud resources only where there are any), with Roll back, Cancel and Visit where they apply and links to the deployments either side. The AWS-only rows (ECS service, target group, task) no longer show on the local target, the pipeline panel that inferred "done" and "wait" from the status is gone, and cancelling no longer appends its own log line (the server writes it). Before that, The rest of Phase 1's checklist. Live logs: lines are stored in Postgres (`deployment_logs`, numbered per deployment, capped) and streamed to the browser as server-sent events (`GET /api/deployments/:id/logs/stream`, resumable from `Last-Event-ID`, with explicit `status` and `end` events so the page no longer guesses a deployment's status from words in the log); Redis and the WebSocket hub are gone, and GitHub's Dockerfile check keeps its answers in memory. Rollback: a release that went live and still has its image can be run again as a new deployment (its image, settings and environment, nothing built), from the Project page or the Deployments page; images are kept for the newest five releases of a project, and a deploy that fails for good no longer leaves its image behind. Pushes: the GitHub App's own webhook replaces per-project hooks and their stored secrets (migration 000015), and creating a project, changing its branch and deploying read the repository as the App, saying "install the App" up front, while the user's own token stays the check on who may use a repository. Before that, Project settings is rebuilt as one page of sections that each save on their own (General, Source, Build and run, Environment variables, Runtime, Delete project), with a list of links that follows the scroll on wide screens. Save and Discard appear only on a section with changes; saving what a deployment reads when it starts (branch, build settings, variables) offers "Deploy now". Environment variable values are hidden until shown, and pasting KEY=value lines adds them as rows. The page no longer repeats the status, branch and project details three times, drops the side panel, and no longer says "ECS" or "AWS" in its suspend and delete text. Three behaviours changed underneath it: the health check path is now stored on the project (migration 000013, backfilled from each project's latest deployment) and can be edited, instead of living only on deployments; redeploying from the Overview, the Project page, the settings page or a push now uses the project's current branch, port and health check (the buttons used to copy the last deployment's, so a settings change did not reach them); and a project's name is the name it was given, not its address, everywhere it is shown. Suspend and Resume now refresh the project's own page. The settings page is titled Project Settings and, on wide screens, has the title, Back and the list of sections in a fixed left column with the content column scrolling the full height beside them (the "Saved. Deploy now" banner stays pinned at its top), and the list highlights each section in turn as you read (a marker line that moves down the column as you scroll, so the short sections at the end are reached too; a section you click stays marked until you scroll yourself). The signed-in pages' `overflow-x-hidden` wrapper had been turning the page into its own scroll container, which stopped every `position: sticky` (this list, and the Deploy panel on New project) from sticking, so it is now `overflow-x-clip`. Before that, The Project page is rebuilt in the style of the Overview and Deployments pages: the project's icon, name, repository and address with a copy button at the top, then one block for the deployment you are looking at (status with how long it took, commit, branch, age, what it ran with, and the reason when it failed; Visit and Cancel where they apply), then the log and the list of every deployment side by side. Choosing a deployment shows its log and details. The log numbers its lines instead of stamping each with the time the page loaded (which was the time it was opened, not when the line was written), follows new lines only while you are at the end, and scrolls inside its own box rather than moving the page. The stat strip, the Quick actions panel and the Current deployment panel are gone (they repeated the header and the new block); the page now says so when a project does not exist. The page was one 940-line file; it is now a short page plus `routes/project/`, with a `StatusLine` and a `toServiceRow` shared with the Overview and Deployments pages. Before that, The New project page is redone: the same 24px heading as the other pages, a bar at the top to paste a GitHub address (`github.com/owner/repo`, `owner/repo` or a `git@` address, with or without a branch path or `.git`), and under it the repositories the Hatch App can see (newest activity first, a search, an account switch when the App is on more than one account, "Show more", and a link to change what Hatch can access). Choosing one opens the settings: the project name set large at the top with its address editable beneath it (checked with the server as you type, since addresses are unique across all accounts: `GET /api/subdomains/:name` says free, taken or reserved), the repository with whether a Dockerfile was found, then Build (branch, Dockerfile folder), Run (port, taken from the Dockerfile's `EXPOSE` unless edited, and health check path) and environment variables, and beside them a Deploy checklist showing what is done and what is missing. Pasting KEY=value lines into a variable name box adds them as rows, and a `.env` import now merges instead of replacing. A warning shows when the repository was pasted and the App cannot see it. The page is split into `routes/newProject/` (one 1,100-line file before) with tests for the address parsing and the form checks. Before that, the Activity page is gone: its events were the same data as the Overview's Recent activity panel, and only four kinds are recorded (project created, settings updated, deletion queued, suspend or resume queued), with deployments living on their own page. The panel's "View all" now opens the rest in place (up to the 50 events the server returns), `/activity` redirects to `/overview`, and the nav is Overview, Deployments, Cost, Resources, Settings. A full activity page comes back with the cost guardrails (Phase 4), whose automatic actions (idle pauses, cap reached, sweeps) will need an audit trail. Before that, a new Deployments page, after Vercel's: a 14-day chart of deployments per day (succeeded, failed, canceled, in progress) with the count, the success rate and the median build time, then one aligned line per deployment, newest first: the project (with its icon), the commit message, the status with its duration (Ready, Building, Failed, Canceled), a Current or Replaced pill, the commit id, the branch and the age, plus a menu (View logs, Open project, Visit, Cancel while it runs). Search, a project filter and a status filter are kept in the address; on a phone each line becomes three. Before that, one page for projects: the Projects page is gone and the Overview is where projects are listed and managed. It gained the sort (recent activity, name, traffic, failed first), delete in each project's menu, and a strip of each project's latest deployments on its card (each mark opens that deployment); `/projects` and `/services` redirect to `/overview`, and the nav has no Projects tab. Before that, projects in the UI: a deployable repository is now called a project everywhere users read it (the API and database already did), with `/projects` as the list (`/services` redirects), and a project's icon is the favicon its running site declares, fetched by `GET /api/projects/:id/icon` (from the app itself only; Hatch's mark when there is none). The Overview was redesigned after Vercel's dashboard: search, grid or list and "New project" across the top, projects on the right, and Right now, Traffic, Recent activity and the AWS panel in a column on the left, all in Inter with sentence-case labels. Before that, a new Overview: search and status filters (kept in the address, `/` focuses the search), a grid or list of services, a "Right now" panel for builds in progress (stage, elapsed time, newest log line, Cancel), a per-service menu (visit, redeploy, suspend or resume, logs, settings), and a Traffic panel with a sparkline per service, fed by request counts from the built-in proxy (`GET /api/traffic`, last hour, in memory). `GET /api/deployments/:id/logs` takes `?tail=N`. Before that, the local target: `HATCH_TARGET=local` (the default) builds with the host's Docker, runs each app as a container (new version beside the old, health-checked, then swapped), and serves it at `http://<name>.localhost:8081` through a reverse proxy built into `hatch serve` (ADR 0018, which also records Caddy as a later step); pause, resume and delete work; no AWS settings are needed. Tested with real containers (opt-in `HATCH_TEST_DOCKER=1`). Before that, River replaces RabbitMQ: jobs (build, deploy, destroy_app, scale) live in Postgres and are queued in the same transaction as the change that causes them; the driver is a native pgx pool and sqlc generates for `pgx/v5`; `Builder`, `Runtime` and `CostEstimator` interfaces with fakes sit under the jobs, with the Docker/ECR builder and the ECS deployer behind them; RabbitMQ is gone from the code, compose and config. Before that, seven top-bar tabs (Overview, Services, Deployments, Activity, Cost, Resources, Settings; the bar scrolls on small screens) and no logo in the bar. Deployments is a real page, a filterable feed of every build and release across all services. Cost and Resources are deliberately empty pages until the AWS phase. Before that, placeholders for the AWS phase so the console reads as a whole: an AWS status chip in the top bar, "Estimated cost" and "AWS account" cards on Overview, AWS and Guardrails sections in Settings, and an estimated-cost row on the new-service page, all plain text driven by `useAwsConnection()` in `web/src/lib/aws.ts`. Before that, stable loading and theme switching: `<html>` carries the theme (the toggle no longer leaves the canvas and scrollbars on the old theme), the last-seen data is kept per tab so a reload paints real content at once, and placeholders hold the stats strip and setup checklist so nothing jumps (reload layout shift 0.123 to 0). Before that, one Settings page at `/settings` (formerly the account page at `/u/<username>`, which redirects) with Account, GitHub and This browser sections; the GitHub section shows where the App is installed. Before that, console information architecture: a top bar (Overview, Services, Settings), a new Overview page at `/overview` (formerly `/console`, which redirects; stats, needs-attention list, service cards, recent activity, and a short setup checklist that disappears once done), the services table moved to `/services`, and the console edges matched to the landing page. Insights and Activity no longer have nav links (Activity is a module on Overview; Insights waits for the per-service Metrics tab). Before that, installation tokens: builds clone with a short-lived, read-only token for one repository, minted from the App's private key. Before that, the console redesign (new navbar and shell, the services page, every console page on the design tokens, light and dark). Before that, repository access, backend: GitHub token refresh (single-use refresh tokens, serialized per user), repository listing through the App's installations, and an install prompt on the new-service page. Before that, the auth success page (an opening hatch) and the sign-in page redesign. Before that, sign-in: GitHub App sign-in and server-side sessions (nothing pushed). Before that, landing page rewritten: Render-style positioning, cost guardrails, Available / In development / Planned badges, a light purple accent, scroll effects, a light theme with a circular switch, and eased scrolling (Lenis, landing only). Before that, foundation finished: pgx driver with real-Postgres tests for every query group, structured logging with slog, and Hatch as one program (`serve`, `worker`, `migrate`). Before that: React + Vite UI embedded in the binary |
| Next | A first real run of Phase 2 in the maintainer's account: publish the template to a bucket they own (a release step does not exist yet), create the stack from the quick-create link, check that `verify_connection` connects, then delete the stack and confirm nothing is left. Also a second person reading the IAM review and the connection page being looked at in a browser. Then Phase 3, building and running in the connected account: the AWS runtime must tag everything it creates `hatch:managed=true`, which the policy now requires. Left over from Phase 1: the same walkthrough on a machine that has never run Hatch (sign-in included), which this laptop cannot show |
| Blockers | None. An AWS account is available for capped testing ([0023](decisions/0023-real-aws-testing-starts-before-phase-6.md)); the maintainer still has to confirm its billing state and set a budget alert before anything is created |

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

- [x] `hatch-connect` CloudFormation template (roles, VPC, cluster, ALB, ECR,
  CodeBuild project, log group, budget), validated with `cfn-lint`
  (`deploy/cloudformation/hatch-connect.yaml`, linted in CI). It has never been
  created in a real account yet (see ADR 0023). Its build project is a placeholder
  buildspec until Phase 3 settles how CodeBuild gets the source, and its budget
  watches the whole account, not just Hatch's resources.
- [x] Quick-create link with a per-connection ExternalId. Each connection stores
  its own ExternalId and `POST /api/connections` returns the link
  (`internal/cloud/aws`: `QuickCreateURL`, `NewExternalID`). Nothing publishes
  the template to the bucket the link points at yet (ADR 0022), a release step
  still to add before Phase 6.
- [x] STS AssumeRole with ExternalId; connection verification job; stack
  version check. The `verify_connection` job assumes the role, reads the stack
  and records the result (`aws.Connector.Verify`, behind `STS` and `Stacks`
  interfaces), tested against an in-memory fake and real Postgres, including a
  wrong ExternalId, an unfinished stack, a role replaced mid-check and a check
  interrupted by shutdown. The SDK versions have never run against AWS.
- [x] `cloud_connections` table and connection UI (status, region, budget,
  errors). The table and the API that starts, reads, updates, checks and removes
  a connection are built and tested against real Postgres (migration 000016,
  `/api/connections`). The page is the AWS section of Settings: a form (region, a
  monthly limit, an email, an optional certificate) that states the account's
  fixed cost before anything is created, then the steps to create the stack in
  the user's console and give Hatch the role, the check's result with what to fix,
  and, once connected, the account, whether apps are served over HTTP or HTTPS,
  the budget alert and whether the stack's template is current. It is tested by
  rendering each stage and by the checks on its input; it has not been looked at
  in a browser, and nothing has connected a real account.
- [x] IAM policy for `hatch-control` scoped to `hatch-` resources and tags, and
  reviewed line by line ([08-iam-policy-review.md](08-iam-policy-review.md)): each
  statement against the code that calls it and against AWS's own reference for
  what each action supports. It found and fixed five problems (a statement that
  would have granted nothing, a task definition that could not have been
  registered, a tag condition the docs promised and the policy lacked, grants
  nothing used, and reads that could be scoped). It was reviewed by the coding
  assistant alone and has not been run against AWS; the review lists the five
  facts to confirm yourself, and a real-account run (ADR 0023) is what tests the policy.

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

The maintainer has an AWS account, and capped real-AWS testing may start before
Phase 6 ([0023](decisions/0023-real-aws-testing-starts-before-phase-6.md)). The
default tests and CI still need no account, and steps 1 to 4 below still hold.

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
5. **Real AWS, capped.** Use the maintainer's account with a budget alert set
   first, run the teardown checklist after every session, and never leave a test
   stack or deployment running (the ALB bills by the hour). The maintainer
   creates and deletes resources; see ADR 0023 for the conditions. Phase 6 runs
   the full flow at the end.

## Working rules

- Small, focused commits; each one builds and passes tests.
- No command or test may create real cloud resources unless the task
  explicitly says so and a teardown step is included, and an agent never creates
  them itself (ADR 0023).
- Update [Current status](#current-status) and any affected docs in the same
  change as the code.
