# 0007. Cost guardrails are core product scope

- Status: Accepted
- Date: 2026-10-20

## Context

The first version of Hatch caused a large AWS bill because resources were left
running. Neither managed platforms nor raw AWS give users clear, enforced cost
safety for their own accounts.

## Decision

Cost guardrails are part of v1, not a later add-on: cost estimates before
deploys, a budget alarm on connect, spend-cap enforcement, idle pause, project
expiry, a complete resource inventory, an orphan sweeper, and verified
"tear down everything." See [Cost guardrails](../04-cost-guardrails.md).

## Consequences

- Every feature that creates a cloud resource must record it in the inventory
  and tag it; this is a review requirement for all AWS code.
- More v1 work than a plain deploy tool, offset by being the main
  differentiator.
- Estimates can be wrong; the UI always labels them as estimates and the
  budget alarm acts as a backstop.
