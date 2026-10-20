ALTER TABLE deployments
ADD COLUMN ecs_service_name TEXT,
ADD COLUMN target_group_arn TEXT;
