# Contributing to Hatch

Thanks for your interest in contributing! Hatch is a self-hosted deployment platform built on AWS — contributions of all kinds are welcome, from bug fixes and docs to new features.

Please read this before opening a PR.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Local Development](#local-development)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Commit Style](#commit-style)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)

---

## Getting Started

1. **Fork** the repository and clone your fork:

   ```bash
   git clone https://github.com/<your-username>/Hatch.git
   cd Hatch
   ```

2. Add the upstream remote so you can stay in sync:

   ```bash
   git remote add upstream https://github.com/YHQZ1/Hatch.git
   ```

3. Follow the [Local Development](#local-development) steps below to get everything running.

---

## Project Structure

Hatch is a monorepo with four independently deployable services:

```
apps/
  api/        Go + Gin — auth, REST, WebSocket hub
  builder/    Go — clones repos, runs docker build, pushes to ECR
  deployer/   Go — provisions ECS, ALB, Route53
  web/        Next.js 15 — frontend dashboard
packages/
  db/         sqlc-generated database layer + migrations
  events/     Canonical RabbitMQ message schemas
  config/     Env var loader, AWS config factory
infra/        Terraform — all AWS infrastructure
```

Changes to `packages/` affect all Go services — be careful and test each one.

---

## Local Development

### Prerequisites

- Go 1.23+
- Node.js 20+
- Docker + Docker Compose
- `golangci-lint` (for linting Go)
- AWS CLI (only needed if testing deployer/builder against real AWS)

### Setup

```bash
# Copy env files for each service
cp apps/api/.env.example apps/api/.env
cp apps/builder/.env.example apps/builder/.env
cp apps/deployer/.env.example apps/deployer/.env
cp apps/web/.env.example apps/web/.env.local

# Install frontend deps
cd apps/web && npm install && cd ../..

# Sync Go workspace
go work sync
```

### Running locally

```bash
# Start Postgres, Redis, RabbitMQ
make dev

# Run DB migrations
make migrate

# In separate terminals:
cd apps/api && go run cmd/server/main.go
cd apps/builder && go run cmd/worker/main.go
cd apps/deployer && go run cmd/worker/main.go
cd apps/web && npm run dev
```

Open http://localhost:3000.

### Running tests

```bash
make test
```

This runs `go test ./...` across all services and `tsc --noEmit` on the frontend.

---

## Making Changes

### Branch naming

Branch off `main` using one of these prefixes:

| Prefix      | When to use                         |
| ----------- | ----------------------------------- |
| `feat/`     | New feature                         |
| `fix/`      | Bug fix                             |
| `chore/`    | Tooling, deps, CI                   |
| `docs/`     | Documentation only                  |
| `refactor/` | Code change with no behavior change |

Example: `feat/pr-preview-environments`, `fix/websocket-reconnect`

### Before you push

```bash
make lint    # golangci-lint + ESLint
make test    # all Go tests + TS type check
```

Both must pass. The CI will reject PRs that don't.

### Adding a new Go dependency

```bash
cd apps/<service>
go get <package>
go mod tidy
cd ../..
go work sync
```

Commit the updated `go.mod`, `go.sum`, and `go.work.sum`.

### Database migrations

New migrations go in `packages/db/migrations/` and must be sequentially numbered:

```
003_add_rollbacks.sql
004_add_custom_domains.sql
```

Migrations are applied with `make migrate`. Never edit an existing migration — always add a new one.

### Terraform changes

Infrastructure changes in `infra/` should include a `terraform plan` output in the PR description so reviewers can see exactly what will change in AWS.

---

## Pull Request Process

1. **Open an issue first** for any non-trivial change (new features, significant refactors). This avoids duplicate work and lets us align before you invest the time.

2. **Keep PRs focused.** One logical change per PR. A PR that fixes a bug and also refactors unrelated code is harder to review and slower to merge.

3. **Fill out the PR template.** Describe what changed, why, and how to test it.

4. **Respond to review comments.** If you disagree with feedback, say so — that's fine. PRs go stale if comments sit unanswered.

5. **Squash-friendly commits.** We squash-merge PRs, so your commit history within the branch doesn't need to be perfect — but each PR should represent one coherent change.

---

## Commit Style

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`

Scopes (optional but helpful): `api`, `builder`, `deployer`, `web`, `infra`, `db`

Examples:

```
feat(api): add GitHub App installation support
fix(builder): handle Dockerfiles in subdirectories
docs: add PR preview environments to roadmap
chore(deps): bump aws-sdk-go-v2 to v1.32
```

---

## Reporting Bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml) template. The more context the better:

- What you expected vs what happened
- Steps to reproduce
- Your environment (OS, Go version, Docker version)
- Relevant logs (from the API, builder, or deployer service)

---

## Requesting Features

Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml) template. Describe the problem you're trying to solve, not just the solution — it helps find the best approach.

Check the [Roadmap](README.md#roadmap) first to see if it's already planned.

---

## Questions?

Open a [Discussion](https://github.com/YHQZ1/Hatch/discussions) — issues are for bugs and feature requests, discussions are for everything else.
