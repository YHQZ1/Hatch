# 0020. The connection role trusts a configured principal

- Status: Accepted
- Date: 2026-10-25

## Context

Hatch reaches a user's AWS account by assuming the `hatch-control` role that the
`hatch-connect` stack creates ([0001](0001-deploy-into-user-cloud-account.md)).
That role's trust policy has to name who may assume it, which depends on where
Hatch runs (open question Q1): one hosted instance that users connect to, or a
Hatch each team runs for itself.

## Decision

Design for a hosted Hatch and keep self-hosting working. The AWS identity Hatch
assumes roles from is **configuration**, not something fixed in the template:
the stack takes it as a parameter (the principal ARN), and Hatch's own setting
supplies the value when it builds the quick-create link. A hosted instance
gives its own account's role; a self-hosted one gives whichever identity its
operator runs Hatch as. The ExternalId condition applies either way.

The code is the same in both cases, so nothing here commits Phase 6's choice of
where the hosted control plane runs.

## Consequences

- The template has a `HatchPrincipalArn` parameter, and the template and the
  link builder are tested with different values.
- Hatch needs its own credentials to call `sts:AssumeRole`. Where they come from
  (an instance role, environment variables) is the operator's setup, and the
  setup guide says what is needed.
- A connection records the principal it was created with, so a later change of
  Hatch's identity can be told apart from a broken role.
- Q1 moves from open to decided. Where the hosted control plane is deployed is
  still a Phase 6 item.
