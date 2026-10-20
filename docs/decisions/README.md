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

Template:

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context
## Decision
## Consequences
```
