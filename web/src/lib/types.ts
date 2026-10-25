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
  /** The path Hatch waits on before calling a deployment live. */
  health_check: string;
  subdomain: string | null;
  status: string;
  delete_requested_at: string | null;
  delete_error: string | null;
  created_at: string;
}

export interface Session {
  user_id: string;
  github_id: number;
  username: string;
}

export interface ProjectEnvVar {
  key: string;
  value: string;
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

/** One app's last hour of requests, as counted by Hatch's proxy (GET /api/traffic). */
export interface AppTraffic {
  /** Requests and 5xx errors per minute, oldest first. */
  requests: number[];
  errors: number[];
  total_requests: number;
  total_errors: number;
  /** Mean time to first byte over the hour; 0 when there were no requests. */
  avg_latency_ms: number;
  /** The latest request since Hatch started counting, or null. */
  last_request_at: string | null;
}

export interface Traffic {
  /** False when nothing counts traffic (the AWS target). */
  available: boolean;
  window_minutes: number;
  /** When counting started; the counts reset when Hatch restarts. */
  since?: string;
  /** Keyed by the app's subdomain. */
  apps: Record<string, AppTraffic>;
}

/** A repository the Hatch GitHub App can read (GET /api/github/repos). */
export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string;
  language: string;
  updated_at: string;
  default_branch?: string;
}

/** An account the Hatch GitHub App is installed on (GET /api/github/repos). */
export interface GitHubInstallation {
  id: number;
  /** The GitHub login the App is installed on. */
  account: string;
  type: "User" | "Organization" | string;
}

/** A connection to one of the user's own AWS accounts (GET /api/connections). */
export interface CloudConnection {
  id: string;
  provider: "aws";
  /** pending until checked, then connected or error. */
  status: "pending" | "connected" | "error";
  region: string;
  stack_name: string;
  monthly_budget_usd: number;
  budget_email: string;
  certificate_arn: string | null;
  role_arn: string | null;
  aws_account_id: string | null;
  template_version: string | null;
  template_up_to_date: boolean | null;
  serves_https: boolean | null;
  last_error: string | null;
  last_verified_at: string | null;
  created_at: string;
  /** Opens the stack in the user's AWS console; given until the connection is connected. */
  quick_create_url?: string;
}
