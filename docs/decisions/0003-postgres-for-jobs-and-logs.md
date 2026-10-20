# 0003. Postgres for jobs and log streaming

- Status: Accepted (job library chosen in 0011; log transport changed to SSE in 0012)
- Date: 2026-10-20

## Context

RabbitMQ carries jobs between services, and Redis fans out build logs and
caches GitHub responses. On AWS these become Amazon MQ and ElastiCache, both
billed hourly. Hatch's job volume is low (a few jobs per deploy) and Postgres
is already required.

## Decision

- **Jobs:** store jobs in Postgres and claim them with
  `SELECT … FOR UPDATE SKIP LOCKED`, either through a library such as River or
  a small hand-rolled table.
- **Logs:** insert build and deploy log lines into a `deployment_logs` table
  and send a small `NOTIFY` with the deployment ID and sequence number. The
  WebSocket handler streams history from the table, then new lines.
- **Caching:** use a Postgres table or an in-process cache for GitHub
  responses.
- Remove RabbitMQ and Redis.

## Consequences

- One stateful dependency to run, back up, and secure.
- Jobs and the database state they change can be updated in the same
  transaction, which removes a class of "published but not recorded" bugs.
- Postgres `NOTIFY` payloads are limited to 8,000 bytes and are not durable;
  the table holds the data and `NOTIFY` is only a wake-up signal.
- At much higher scale a dedicated queue might be needed; the job interface
  keeps that change contained.
