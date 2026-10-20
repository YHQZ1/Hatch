# 0001. Deploy into the user's own cloud account

- Status: Accepted
- Date: 2026-10-20

## Context

Hatch began as a hosted Render/Vercel-style platform: every user's app ran in
Hatch's own AWS account. Leaving test resources running in that account
produced a large bill, and the accounts were suspended. The hosted model also
makes Hatch responsible for running untrusted code from strangers and for
paying for every app.

## Decision

Hatch deploys apps into the **user's** AWS account. The user connects their
account through a CloudFormation stack that creates a limited IAM role; Hatch
assumes that role (with a per-connection ExternalId) to build and run apps
there. Hatch's own infrastructure is only the small control plane.

## Consequences

- Users pay AWS directly for their apps; Hatch carries no per-app cost.
- Untrusted builds run in the user's account, not on Hatch's servers, which
  removes most of the multi-tenant security risk.
- Onboarding needs an AWS account and a CloudFormation step, which adds
  friction compared with a hosted platform.
- Hatch must handle cross-account IAM carefully: ExternalId, least privilege,
  stack versioning.
- The product's differentiator becomes "managed-platform experience in your
  own account, with cost guardrails."
