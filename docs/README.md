# Hatch Documentation

Hatch is being rebuilt from a hosted Render-style platform into a tool that
deploys apps **into the user's own AWS account**, with cost guardrails built in.
These documents are the source of truth for that rebuild. Read them before
changing code.

Last updated: 2026-10-21

## Read in this order

| # | Document | What it answers |
| --- | --- | --- |
| 1 | [Vision](01-vision.md) | What Hatch is, who it is for, and why it exists |
| 2 | [Current state](02-current-state.md) | What the code does today, what works, what is broken |
| 3 | [Target architecture](03-architecture.md) | How the rebuilt system fits together |
| 4 | [Cost guardrails](04-cost-guardrails.md) | How Hatch prevents surprise cloud bills |
| 5 | [Roadmap](05-roadmap.md) | Phases, acceptance criteria, and current status |
| 6 | [Open questions](06-open-questions.md) | Decisions still to be made, and a list of decided ones |
| — | [Decision records](decisions/) | Why each major choice was made |

## Status at a glance

- **Phase:** 0, Foundation (see [Roadmap](05-roadmap.md#current-status)).
- **Production-ready:** no. The current code is a working prototype of the
  old hosted model.
- **AWS access:** none. All development must work without an AWS account
  until Phase 6 (see [Roadmap](05-roadmap.md#testing-without-aws)).

## Rules for these docs

- Describe what exists separately from what is planned. Never present a
  planned feature as done.
- When a decision changes, add or update a record in `decisions/` and update
  the affected documents in the same change.
- Keep [Roadmap › Current status](05-roadmap.md#current-status) accurate; it is
  the resume point for anyone picking up the work.
