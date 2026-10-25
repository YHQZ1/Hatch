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
- Targets: `HATCH_TARGET=local` (the default) builds and runs apps with the
  host's Docker (`build/docker` in local mode, `runtime/docker`) and serves them
  through the built-in proxy in `internal/proxy` (ADR 0018); `aws` is the old
  path. Pick the providers in `cmd/hatch/run.go` only; nothing else may know the
  target. Anything that drives the `docker` CLI validates names against a DNS
  label first and passes secrets by `--env-file`, never as arguments.
- Jobs: background work is a River job in `internal/jobs`, queued with
  `InsertTx` in the same transaction as the change that causes it, and worked
  against the `build.Builder` and `runtime.Runtime` interfaces, never against
  Docker or AWS directly. A job records a failure it cannot recover from on the
  deployment or project and returns `river.JobCancel`; it returns a plain error
  only when Hatch is stopping, so the job runs again on the next start. Test
  jobs against real Postgres with the fakes in `build/fake` and `runtime/fake`.
- Database: queries use pgx (`*pgxpool.Pool`, `pgx.Tx`); nullable columns are
  `*string`, `*time.Time`, `*int64`. Add a new migration in `internal/store/migrations/` named
  `NNNNNN_short_description.up.sql`, continuing the numbering; never edit a
  merged migration. After changing migrations or `internal/store/queries/`,
  run `cd internal/store && sqlc generate` and commit the generated code.
- Logging: use `log/slog` with attributes (`slog.Error("failed to X",
  "project_id", id, "error", err)`), not `log.Printf`. In request handlers use
  the Context variants with `c.Request.Context()` so the request ID is
  attached. Never log secrets, tokens, or query strings.
- Never commit `.env` files or credentials.
- Web (`web/`): load server data with TanStack Query (definitions in
  `src/lib/queries.ts`; a 401 signs the user out centrally); the React hook
  lint rules are errors, so fix the code rather than disabling them. Links
  built from data the server or a build produced go through `safeHttpUrl`.
  The UI makes no third-party requests (the CSP in `internal/api/spa` forbids
  them), so bundle fonts and icons. Deployed-app addresses come from
  `GET /api/config`, never from build-time variables.
- Web wording: a deployable repository is a **project** in everything users read
  (the database and API already say so); do not bring back "service" in
  user-facing copy. A project's icon comes from `GET /api/projects/:id/icon`,
  which fetches the favicon from the running app itself and never from an
  address the page names; the UI falls back to the Hatch logo,
  `public/hatch.svg`, drawn by `components/Logo`, which is also what every other
  logo on the site uses. Never hardcode the logo or use an `<img>` for it: it is
  drawn inline so its two colours follow the theme (see `.hatch-logo` in
  `styles.css`).
- Web styling: colours are design tokens (`text-ink`, `text-muted`, `bg-base`,
  `border-line`, `text-accent`; see `styles.css`), never fixed grays or hex
  values, so both themes work. `base` is a *colour* token, so `text-base` sets
  the text colour to the page background: use `text-[1rem]` for 16px type.
- Web theme: it lives on `<html>` (`data-theme` and `color-scheme`), set before
  first paint by `public/theme-init.js` and kept in step by `useTheme`. Do not
  put `data-theme` on a page wrapper: the canvas, scrollbars and the circular
  switch are drawn from `<html>`.
- Web data: the last-seen queries (not env vars) are kept in session storage so
  a reload paints real data at once (`lib/queryPersistence.ts`). Bump its
  version key when a persisted response changes shape. Give anything that
  arrives after the first paint a placeholder of the same size, so the page
  does not jump.
- Web placeholders: a part of the UI that depends on an unbuilt phase (AWS,
  cost, guardrails) shows a plain placeholder that says what will appear and
  when. No invented numbers, no buttons that do nothing, no "in development"
  badges, and no claim that is not true today. They read their state from one
  place (`lib/aws.ts`) so the phase that builds the feature replaces them.
- Web package manager is pnpm (pinned to 10.x, see ADR 0016); do not add an
  npm or yarn lockfile.

## Commands

```bash
make infra                      # Postgres via Docker Compose
make dev                        # infra + hatch serve + Vite dev server
make migrate                    # apply migrations (hatch migrate, embedded in the binary)
go run ./cmd/hatch help         # serve, worker, migrate, version
make build                      # bin/hatch, version stamped from git

make web                        # build the web UI into web/dist (embedded by go build)
HATCH_TEST_DOCKER=1 go test ./internal/runtime/docker ./internal/build/docker   # opt-in: builds and runs real containers (needs Docker; pulls busybox)
make check                      # golangci-lint, ESLint, go test -race, web tests
pipx run cfn-lint deploy/cloudformation/hatch-connect.yaml   # the AWS connection template; CI runs it
cd web && pnpm lint && pnpm build   # web checks (pnpm, version pinned in package.json)
```

Configuration for every command is read from `.env` in the repository root
(see `.env.example`). Tests that need Postgres are skipped unless
`HATCH_TEST_DATABASE_URL` is set to a Postgres URL whose role may create
databases (each test makes and drops its own), for example
`postgres://hatch:hatch@localhost:5433/postgres?sslmode=disable` with
`make infra` running; CI always sets it.

Update this section when Phase 1 changes the layout.
