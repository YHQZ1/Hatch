# 0012. Server-sent events for live deployment logs

- Status: Accepted
- Date: 2026-10-21

## Context

Live build and deploy logs reach the browser over a WebSocket
(`gorilla/websocket`). Logs only flow one way, from server to browser. 0003
moves them into a `deployment_logs` table, where every line has a sequence
number.

## Decision

Stream logs with **server-sent events (SSE)** from
`GET /api/deployments/{id}/logs/stream`:

- Each line is one event whose `id` is its sequence number.
- On connect, the handler sends lines after the client's `Last-Event-ID`
  header (or `?after=`), then waits on Postgres `LISTEN` for new lines.
- When the deployment reaches a final status, the server sends an `end` event
  and closes the stream.
- The request is an ordinary authenticated API call using the session cookie.

## Consequences

- Browsers reconnect automatically and resume exactly where they left off,
  because `Last-Event-ID` maps onto the sequence number.
- No WebSocket library or upgrade handling; one dependency
  (`gorilla/websocket`) is removed.
- Works through ordinary HTTP proxies and load balancers; proxies must not
  buffer the response (the handler sets `X-Accel-Buffering: no` and flushes
  each event).
- If two-way messaging is ever needed in the browser, it can be added
  separately; nothing planned requires it.

## Implementation notes (2026-10-22)

- The sequence number is per deployment (`deployments.log_seq`), taken in the
  same statement as the insert, so lines are numbered and committed in order
  even when two writers race (build output arrives on two streams).
- `NOTIFY` carries only the deployment id, on the channel `deployment_events`,
  and is sent by triggers on `deployment_logs` inserts and on status changes.
  Streams read the lines and the status from the tables.
- Besides `log` events, the stream sends `status` and `end` events, so the UI no
  longer infers a deployment's status from words in the log text.
- A deployment keeps at most 20,000 lines of at most 8 KB each.
- The API server's 30-second `WriteTimeout` would end every stream, so the
  handler clears the deadline for its own response.
- Old logs are pruned by a daily River job (`prune_logs`, also run when the job
  runner starts). A finished deployment's lines are deleted 30 days after it was
  created, except that each project's newest five deployments keep theirs
  however old, and a queued or running deployment is never touched. The
  deployment stays and its page says no log was kept. Deletes run in batches of
  5,000 lines; a failed run is not retried because the next day's covers it.
