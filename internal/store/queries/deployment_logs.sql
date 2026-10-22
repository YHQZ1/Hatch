-- name: AppendDeploymentLog :one
-- Adds a line to a deployment's log and returns its number. Nothing is added
-- (no row comes back) once the deployment has max_lines lines; the last line
-- kept is limit_line, so a log that was cut says so.
WITH next AS (
  UPDATE deployments
  SET log_seq = log_seq + 1
  WHERE id = sqlc.arg(deployment_id) AND log_seq < sqlc.arg(max_lines)::bigint
  RETURNING log_seq
)
INSERT INTO deployment_logs (deployment_id, seq, line)
SELECT
  sqlc.arg(deployment_id),
  next.log_seq,
  CASE WHEN next.log_seq = sqlc.arg(max_lines)::bigint THEN sqlc.arg(limit_line)::text ELSE sqlc.arg(line)::text END
FROM next
RETURNING seq;

-- name: GetDeploymentLogsAfter :many
SELECT seq, line
FROM deployment_logs
WHERE deployment_id = $1 AND seq > $2
ORDER BY seq
LIMIT $3;

-- name: GetDeploymentLogTail :many
SELECT seq, line
FROM (
  SELECT seq, line
  FROM deployment_logs
  WHERE deployment_id = $1
  ORDER BY seq DESC
  LIMIT $2
) AS newest
ORDER BY seq;
