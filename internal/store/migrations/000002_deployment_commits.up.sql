ALTER TABLE deployments
    ADD COLUMN commit_sha TEXT,
    ADD COLUMN commit_message TEXT;
