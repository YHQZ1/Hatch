# 0011. River for jobs, pgx as the Postgres driver

- Status: Accepted
- Date: 2026-10-21

## Context

0003 moved jobs into Postgres but left open whether to use a library or a
hand-rolled `SKIP LOCKED` table. The job system needs retries with backoff,
scheduled and periodic jobs (the sweeper), unique jobs (one deploy per
project at a time), cancellation, and safe recovery after a crash.

The code uses `lib/pq` through `database/sql`, with sqlc generating queries for
it.

## Decision

- Use **River** (`github.com/riverqueue/river`, MPL-2.0) for all background
  jobs. Job kinds map to the table in the architecture doc. River's tables are
  created by its migrations, run from `hatch migrate` before Hatch's own.
- Switch the driver to **pgx v5** with a `pgxpool` connection pool. sqlc
  generates for `pgx/v5`. River's main driver (`riverpgxv5`) is built on pgx,
  and pgx supports `LISTEN`/`NOTIFY` natively, which log streaming needs.
- Enqueue jobs in the same transaction as the database change that causes
  them (for example, inserting a deployment and its `build` job together).

## Consequences

- Retries, scheduling, uniqueness, and crash recovery come from a maintained
  library instead of new code; River UI can be added later for inspecting
  jobs.
- MPL-2.0 applies per file to River's own code; using it as a dependency of
  an MIT project is fine.
- One new dependency (River) and one swapped dependency (pgx replaces
  `lib/pq`); all queries are regenerated, so the switch lands with the Phase 1
  consolidation rather than as a separate migration.
- Jobs and state change atomically, removing the "published but not recorded"
  class of bugs listed in 0003.
