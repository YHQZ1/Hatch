CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_deployment_per_project
ON deployments(project_id)
WHERE status IN ('queued', 'building', 'deploying');
