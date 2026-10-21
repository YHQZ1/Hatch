# 0015. v1 runs web services only

- Status: Accepted
- Date: 2026-10-21

## Context

Platforms like Render offer several kinds of workload: web services,
background workers, cron jobs, and managed databases, caches, and queues.
Hatch's value is deploying into the user's own AWS account with cost
guardrails, and every extra workload type adds build, runtime, inventory,
and guardrail work. Managed data services are riskier still: in the user's
account they bill hourly whether used or not and hold data, which conflicts
with idle pause, expiry, and "tear down everything."

## Decision

v1 deploys **web services only**: an app built from the repository's
Dockerfile (ADR 0014) that listens on a port and gets a URL. Frontends and
backends are both web services.

Planned after v1, in this order of priority:

1. **Background workers and cron jobs** (open question Q17). A worker is an
   ECS service without a load balancer; a cron job is an ECS task started by
   EventBridge Scheduler.
2. **Suggest a Dockerfile** when a repository has none (Q19).
3. **Managed data services** (Q18): SQS first (pay per request, no idle cost),
   then Postgres on RDS with strict guardrails (smallest instance by default,
   cost estimate before creation, snapshot before any deletion, never
   auto-expired), caches last.

Until then, users connect external databases and caches through secret
environment variables.

## Consequences

- One workload type to make reliable, observable, and cost-safe end to end.
- Apps that need a worker or a schedule must run that part elsewhere for now.
- The UI and landing page must not advertise workers, cron jobs, or managed
  data services until they exist.
- The data model should not assume a project is always a web service, so
  other service types can be added without a migration of meaning (for
  example, a service type column defaulting to `web`).
