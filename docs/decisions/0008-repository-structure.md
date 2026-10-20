# 0008. Repository structure: one Go module, `cmd/` + `internal/`, `web/`

- Status: Accepted
- Date: 2026-10-21

## Context

The repository is laid out for the old design: four services under `apps/`,
shared code under `packages/`, and Terraform for the hosted control plane
under `infra/`. With the move to one Go program (0002) and deploying into the
user's account (0001), that layout no longer fits:

- Seven Go modules (`apps/api`, `apps/builder`, `apps/deployer`, and four under
  `packages/`) are joined twice over, by `go.work` and by `replace` directives,
  and declare different Go versions (1.23 and 1.25.10; Dockerfiles use 1.26.4).
- `packages/events` is imported by nothing; the builder and deployer each keep
  their own copy of the job types.
- `infra/` provisions the hosted model (EC2 build host, Amazon MQ,
  ElastiCache, three environments). None of it applies once users bring their
  own account; the user-side resources come from a CloudFormation template.
- The web app keeps `components/` and `lib/` inside `src/app/` (which Next.js
  treats as routes), wraps every route in a `(pages)` group that does nothing,
  and ships 11 in-app docs pages that describe the old hosted design (hosted
  URLs, four services, RabbitMQ and Redis, Terraform self-hosting).

## Decision

Adopt the standard Go layout with a single module at the repository root and
the web app in `web/`:

```text
hatch/
├── cmd/hatch/                  main.go: serve | worker | migrate
├── internal/
│   ├── api/                    HTTP handlers, middleware, auth, sessions
│   ├── stream/                 deployment log streaming to WebSocket clients
│   ├── jobs/                   job types, queue, runner, retries
│   ├── build/                  Builder interface; docker/, codebuild/, fake/
│   ├── runtime/                Runtime interface; docker/, ecs/, fake/
│   ├── cloud/aws/              STS assume-role, connection checks
│   ├── cost/                   estimates and spend tracking
│   ├── inventory/              resource inventory and teardown
│   ├── github/                 OAuth or GitHub App, repos, webhooks
│   ├── secrets/                encryption at rest
│   ├── config/                 environment configuration
│   └── store/                  sqlc code, queries, embedded migrations
├── web/                        Next.js app
│   └── src/{app,components,lib}
├── deploy/cloudformation/      hatch-connect.yaml (added in Phase 2)
├── docs/
├── .github/workflows/          CI
├── go.mod  go.sum              one module; no go.work
├── Dockerfile                  the hatch binary (web/ keeps its own)
├── docker-compose.yaml
├── Makefile  .golangci.yml  .editorconfig
└── README.md  LICENSE  CONTRIBUTING.md  SECURITY.md  CLAUDE.md
```

Mapping from the current layout:

| Current | Target |
| --- | --- |
| `apps/api/cmd/server`, `apps/builder/cmd/worker`, `apps/deployer/cmd/worker` | `cmd/hatch` (one binary, subcommands) |
| `apps/api/internal/{handlers,middleware,auth}` | `internal/api` (GitHub client code split into `internal/github`) |
| `apps/api/internal/ws` | `internal/stream` |
| `apps/api/internal/db` | `internal/store` |
| `apps/*/internal/queue`, `packages/events` | `internal/jobs` (the RabbitMQ code is replaced, not moved) |
| `apps/builder/internal/{docker,git,logs}` | `internal/build/docker` |
| `apps/deployer/internal/ecs` | `internal/runtime/ecs` |
| `apps/deployer/internal/logs` | `internal/stream` / `internal/jobs` |
| `packages/config`, `packages/secrets` | `internal/config`, `internal/secrets` |
| `packages/db/{gen,queries,migrations}` | `internal/store` (migrations embedded so `hatch migrate` needs no extra tool) |
| `apps/web` | `web/` |
| `apps/web/src/app/{components,lib}` | `web/src/{components,lib}` |
| `apps/web/src/app/(pages)/…` | `web/src/app/…` (group removed) |
| `apps/web/src/app/docs/*` | removed; product docs live in `docs/` until the product is stable |
| `infra/` | removed (kept in git history) |
| `go.work`, `go.work.sum`, 7 × `go.mod` | one root `go.mod` |

### Sequencing

Small, safe hygiene happens now (Phase 0) on the current layout. The move
happens once, at the start of Phase 1, so files are not moved twice:

1. **Phase 0 hygiene:** fix `.dockerignore` so nested `.env` files stay out of
   build contexts; add `LICENSE`; remove false claims from `README.md`,
   `CONTRIBUTING.md`, and `SECURITY.md`; delete `packages/events`; align Go
   versions; add CI, `.golangci.yml`, `.editorconfig`, and Dependabot.
2. **Phase 1 move:** pure file moves and import rewrites in their own commits,
   separate from behaviour changes, so history and review stay clear. Then
   remove `infra/` and the in-app docs pages (with the landing-page links to
   them), and restructure `web/src`.

## Consequences

- One `go build ./...` and `go test ./...` from the root covers all Go code;
  no workspace or `replace` bookkeeping; one Go version.
- `internal/` stops other modules from importing Hatch packages, which is the
  intent: Hatch is a program, not a library.
- Package boundaries from 0002 are visible in the tree, so splitting a module
  into its own service later stays possible.
- Removing `infra/` means there is no infrastructure-as-code for hosting the
  control plane itself. Installs are expected to run the Docker image or
  binary; packaging for that is Phase 6 work.
- Removing the in-app docs pages leaves the web app without user-facing help
  until docs are rewritten against real behaviour.
