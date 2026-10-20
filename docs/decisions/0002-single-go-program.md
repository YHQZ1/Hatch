# 0002. One Go program with clear internal modules

- Status: Accepted
- Date: 2026-10-20

## Context

The current system is four services (web, API, builder, deployer) joined by
RabbitMQ and Redis. The original intent was a microservice architecture. For a
tool that teams install themselves, every extra service and dependency adds
cost and operational work, and the services share one database anyway.

## Decision

Merge the API, builder, and deployer into one Go program (`hatch`) with
subcommands (`serve`, `worker`, `migrate`). Keep the old service boundaries as
internal packages (`internal/build`, `internal/runtime`, `internal/api`, and so
on) with narrow interfaces between them.

## Consequences

- Install and local development need only Hatch and Postgres.
- Deploying, debugging, and testing are simpler; no cross-service contracts to
  version.
- Package boundaries keep the code modular, so a module can become its own
  service later if load or isolation requires it. `hatch worker` already allows
  running job processing separately.
- A bug in one module can crash the whole process; supervision and graceful
  job recovery (see 0003) matter more.
