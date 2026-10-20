# Open Questions

Decisions still to be made. Each has a recommendation, but none is final until
it is discussed and recorded in [decisions/](decisions/). Answer the ones
marked **Phase 1** first.

## Product and flow

### Q1. Where does the control plane run? (Phase 6, but shapes Phase 2)

- **(a)** One hosted Hatch instance that users connect their AWS accounts to.
- **(b)** Each team self-hosts their own Hatch.

Recommendation: design for (a) and keep (b) working; the code is the same. The
control plane is small enough to host cheaply.

### Q2. What does a user do first: connect AWS or try locally? (Phase 1)

A hosted instance cannot run apps for users without an AWS connection. Options:
require AWS before the first deploy, or offer a guided "connect AWS" with a
sample app as the first step. On self-hosted installs the local target is also
available.

Recommendation: hosted users connect AWS first, with a sample app and a short
expiry as the default first deploy. The local target is for self-hosted and
development use.

### Q3. Is v1 single-user? (Phase 1)

Recommendation: yes. Teams and roles come after v1, but table design should
not block them (for example, connections owned by a user now and by an
organization later).

### Q4. Custom domains in v1 or after? (Phase 5)

Recommendation: after v1, unless time allows. The default `<app>.<alb-host>` or
a user-provided wildcard domain covers v1.

## Technical

### Q5. GitHub OAuth App or GitHub App? (Phase 1)

Today Hatch uses an OAuth App with the `repo` scope, which grants access to all
of the user's repositories. A GitHub App is installed per repository, issues
short-lived installation tokens (useful for CodeBuild source access), and
delivers webhooks without per-repo hook registration.

Recommendation: move to a GitHub App. It is more work up front but fixes
access scope, token lifetime, and webhook management together.

### Q6. Job queue: library or hand-rolled? (Phase 1)

- **River** (Go, Postgres-native): retries, scheduling, unique jobs, and a UI
  already built.
- **Hand-rolled** `SKIP LOCKED` table: fewer dependencies, more code to own.

Recommendation: River, unless a review of its license, maturity, or schema
says otherwise.

### Q7. Single Go module or keep the workspace? (Phase 1)

Recommendation: one module (`github.com/YHQZ1/hatch`) with internal packages.
The workspace made sense for separate services; with one program it only adds
friction.

### Q8. Keep Gin or move to standard library routing? (Phase 1)

Recommendation: keep Gin for now to avoid churn; revisit only if it gets in
the way.

### Q9. Sessions: JWT cookie or server-side sessions? (Phase 1)

Recommendation: server-side sessions in Postgres (random session ID in an
HttpOnly cookie). They can be revoked, and the database lookup already happens
on every request.

### Q10. Local reverse proxy: Caddy or Traefik? (Phase 1)

Recommendation: Caddy, configured through its admin API, for simple dynamic
routes. Traefik's Docker-label discovery is the alternative.

### Q11. How does CodeBuild get the source? (Phase 3)

- Short-lived token passed to the build (best with a GitHub App installation
  token).
- Hatch uploads a source archive to S3 in the user's account.

Recommendation: installation token if Q5 picks a GitHub App; otherwise an S3
archive.

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

### Q15. Frontend restructuring scope? (Phase 5)

Recommendation: keep Next.js; split the large client components into smaller
ones as each page is touched, rather than a separate rewrite.

### Q16. License and openness?

Recommendation: keep MIT and the repository public, which suits a portfolio
project and self-hosting.
