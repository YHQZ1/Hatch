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

-- name: GetActiveDeploymentByProjectIDAndUserID :one
SELECT deployments.*
FROM deployments
JOIN projects ON projects.id = deployments.project_id
WHERE deployments.project_id = $1
  AND projects.user_id = $2
  AND deployments.status IN ('queued', 'building', 'deploying')
ORDER BY deployments.created_at DESC
LIMIT 1;

-- name: UpdateDeploymentStatus :one
UPDATE deployments SET status = $2 WHERE id = $1 RETURNING *;

-- name: MarkDeploymentFailed :one
UPDATE deployments
SET status = 'failed',
    error_stage = $2,
    error_message = $3,
    failed_at = now()
WHERE id = $1
RETURNING *;

-- name: CancelDeploymentByIDAndUserID :one
UPDATE deployments
SET status = 'canceled',
    error_stage = NULL,
    error_message = NULL,
    failed_at = NULL
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
    error_stage = NULL,
    error_message = NULL,
    failed_at = NULL,
    deployed_at = now()
WHERE id = $1
RETURNING *;


-- name: GetDeploymentStatus :one
SELECT status FROM deployments WHERE id = $1;

-- name: SetDeploymentStatus :exec
-- Moves a deployment to a new status and clears its failure. A canceled
-- deployment stays canceled unless the new status is 'canceled'.
UPDATE deployments
SET status = sqlc.arg(status)::text,
    error_stage = NULL,
    error_message = NULL,
    failed_at = NULL
WHERE id = sqlc.arg(id)
  AND (sqlc.arg(status)::text = 'canceled' OR status <> 'canceled');

-- name: FailDeployment :exec
-- Records why a deployment failed. A canceled deployment stays canceled.
UPDATE deployments
SET status = 'failed',
    error_stage = $2,
    error_message = $3,
    failed_at = now()
WHERE id = $1 AND status <> 'canceled';

-- name: FinishDeployment :execrows
-- Marks a deployment live. It reports 0 rows when the deployment was canceled
-- in the meantime.
UPDATE deployments
SET status = 'live',
    image_uri = $2,
    url = $3,
    ecs_task_arn = $4,
    ecs_service_name = $5,
    target_group_arn = $6,
    error_stage = NULL,
    error_message = NULL,
    failed_at = NULL,
    deployed_at = now()
WHERE id = $1 AND status <> 'canceled';

-- name: ProjectHasOtherLiveDeployment :one
-- Reports whether the deployment's project has a different live deployment.
SELECT EXISTS (
    SELECT 1
    FROM deployments current_deployment
    JOIN deployments live_deployment
      ON live_deployment.project_id = current_deployment.project_id
    WHERE current_deployment.id = $1
      AND live_deployment.id <> current_deployment.id
      AND live_deployment.status = 'live'
);

-- name: GetProjectImageURIs :many
SELECT DISTINCT image_uri::text
FROM deployments
WHERE project_id = $1 AND image_uri IS NOT NULL AND image_uri <> '';
