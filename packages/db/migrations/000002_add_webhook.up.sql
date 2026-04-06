ALTER TABLE projects
  ADD COLUMN webhook_secret TEXT,
  ADD COLUMN auto_deploy    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN branch         TEXT NOT NULL DEFAULT 'main';