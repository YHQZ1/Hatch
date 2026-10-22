-- name: CreateUser :one
INSERT INTO users (
    github_id, github_username, access_token,
    refresh_token, access_token_expires_at, refresh_token_expires_at
)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (github_id) DO UPDATE
    SET github_username          = EXCLUDED.github_username,
        access_token             = EXCLUDED.access_token,
        refresh_token            = EXCLUDED.refresh_token,
        access_token_expires_at  = EXCLUDED.access_token_expires_at,
        refresh_token_expires_at = EXCLUDED.refresh_token_expires_at
RETURNING *;

-- name: GetUserByGithubID :one
SELECT * FROM users WHERE github_id = $1;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByIDForUpdate :one
-- Locks the row so that two requests do not spend the same single-use refresh
-- token. Call it inside a transaction.
SELECT * FROM users WHERE id = $1 FOR UPDATE;

-- name: UpdateUserTokens :exec
UPDATE users
SET access_token             = $2,
    refresh_token            = $3,
    access_token_expires_at  = $4,
    refresh_token_expires_at = $5
WHERE id = $1;
