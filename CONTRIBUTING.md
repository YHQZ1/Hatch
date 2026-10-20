# Contributing to Hatch

Thanks for your interest. Hatch is in the middle of a rebuild (see the
[roadmap](docs/05-roadmap.md)), so the code and layout change quickly. Before
starting anything larger than a small fix, open an issue to discuss it, so
your work lines up with the plan.

## Before you start

Read these first:

1. [Roadmap](docs/05-roadmap.md): the current phase and its checklist.
2. [Architecture](docs/03-architecture.md): the design being built.
3. [Decision records](docs/decisions/README.md): why things are the way they
   are.
4. [Open questions](docs/06-open-questions.md): avoid building around a
   question that is still open; ask instead.

## Setup

Follow [Running locally](README.md#running-locally) in the README. To run the
checks you also need
[`golangci-lint`](https://golangci-lint.run/welcome/install/) v2, and
[`sqlc`](https://docs.sqlc.dev/en/latest/overview/install.html) if you change
database queries.

## Checks

```bash
make check                   # golangci-lint, ESLint, and go test -race for every module
cd apps/web && npm run build # web production build
make fmt                     # gofmt every Go module
```

CI runs the same checks on every pull request, and they must pass.

## Making changes

- **Branch from `main`.** Use a short descriptive name, for example
  `fix/webhook-retry` or `docs/connect-flow`.
- **Keep commits small and focused.** Each commit should build and pass the
  checks. Write the subject in the imperative ("Add spend cap check"), and use
  the body to explain *why* when it is not obvious.
- **Keep docs true.** Docs and the README describe only what the code does.
  Update them in the same change as the code. When a design decision changes,
  add a record in [`docs/decisions/`](docs/decisions/README.md).
- **Dependencies.** Each Go app and package is its own module. Add a
  dependency in the module that imports it and run `go mod tidy` there. Say why
  a new dependency is needed in the commit message.
- **Database changes.** Add a new migration in `packages/db/migrations/`
  named `NNNNNN_short_description.up.sql`, continuing the numbering. Never edit
  a migration that has been merged. After changing a migration or a query in
  `packages/db/queries/`, regenerate the Go code with `cd packages/db && sqlc
  generate` and commit the result.
- **Cloud safety.** Never run or add tests that create real cloud resources.
  AWS code sits behind interfaces and is tested with fakes. Every cloud
  resource Hatch creates must be tagged and recorded (see
  [ADR 0007](docs/decisions/0007-cost-guardrails-are-core-scope.md)).
- **Secrets.** Never commit `.env` files or credentials, and never write tokens
  or secrets to logs or API responses.

## Pull requests

Describe what changed, why, and how you tested it. Keep each pull request to
one logical change; unrelated fixes are easier to review separately.

## Reporting bugs

Open an issue with what you expected, what happened, steps to reproduce, and
relevant logs with secrets removed. Report security issues privately as
described in [SECURITY.md](SECURITY.md).
