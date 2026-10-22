-- The path Hatch waits on before calling a deployment live, kept on the project
-- so it can be changed after the project is created and every deployment (a
-- button press, a push) uses the same one.
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS health_check TEXT NOT NULL DEFAULT '/';

-- A project keeps what its latest deployment used until it is edited.
UPDATE projects p
SET health_check = latest.health_check
FROM (
    SELECT DISTINCT ON (project_id) project_id, health_check
    FROM deployments
    WHERE health_check <> ''
    ORDER BY project_id, created_at DESC
) latest
WHERE latest.project_id = p.id;
