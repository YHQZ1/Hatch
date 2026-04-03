-- name: CreateDeployment :one
INSERT INTO deployments (project_id, branch, cpu, memory_mb, port, health_check, subdomain)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetDeploymentByID :one
SELECT * FROM deployments WHERE id = $1;

-- name: GetDeploymentsByProjectID :many
SELECT * FROM deployments WHERE project_id = $1 ORDER BY created_at DESC;

-- name: UpdateDeploymentStatus :one
UPDATE deployments SET status = $2 WHERE id = $1 RETURNING *;

-- name: UpdateDeploymentLive :one
UPDATE deployments
SET status      = 'live',
    image_uri   = $2,
    ecs_task_arn = $3,
    url         = $4,
    deployed_at = now()
WHERE id = $1
RETURNING *;