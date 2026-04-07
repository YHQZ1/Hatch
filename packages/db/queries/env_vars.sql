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