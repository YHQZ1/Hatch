# 0017. Structured logging with log/slog

- Status: Accepted
- Date: 2026-10-21

## Context

Hatch logged with the standard `log` package: free-text lines, a coloured
per-request line from a custom middleware, and Gin's default logger. Nothing
tied the lines of one request together, and nothing could be filtered or
indexed by field.

## Decision

Log with `log/slog` from the standard library (no logging dependency).

- `internal/logging.Setup` configures the process: JSON lines when
  `ENVIRONMENT=production`, readable `key=value` text otherwise, and a level
  from `LOG_LEVEL` (default `info`). It is also the handler for the standard
  `log` package, so code not yet converted still produces lines in the same
  format.
- Request middleware gives each request an ID (a caller's `X-Request-ID` is kept
  if it is short and plain), returns it in the response header, and logs one
  `request` line with method, path, route, status, duration, size, client IP,
  and user. The query string is never logged because it can carry OAuth codes.
  A context handler adds the request ID to every line logged with the
  request's context, so handlers use `slog.ErrorContext(c.Request.Context(), ...)`.
- Panics in handlers are recovered, logged with their stack, and answered with
  a 500.
- Health checks and static assets are logged at `debug`; 5xx at `error`; 4xx at
  `warn`.

## Consequences

- Production logs can be filtered by `request_id`, `project_id`, `deployment_id`
  and so on.
- Fields use snake_case names (`project_id`, `error`); keep to that so queries
  stay consistent.
