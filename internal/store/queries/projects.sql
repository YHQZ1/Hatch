-- name: CreateProject :one
INSERT INTO projects (
  user_id, repo_name, repo_url, branch, dockerfile_path, port, subdomain, webhook_secret
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8
) RETURNING *;

-- name: GetProjectsByUserID :many
SELECT * FROM projects
WHERE user_id = $1
  AND status <> 'deleted'
ORDER BY created_at DESC;

-- name: GetProjectByID :one
SELECT * FROM projects WHERE id = $1;

-- name: GetProjectByIDAndUserID :one
SELECT * FROM projects WHERE id = $1 AND user_id = $2;

-- name: GetProjectByRepoURL :one
SELECT * FROM projects WHERE repo_url = $1 LIMIT 1;

-- name: GetProjectsByRepoURL :many
SELECT * FROM projects WHERE repo_url = $1 ORDER BY created_at DESC;

-- name: UpdateProjectWebhook :exec
UPDATE projects
SET webhook_secret = $2,
    github_webhook_id = $3,
    auto_deploy = $4
WHERE id = $1;

-- name: ClearProjectWebhook :exec
UPDATE projects
SET github_webhook_id = NULL,
    auto_deploy = false
WHERE id = $1;

-- name: UpdateProjectSettings :one
UPDATE projects
SET repo_name = $3,
    branch = $4,
    dockerfile_path = $5,
    port = $6,
    auto_deploy = $7
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: MarkProjectDeleting :one
UPDATE projects
SET status = 'deleting',
    delete_requested_at = now(),
    delete_error = NULL
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: MarkProjectDeleteFailed :exec
UPDATE projects
SET status = 'delete_failed',
    delete_error = $2
WHERE id = $1;

-- name: UpdateProjectLifecycleStatus :one
UPDATE projects
SET status = $3,
    delete_error = NULL
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: MarkProjectOperationFailed :exec
UPDATE projects
SET status = $2,
    delete_error = $3
WHERE id = $1;

-- name: DeleteProject :exec
DELETE FROM projects WHERE id = $1;

-- name: DeleteProjectByIDAndUserID :exec
DELETE FROM projects WHERE id = $1 AND user_id = $2;

-- name: GetProjectBySubdomain :one
SELECT * FROM projects WHERE subdomain = $1 LIMIT 1;
