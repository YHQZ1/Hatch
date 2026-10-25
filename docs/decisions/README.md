# Decision Records

Each record explains one significant decision: the context, what was decided,
and the consequences. Add a new numbered file when a decision is made or
reversed; do not rewrite history in old records, mark them superseded instead.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-deploy-into-user-cloud-account.md) | Deploy into the user's own cloud account | Accepted |
| [0002](0002-single-go-program.md) | One Go program with clear internal modules | Accepted |
| [0003](0003-postgres-for-jobs-and-logs.md) | Postgres for jobs and log streaming | Accepted |
| [0004](0004-pluggable-providers-local-first.md) | Pluggable build and runtime providers, local Docker first | Accepted |
| [0005](0005-codebuild-for-aws-builds.md) | AWS builds run in CodeBuild in the user's account | Accepted |
| [0006](0006-secrets-manager-for-app-secrets.md) | App secrets live in AWS Secrets Manager | Accepted |
| [0007](0007-cost-guardrails-are-core-scope.md) | Cost guardrails are core product scope | Accepted |
| [0008](0008-repository-structure.md) | Repository structure: one Go module, `cmd/` + `internal/`, `web/` | Accepted |
| [0009](0009-react-spa-served-by-go.md) | Web UI: a React single-page app served by the Go binary | Accepted |
| [0010](0010-github-app.md) | A GitHub App for sign-in, repository access, and webhooks | Accepted |
| [0011](0011-river-and-pgx.md) | River for jobs, pgx as the Postgres driver | Accepted |
| [0012](0012-server-sent-events-for-logs.md) | Server-sent events for live deployment logs | Accepted |
| [0013](0013-server-side-sessions.md) | Server-side sessions in Postgres | Accepted |
| [0014](0014-dockerfile-only-builds.md) | Builds require a Dockerfile | Accepted |
| [0015](0015-v1-runs-web-services-only.md) | v1 runs web services only | Accepted |
| [0016](0016-pnpm-for-the-web-app.md) | pnpm for the web app | Accepted |
| [0017](0017-structured-logging-with-slog.md) | Structured logging with log/slog | Accepted |
| [0018](0018-built-in-proxy-for-the-local-target.md) | A built-in reverse proxy for the local target; Caddy later | Accepted |
| [0019](0019-rollback-runs-a-kept-image-again.md) | Rollback runs a kept image again | Accepted |
| [0020](0020-the-connection-role-trusts-a-configured-principal.md) | The connection role trusts a configured principal | Accepted |
| [0021](0021-http-only-without-a-domain.md) | Apps are reachable over HTTP without a domain | Accepted |
| [0022](0022-the-connect-template-is-published-to-a-public-bucket.md) | The hatch-connect template is published to a public bucket | Accepted |

Template:

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context
## Decision
## Consequences
```
