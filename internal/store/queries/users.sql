-- name: CreateUser :one
INSERT INTO users (github_id, github_username, access_token)
VALUES ($1, $2, $3)
ON CONFLICT (github_id) DO UPDATE
    SET github_username = EXCLUDED.github_username,
        access_token    = EXCLUDED.access_token
RETURNING *;

-- name: GetUserByGithubID :one
SELECT * FROM users WHERE github_id = $1;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;