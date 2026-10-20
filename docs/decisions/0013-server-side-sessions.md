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
