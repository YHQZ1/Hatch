-- name: CreateEnvVar :one
INSERT INTO env_vars (
    deployment_id,
    key,
    value,
    secret_arn
) VALUES (
    $1, $2, $3, $4
) RETURNING *;

-- name: GetEnvVarsByDeployment :many
SELECT * FROM env_vars WHERE deployment_id = $1;

-- name: CopyDeploymentEnvVars :exec
-- Gives a deployment the environment another one ran with, values as stored.
INSERT INTO env_vars (deployment_id, key, value, secret_arn)
SELECT sqlc.arg(to_deployment_id), source.key, source.value, source.secret_arn
FROM env_vars source
WHERE source.deployment_id = sqlc.arg(from_deployment_id);
