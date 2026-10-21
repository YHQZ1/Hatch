ALTER TABLE projects
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS delete_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delete_error TEXT;

UPDATE projects
SET status = 'active'
WHERE status IS NULL OR status = '';
