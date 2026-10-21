-- name: CreateActivityLog :one
INSERT INTO activity_logs (user_id, type, message)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetActivityLogsByUserID :many
SELECT * FROM activity_logs 
WHERE user_id = $1 
ORDER BY created_at DESC 
LIMIT 50;