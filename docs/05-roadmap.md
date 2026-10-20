# Roadmap

Work proceeds in phases. A phase is done only when its acceptance criteria
pass, tests cover the new behaviour, and the docs match the code.

## Current status

_Update this section at the end of every working session._

| Field | Value |
| --- | --- |
| Current phase | 0, Foundation |
| Branch | `stabilize/in-flight-hardening` (not merged, not pushed) |
| Last done | Repository structure decided (ADR 0008); Phase 0 hygiene done: `.dockerignore`, LICENSE, Go 1.26.4 everywhere, Node 24, golangci-lint, CI, Dependabot, README/CONTRIBUTING/SECURITY rewritten |
| Next | Push and merge the branch into `main` so CI runs; discuss flow and tech stack; settle [open questions](06-open-questions.md) needed for Phase 1 |
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
- [ ] Settle the open questions marked "needed for Phase 1."
- [ ] Merge the stabilization branch into `main`.
- [x] Add GitHub Actions CI: golangci-lint, `go test -race`, web lint and
  build, on pushes to `main` and on every pull request.

Done when: CI is green on `main` and the docs are reviewed.

## Phase 1: Simplify the core and build the local target

Goal: the full flow works on a laptop with only Postgres running.

- [ ] Move to the layout in
  [ADR 0008](decisions/0008-repository-structure.md): one root Go module,
  `cmd/hatch` + `internal/`, `apps/web` → `web/`. File moves and import
  rewrites go in their own commits, separate from behaviour changes.
- [ ] Merge the API, builder, and deployer into one Go program
  (`hatch serve`, `hatch worker`, `hatch migrate`).
- [ ] After the move: remove `infra/` (hosted-model Terraform) and the in-app
  docs pages under `web/src/app/docs` along with the landing-page links to
  them; move `components/` and `lib/` out of `src/app/` and drop the `(pages)`
  route group.
- [ ] Replace RabbitMQ with a Postgres job queue; jobs are idempotent and
  resumable.
- [ ] Replace Redis log fan-out with `deployment_logs` + `LISTEN/NOTIFY`;
  replace the GitHub cache with a Postgres table or in-process cache.
- [ ] Define `Builder`, `Runtime`, and `CostEstimator` interfaces with a fake
  implementation for tests.
- [ ] Implement the local Docker provider (build, run, route `<app>.localhost`
  through a reverse proxy, scale, destroy, runtime logs).
- [ ] Move the existing ECS/ALB code behind the `Runtime` interface without
  changing its behaviour yet.
- [ ] Remove RabbitMQ and Redis from `docker-compose.yaml` and the config.

Done when: on a clean machine, `make dev` starts Postgres and Hatch; a user can
log in, deploy a sample repo locally, watch logs, cancel, redeploy, pause,
resume, and delete; restarting Hatch mid-build resumes or fails the job
cleanly; tests cover the job runner and providers with fakes.

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

Preview environments per pull request, Dockerfile-less builds, teams and roles,
more clouds, managed add-ons.

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
