// Shapes of the API's JSON responses (internal/api/handlers).

export interface Project {
  id: string;
  user_id: string;
  repo_name: string;
  repo_url: string;
  auto_deploy: boolean;
  branch: string;
  dockerfile_path: string;
  port: number;
  subdomain: string | null;
  status: string;
  delete_requested_at: string | null;
  delete_error: string | null;
  created_at: string;
}

export interface ActivityEvent {
  id: string;
  user_id: string;
  type: string;
  message: string;
  created_at: string;
}

export interface Deployment {
  id: string;
  project_id: string;
  branch: string;
  status: string;
  cpu: number;
  memory_mb: number;
  port: number;
  health_check: string;
  image_uri: string | null;
  ecs_task_arn: string | null;
  ecs_service_name: string | null;
  target_group_arn: string | null;
  subdomain: string | null;
  url: string | null;
  commit_sha: string | null;
  commit_message: string | null;
  error_stage: string | null;
  error_message: string | null;
  created_at: string;
  deployed_at: string | null;
  failed_at: string | null;
}
