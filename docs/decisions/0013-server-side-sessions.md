# 0013. Server-side sessions in Postgres

- Status: Accepted
- Date: 2026-10-21

## Context

Sessions are stateless JWTs in an HttpOnly cookie. They cannot be revoked
before they expire, so logging out, a stolen cookie, or removing a user does
not end a session. Every authenticated request already queries Postgres.

## Decision

- On sign-in, create a row in a `sessions` table and set a cookie containing a
  random 256-bit session ID. Store only a SHA-256 hash of the ID, so a
  database leak does not expose usable session IDs.
- Cookie: `HttpOnly`, `Secure` outside local development, `SameSite=Lax`,
  path `/`.
- Sessions expire after a fixed lifetime and after a period of inactivity;
  `last_seen_at` updates at most once every few minutes to limit writes.
- Logout deletes the row; "sign out everywhere" deletes all of a user's rows;
  the sweeper deletes expired rows.
- CSRF protection stays for state-changing requests.

## Consequences

- Sessions can be revoked immediately.
- `JWT_SECRET` and the JWT dependency (`golang-jwt/jwt`) are removed.
- One extra indexed lookup per request, which is negligible next to the
  queries each request already makes.
- Bearer-token API access, if needed later, uses separate API tokens stored the
  same way.

## As built (2026-10-21)

- `sessions` table: `token_hash` (SHA-256, unique), `user_id` (cascade delete),
  `created_at`, `last_seen_at`, `expires_at`.
- Sessions last 30 days from sign-in and end after 7 days without use.
  `last_seen_at` is written at most every 5 minutes.
- Ended sessions are deleted whenever someone signs in; there is no separate
  sweeper yet.
- Bearer-token access was removed with the JWT. The WebSocket hub checks the
  same session cookie.
- "Sign out everywhere" is not built; the data model supports it.
