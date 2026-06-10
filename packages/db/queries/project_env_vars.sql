-- name: CreateProjectEnvVar :one
INSERT INTO project_env_vars (
    project_id,
    key,
    value,
    secret_arn
) VALUES (
    $1, $2, $3, $4
) RETURNING *;

-- name: GetProjectEnvVarsByProject :many
SELECT * FROM project_env_vars WHERE project_id = $1 ORDER BY key ASC;

-- name: DeleteProjectEnvVarsByProject :exec
DELETE FROM project_env_vars WHERE project_id = $1;
