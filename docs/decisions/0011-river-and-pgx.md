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

## Sequencing (added 2026-10-21)

The move to pgx happens in two steps.

1. **Driver (done).** The `lib/pq` driver is replaced by pgx through its
   `database/sql` adapter (`pgx/v5/stdlib`). sqlc still generates for
   `database/sql`, so no query code changed. Errors are now checked by Postgres
   error code (`store.IsUniqueViolation`) instead of matching message text.
   Every query group has a test against a real Postgres.
2. **Native pgx (with River, done 2026-10-22).** The native `pgxpool` that River
   and `LISTEN`/`NOTIFY` need, and sqlc regenerated for `pgx/v5` with
   `emit_pointers_for_null_types`, so nullable columns are `*string`,
   `*time.Time` and `*int64`, and `uuid` and `timestamptz` stay `uuid.UUID` and
   `time.Time` through overrides in `sqlc.yaml`. The RabbitMQ worker packages
   were deleted in the same change rather than converted.

## As built (added 2026-10-22)

- `internal/jobs` holds four job kinds: `build`, `deploy`, `destroy_app`
  (project deletion) and `scale` (pause and resume, `replicas` 0 or 1). `hatch
  migrate` applies River's migrations first (`rivermigrate`), then Hatch's own.
- API handlers receive a `jobs.Inserter` (an insert-only River client) and call
  `InsertTx` inside the transaction that creates the deployment, marks the
  project deleting or changes its status, so the change and its job commit
  together. If the job cannot be queued the change rolls back and the request
  returns 503; previously the row was left behind and marked failed.
- `hatch serve` and `hatch worker` run a River client on queues `build` (1
  worker), `deploy` (1) and `control` (2), the same concurrency the RabbitMQ
  consumers had.
- Every job has `MaxAttempts` 2. A failure that retrying cannot fix (a bad
  Dockerfile, a missing GitHub App installation, a failed deploy) is written to
  the deployment or project and the job returns `river.JobCancel`, so a build
  is never run twice because it failed. The second attempt exists for a job
  whose process died: River returns it to the queue when Hatch stops mid-job
  (without spending the attempt) and rescues jobs left `running` by a crash
  after the longest job timeout plus five minutes.
- The build job enqueues the deploy job and completes itself in one transaction
  (`JobCompleteTx`), so a crash leaves both done or neither.
- A job that panics is stopped and its deployment marked failed
  (`panicHandler`).
- Not done: a job that crashes twice in a row is discarded by River's rescuer
  without a hook, leaving its deployment in `building` or `deploying`. The
  orphan sweeper (Phase 4) is where that is cleaned up.
- Cancellation still polls the deployment's status every 250 ms and cancels the
  job's context, as the RabbitMQ worker did; the "cancellation detected during
  Docker build" log line sent at that moment is gone, the final "build canceled
  during ..." line stays.

