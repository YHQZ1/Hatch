# Hatch: guidance for coding agents

Hatch is being rebuilt from a hosted Render-style platform into a tool that
deploys apps into the **user's own AWS account**, with cost guardrails built
in. The current code is the old hosted prototype.

## Before changing code

Read, in order:

1. `docs/05-roadmap.md`: **Current status** section (where work stands) and
   the active phase's checklist.
2. `docs/03-architecture.md`: the target design.
3. `docs/06-open-questions.md`: do not implement around an open question the
   current task depends on; ask instead.
4. `docs/decisions/`: why things are the way they are.
5. `docs/02-current-state.md`: what the existing code does and its known
   problems.

## Hard rules

- **No AWS access exists, and none is needed until Phase 6.** Never run
  commands, scripts, or tests that create real cloud resources. All AWS code
  goes behind interfaces and is tested with fakes.
- **Every cloud resource Hatch creates must be recorded in the resource
  inventory and tagged** (`hatch:managed=true`). See ADR 0007.
- **User code never runs on the control plane** in the AWS provider. See
  ADR 0005.
- **Docs describe reality.** Never document a planned feature as existing.
  The README must only claim what the code does.
- When a decision changes, add a record in `docs/decisions/` and update the
  affected docs in the same change.
- Update `docs/05-roadmap.md` › Current status at the end of each session.

## Working conventions

- Small, focused commits; each builds and passes tests. Explain *why* in the
  message body when it is not obvious.
- Prefer extending existing patterns over adding new dependencies; new
  dependencies need a reason in the commit message or a decision record.
- Keep error messages user-readable; never leak tokens or secrets into logs or
  API responses.
- Go: `gofmt`, `go vet`, table-driven tests. Web: ESLint clean, no new
  1,000-line components.
- Dependencies: one Go module at the root; run `go mod tidy` after adding
  one.
- Database: add a new migration in `internal/store/migrations/` named
  `NNNNNN_short_description.up.sql`, continuing the numbering; never edit a
  merged migration. After changing migrations or `internal/store/queries/`,
  run `cd internal/store && sqlc generate` and commit the generated code.
- Never commit `.env` files or credentials.
- Web (`web/`): load server data with TanStack Query (definitions in
  `src/lib/queries.ts`; a 401 signs the user out centrally); the React hook
  lint rules are errors, so fix the code rather than disabling them. Links
  built from data the server or a build produced go through `safeHttpUrl`.
  The UI makes no third-party requests (the CSP in `internal/api/spa` forbids
  them), so bundle fonts and icons. Deployed-app addresses come from
  `GET /api/config`, never from build-time variables.
- Web package manager is pnpm (pinned to 10.x, see ADR 0016); do not add an
  npm or yarn lockfile.

## Commands

```bash
make infra                      # Postgres, Redis, RabbitMQ via Docker Compose
make dev                        # infra + hatch serve + Vite dev server
make migrate                    # apply migrations (hatch migrate, embedded in the binary)
go run ./cmd/hatch help         # serve, worker, migrate, version
make build                      # bin/hatch, version stamped from git

make web                        # build the web UI into web/dist (embedded by go build)
make check                      # golangci-lint, ESLint, go test -race, web tests
cd web && pnpm lint && pnpm build   # web checks (pnpm, version pinned in package.json)
```

Configuration for every command is read from `.env` in the repository root
(see `.env.example`). Tests that need Postgres are skipped unless
`HATCH_TEST_DATABASE_URL` is set to a Postgres URL whose role may create
databases (each test makes and drops its own), for example
`postgres://hatch:hatch@localhost:5433/postgres?sslmode=disable` with
`make infra` running; CI always sets it.

Update this section when Phase 1 changes the layout.
