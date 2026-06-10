-- name: CreateDeployment :one
INSERT INTO deployments (project_id, branch, cpu, memory_mb, port, health_check, subdomain, commit_sha, commit_message)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: GetDeploymentByID :one
SELECT * FROM deployments WHERE id = $1;

-- name: GetDeploymentByIDAndUserID :one
SELECT deployments.*
FROM deployments
JOIN projects ON projects.id = deployments.project_id
WHERE deployments.id = $1 AND projects.user_id = $2;

-- name: GetDeploymentsByProjectID :many
SELECT * FROM deployments WHERE project_id = $1 ORDER BY created_at DESC;

-- name: GetDeploymentsByProjectIDAndUserID :many
SELECT deployments.*
FROM deployments
JOIN projects ON projects.id = deployments.project_id
WHERE deployments.project_id = $1 AND projects.user_id = $2
ORDER BY deployments.created_at DESC;

-- name: UpdateDeploymentStatus :one
UPDATE deployments SET status = $2 WHERE id = $1 RETURNING *;

-- name: CancelDeploymentByIDAndUserID :one
UPDATE deployments
SET status = 'canceled'
FROM projects
WHERE deployments.id = $1
  AND deployments.project_id = projects.id
  AND projects.user_id = $2
  AND deployments.status IN ('queued', 'building', 'deploying')
RETURNING deployments.*;

-- name: UpdateDeploymentLive :one
UPDATE deployments
SET status      = 'live',
    image_uri   = $2,
    ecs_task_arn = $3,
    url         = $4,
    ecs_service_name = $5,
    target_group_arn = $6,
    deployed_at = now()
WHERE id = $1
RETURNING *;
