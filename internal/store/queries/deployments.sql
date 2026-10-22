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

-- name: GetDeploymentsByIDRangeAndUserID :many
-- The user's deployments whose id lies between low and high: how a short id (the
-- first hex digits of a UUID) is looked up, as a range over the primary key's
-- index. At most two rows come back, which is enough to tell one match from several.
SELECT deployments.*
FROM deployments
JOIN projects ON projects.id = deployments.project_id
WHERE projects.user_id = sqlc.arg(user_id)
  AND deployments.id >= sqlc.arg(low)::uuid
  AND deployments.id <= sqlc.arg(high)::uuid
ORDER BY deployments.created_at DESC
LIMIT 2;

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

-- name: CreateRollbackDeployment :one
-- A deployment that runs an earlier release again: its image, settings and
-- commit are copied, so nothing is built. Only a release that went live and
-- still has its image can be copied; otherwise no row comes back.
INSERT INTO deployments (
    project_id, branch, cpu, memory_mb, port, health_check, subdomain,
    commit_sha, commit_message, image_uri
)
SELECT source.project_id, source.branch, source.cpu, source.memory_mb, source.port,
       source.health_check, source.subdomain, source.commit_sha, source.commit_message,
       source.image_uri
FROM deployments source
WHERE source.id = $1
  AND source.status = 'live'
  AND source.image_uri IS NOT NULL AND source.image_uri <> ''
RETURNING *;

-- name: GetLatestLiveDeploymentByProject :one
-- The release a project is running: its newest deployment that went live.
SELECT * FROM deployments
WHERE project_id = $1 AND status = 'live'
ORDER BY created_at DESC
LIMIT 1;

-- name: GetStaleImageURIs :many
-- The images of a project's releases beyond the newest `keep` distinct ones, by
-- when they last went live. A rollback deploys an old image again, which makes
-- it new again, so an image in use is never among them.
SELECT image_uri::text
FROM (
    SELECT image_uri, max(deployed_at) AS last_live
    FROM deployments
    WHERE project_id = sqlc.arg(project_id)
      AND status = 'live'
      AND image_uri IS NOT NULL AND image_uri <> ''
    GROUP BY image_uri
) images
ORDER BY last_live DESC
OFFSET sqlc.arg(keep)::int;

-- name: ForgetImages :exec
-- Records that images were removed, so their releases can no longer be rolled
-- back to and nothing tries to remove them again.
UPDATE deployments
SET image_uri = NULL
WHERE project_id = sqlc.arg(project_id)
  AND image_uri = ANY(sqlc.arg(image_uris)::text[]);
