-- name: CreateCloudConnection :one
INSERT INTO cloud_connections (
    user_id, region, stack_name, external_id, principal_arn,
    monthly_budget_usd, budget_email, certificate_arn
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListCloudConnectionsByUser :many
SELECT * FROM cloud_connections WHERE user_id = $1 ORDER BY created_at DESC;

-- name: CountCloudConnectionsByUser :one
SELECT count(*) FROM cloud_connections WHERE user_id = $1;

-- Every read and write is scoped by user, so one user can never see or change
-- another's connection by guessing an id.
-- name: GetCloudConnectionForUser :one
SELECT * FROM cloud_connections WHERE id = $1 AND user_id = $2;

-- Giving a different role starts verification over: what was learned about the
-- old one no longer applies.
-- name: SetCloudConnectionRole :one
UPDATE cloud_connections
SET role_arn = $3,
    aws_account_id = $4,
    status = 'pending',
    template_version = NULL,
    serves_https = NULL,
    stack_outputs = NULL,
    last_error = NULL,
    last_verified_at = NULL,
    updated_at = now()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: DeleteCloudConnection :execrows
DELETE FROM cloud_connections WHERE id = $1 AND user_id = $2;

-- The two below are what the verification job writes. Both only apply while the
-- connection still has the role that was checked: if the user has given another
-- one since, that result is about a role nobody is asking about any more.
-- name: GetCloudConnection :one
SELECT * FROM cloud_connections WHERE id = $1;

-- name: RecordCloudConnectionVerified :execrows
UPDATE cloud_connections
SET status = 'connected',
    aws_account_id = $3,
    template_version = $4,
    serves_https = $5,
    stack_outputs = $6,
    last_error = NULL,
    last_verified_at = now(),
    updated_at = now()
WHERE id = $1 AND role_arn = $2;

-- name: RecordCloudConnectionError :execrows
UPDATE cloud_connections
SET status = 'error', last_error = $3, updated_at = now()
WHERE id = $1 AND role_arn = $2;
