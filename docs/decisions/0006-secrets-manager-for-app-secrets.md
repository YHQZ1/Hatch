# 0006. App secrets live in AWS Secrets Manager

- Status: Accepted (whether the control plane keeps copies is open, see Q12)
- Date: 2026-10-20

## Context

Env vars are encrypted in Postgres but decrypted and written as plain
`environment` values into ECS task definitions, where anyone with ECS read
access can see them.

## Decision

Env vars marked secret are written to AWS Secrets Manager in the user's
account under `hatch/<app>/<key>` and referenced from the task definition's
`secrets` field. The `hatch-task-execution` role can read only `hatch/*`
secrets. Plain (non-secret) env vars stay as `environment` values.

## Consequences

- Secret values never appear in task definitions or ECS API responses.
- Each secret has a small monthly cost, which the cost estimate includes.
- Secret changes require a new deployment for running tasks to pick them up;
  the UI must make that clear.
- On the local provider, secrets are passed to the container as environment
  variables, since the host operator already has full access.
