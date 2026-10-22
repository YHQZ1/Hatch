-- GitHub App user tokens expire after 8 hours and are renewed with a refresh
-- token that is itself single-use and lasts six months. The expiry columns stay
-- NULL for tokens that predate this migration, which are treated as not
-- expiring (they were OAuth App tokens, which GitHub never expires).
ALTER TABLE users
    ADD COLUMN refresh_token             TEXT,
    ADD COLUMN access_token_expires_at   TIMESTAMPTZ,
    ADD COLUMN refresh_token_expires_at  TIMESTAMPTZ;
