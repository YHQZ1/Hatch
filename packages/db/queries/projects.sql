-- name: CreateProject :one
INSERT INTO projects (
  user_id, repo_name, repo_url, branch, dockerfile_path, port, subdomain, webhook_secret
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8
) RETURNING *;

-- name: GetProjectsByUserID :many
SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC;

-- name: GetProjectByID :one
SELECT * FROM projects WHERE id = $1;

-- name: GetProjectByRepoURL :one
SELECT * FROM projects WHERE repo_url = $1 LIMIT 1;

-- name: UpdateProjectWebhook :exec
UPDATE projects SET webhook_secret = $2 WHERE id = $1;

-- name: DeleteProject :exec
DELETE FROM projects WHERE id = $1;

-- name: GetProjectBySubdomain :one
SELECT * FROM projects WHERE subdomain = $1 LIMIT 1;