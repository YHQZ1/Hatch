ALTER TABLE projects
ADD COLUMN IF NOT EXISTS github_webhook_id BIGINT;
