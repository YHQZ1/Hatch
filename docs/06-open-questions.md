# Open Questions

Decisions still to be made. Each has a recommendation, but none is final until
it is discussed and recorded. Decided questions are listed at the end with
where the decision is recorded.

## Open

### Q1. Where does the control plane run? (Phase 6, but shapes Phase 2)

- **(a)** One hosted Hatch instance that users connect their AWS accounts to.
- **(b)** Each team self-hosts their own Hatch.

Recommendation: design for (a) and keep (b) working; the code is the same. The
control plane is small enough to host cheaply.

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

### Q14. HTTPS without a custom domain? (Phase 2)

An ACM certificate requires a domain the user controls. Without one, apps are
reachable on the ALB hostname over HTTP only.

Options: require a domain at connect time, allow HTTP-only for testing with a
clear warning, or offer a Hatch-managed subdomain (needs Hatch to own a domain
and delegate DNS).

Recommendation: allow HTTP-only with a warning for v1, plus optional "bring a
wildcard domain" at connect time.

## Decided

| # | Question | Decision | Recorded in |
| --- | --- | --- | --- |
| Q2 | What does a user do first? | Hosted: connect AWS first, then deploy a sample app with a short expiry. Self-hosted and development: the local Docker target. | [Vision](01-vision.md#the-user-journey) |
| Q3 | Is v1 single-user? | Yes; table design leaves room for organizations later. | [Architecture](03-architecture.md#data-model-changes) |
| Q5 | GitHub OAuth App or GitHub App? | GitHub App. | [0010](decisions/0010-github-app.md) |
| Q6 | Job queue: library or hand-rolled? | River, with pgx as the driver. | [0011](decisions/0011-river-and-pgx.md) |
| Q7 | Single Go module or workspace? | One module. | [0008](decisions/0008-repository-structure.md) |
| Q8 | Keep Gin or move to stdlib routing? | Keep Gin. | [Architecture](03-architecture.md#technology-stack) |
| Q9 | Sessions: JWT or server-side? | Server-side sessions in Postgres. | [0013](decisions/0013-server-side-sessions.md) |
| Q10 | Local reverse proxy? | Caddy, through its admin API. | [Architecture](03-architecture.md#technology-stack) |
| Q11 | How does CodeBuild get the source? | A GitHub App installation token scoped to the repository. | [0010](decisions/0010-github-app.md) |
| Q15 | Frontend restructuring scope? | Move to a React + Vite single-page app served by the Go binary, in Phase 1; split large components as pages are touched. | [0009](decisions/0009-react-spa-served-by-go.md) |
| — | Dockerfile-less builds | Not in v1; builds require a Dockerfile. | [0014](decisions/0014-dockerfile-only-builds.md) |
| Q17 | Background workers and cron jobs: when? | After v1, first priority. | [0015](decisions/0015-v1-runs-web-services-only.md) |
| Q18 | Managed databases, caches, and queues? | After v1: SQS, then RDS Postgres with strict guardrails, caches last. | [0015](decisions/0015-v1-runs-web-services-only.md) |
| Q19 | Suggest a Dockerfile when a repository has none? | After v1. | [0015](decisions/0015-v1-runs-web-services-only.md) |
| Q16 | License and openness? MIT, public repository; no outside contributions for now. | [LICENSE](../LICENSE) |
| — | Live log transport | Server-sent events instead of WebSocket. | [0012](decisions/0012-server-sent-events-for-logs.md) |
| — | Logging | `log/slog`, JSON in production. | [Architecture](03-architecture.md#technology-stack) |
| — | Database tests | Real Postgres locally and in CI; fakes only for cloud providers. | [Architecture](03-architecture.md#technology-stack) |
