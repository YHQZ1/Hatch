# Open Questions

Decisions still to be made. Each has a recommendation, but none is final until
it is discussed and recorded. Decided questions are listed at the end with
where the decision is recorded.

## Open

### Q4. Custom domains in v1 or after? (Phase 5)

Recommendation: after v1, unless time allows. The default `<app>.<alb-host>` or
a user-provided wildcard domain covers v1.

### Q12. Does the control plane keep copies of secret env vars? (Phase 3)

Keeping encrypted copies allows re-syncing and display; not keeping them means
the user's account is the only place the values live.

Recommendation: do not keep secret values after writing them to Secrets
Manager; show them as "set" with an option to replace.

### Q13. Cost data source? (Phase 4)

AWS Price List API (accurate, more moving parts) or a bundled per-region price
table (simple, needs refreshing).

Recommendation: bundled table for v1, generated from the Price List API by a
script and refreshed each release.

### Q20. Where is the `hatch-connect` template published? (Phase 2)

CloudFormation's quick-create link fetches the template itself, and only from an
S3 address, so Hatch cannot serve it from its own URL. Someone has to publish
each version to a bucket that anyone can read. `QuickCreateURL` takes the
address as a setting, so the code does not depend on the answer.

Options: a public bucket Hatch's maintainers publish to at each release (one
address for every hosted and self-hosted install, versioned by path), or each
operator publishing the template to a bucket of their own.

Recommendation: the maintainers' public bucket with the template version in the
path, so a stack's `HatchTemplateVersion` output names exactly what it was made
from; an operator can still point the setting at their own.

## Decided

| # | Question | Decision | Recorded in |
| --- | --- | --- | --- |
| Q1 | Where does the control plane run? | Design for a hosted Hatch and keep self-hosting working; the AWS identity the connection role trusts is configuration. Where the hosted instance is deployed stays a Phase 6 item. | [0020](decisions/0020-the-connection-role-trusts-a-configured-principal.md) |
| Q2 | What does a user do first? | Hosted: connect AWS first, then deploy a sample app with a short expiry. Self-hosted and development: the local Docker target. | [Vision](01-vision.md#the-user-journey) |
| Q3 | Is v1 single-user? | Yes; table design leaves room for organizations later. | [Architecture](03-architecture.md#data-model-changes) |
| Q5 | GitHub OAuth App or GitHub App? | GitHub App. | [0010](decisions/0010-github-app.md) |
| Q6 | Job queue: library or hand-rolled? | River, with pgx as the driver. | [0011](decisions/0011-river-and-pgx.md) |
| Q7 | Single Go module or workspace? | One module. | [0008](decisions/0008-repository-structure.md) |
| Q8 | Keep Gin or move to stdlib routing? | Keep Gin. | [Architecture](03-architecture.md#technology-stack) |
| Q9 | Sessions: JWT or server-side? | Server-side sessions in Postgres. | [0013](decisions/0013-server-side-sessions.md) |
| Q10 | Local reverse proxy? | A built-in proxy in `hatch serve` for now; Caddy later, when HTTPS or custom domains need it. | [0018](decisions/0018-built-in-proxy-for-the-local-target.md) |
| Q11 | How does CodeBuild get the source? | A GitHub App installation token scoped to the repository. | [0010](decisions/0010-github-app.md) |
| Q14 | HTTPS without a custom domain? | The certificate and domain are optional at connect time; without them apps are reachable over HTTP on the ALB hostname, with a warning. | [0021](decisions/0021-http-only-without-a-domain.md) |
| Q15 | Frontend restructuring scope? | Move to a React + Vite single-page app served by the Go binary, in Phase 1; split large components as pages are touched. | [0009](decisions/0009-react-spa-served-by-go.md) |
| — | Dockerfile-less builds | Not in v1; builds require a Dockerfile. | [0014](decisions/0014-dockerfile-only-builds.md) |
| Q17 | Background workers and cron jobs: when? | After v1, first priority. | [0015](decisions/0015-v1-runs-web-services-only.md) |
| Q18 | Managed databases, caches, and queues? | After v1: SQS, then RDS Postgres with strict guardrails, caches last. | [0015](decisions/0015-v1-runs-web-services-only.md) |
| Q19 | Suggest a Dockerfile when a repository has none? | After v1. | [0015](decisions/0015-v1-runs-web-services-only.md) |
| Q16 | License and openness? MIT, public repository; no outside contributions for now. | [LICENSE](../LICENSE) |
| — | Live log transport | Server-sent events instead of WebSocket. | [0012](decisions/0012-server-sent-events-for-logs.md) |
| — | Logging | `log/slog`, JSON in production. | [Architecture](03-architecture.md#technology-stack) |
| — | Database tests | Real Postgres locally and in CI; fakes only for cloud providers. | [Architecture](03-architecture.md#technology-stack) |
