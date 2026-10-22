import { type UseQueryResult, queryOptions } from "@tanstack/react-query";
import { apiJson } from "./api";
import type {
  ActivityEvent,
  Deployment,
  GitHubInstallation,
  GitHubRepo,
  Project,
  ProjectEnvVar,
  Session,
  Traffic,
} from "./types";

/** How often to re-check things that are changing on their own. */
const POLL_MS = 8000;

export const ACTIVE_DEPLOYMENT_STATUSES = new Set([
  "queued",
  "building",
  "deploying",
]);

/** Project states that end by themselves, so the UI keeps checking. */
const PROJECT_TRANSITION_STATUSES = new Set([
  "deleting",
  "suspending",
  "resuming",
]);

export const NO_PROJECTS: Project[] = [];
export const NO_DEPLOYMENTS: Deployment[] = [];
export const NO_ACTIVITY: ActivityEvent[] = [];
export const NO_ENV_VARS: ProjectEnvVar[] = [];

// The API answers null for an empty list.
const list = <T>(data: T[] | null, empty: T[]): T[] =>
  Array.isArray(data) ? data : empty;

/**
 * Combines the results of a useQueries call over a list: each query's data in
 * order, and whether any is still loading for the first time or fetching.
 */
export function combineResults<T>(results: UseQueryResult<T>[]) {
  return {
    data: results.map((result) => result.data),
    pending: results.some((result) => result.isPending),
    fetching: results.some((result) => result.isFetching),
    updatedAt: Math.max(0, ...results.map((result) => result.dataUpdatedAt)),
  };
}

/** The signed-in user. A 401 here means the session has ended. */
export const meQuery = () =>
  queryOptions({
    queryKey: ["me"],
    queryFn: () => apiJson<Session>("/api/me"),
  });

/** The user's activity feed, newest first. */
export const activityQuery = () =>
  queryOptions({
    queryKey: ["activity"],
    queryFn: async () =>
      list(await apiJson<ActivityEvent[] | null>("/api/activity"), NO_ACTIVITY),
  });

/** All of the user's projects; polls while one is changing state. */
export const projectsQuery = () =>
  queryOptions({
    queryKey: ["projects"],
    queryFn: async () =>
      list(await apiJson<Project[] | null>("/api/projects"), NO_PROJECTS),
    refetchInterval: (query) =>
      query.state.data?.some((project) =>
        PROJECT_TRANSITION_STATUSES.has(project.status.toLowerCase()),
      )
        ? POLL_MS
        : false,
  });

/** One project. */
export const projectQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["projects", projectId],
    queryFn: () => apiJson<Project>(`/api/projects/${projectId}`),
  });

/** Whether a deployment status means it is still being built or rolled out. */
export const isActiveDeployment = (status: string | undefined) =>
  ACTIVE_DEPLOYMENT_STATUSES.has(status?.toLowerCase() ?? "");

/** One deployment; polls while it is in progress. */
export const deploymentQuery = (deploymentId: string) =>
  queryOptions({
    queryKey: ["deployments", deploymentId],
    queryFn: () => apiJson<Deployment>(`/api/deployments/${deploymentId}`),
    refetchInterval: (query) =>
      isActiveDeployment(query.state.data?.status) ? 3500 : false,
  });

/** A project's environment variables. */
export const projectEnvVarsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["projects", projectId, "env-vars"],
    queryFn: async () =>
      list(
        await apiJson<ProjectEnvVar[] | null>(`/api/projects/${projectId}/env-vars`),
        NO_ENV_VARS,
      ),
  });

/** Whether a project status is a change that finishes by itself. */
export const isProjectTransitioning = (status: string | undefined) =>
  PROJECT_TRANSITION_STATUSES.has(status?.toLowerCase() ?? "");

/** A project's deployments, newest first; polls while one is in progress. */
export const projectDeploymentsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["projects", projectId, "deployments"],
    queryFn: async () =>
      list(
        await apiJson<Deployment[] | null>(
          `/api/projects/${projectId}/deployments`,
        ),
        NO_DEPLOYMENTS,
      ),
    refetchInterval: (query) =>
      ACTIVE_DEPLOYMENT_STATUSES.has(
        query.state.data?.[0]?.status.toLowerCase() ?? "",
      )
        ? POLL_MS
        : false,
  });

/** How often the traffic counts are re-read. */
const TRAFFIC_POLL_MS = 15000;

/**
 * Requests to each app over the last hour. It polls only when something is
 * counting; on a target without a proxy it answers once that it is unavailable.
 */
export const trafficQuery = () =>
  queryOptions({
    queryKey: ["traffic"],
    queryFn: () => apiJson<Traffic>("/api/traffic"),
    refetchInterval: (query) => (query.state.data?.available ? TRAFFIC_POLL_MS : false),
  });

/** The newest log line of a deployment, or null while it has none. */
export const deploymentLastLogQuery = (deploymentId: string) =>
  queryOptions({
    queryKey: ["deployments", deploymentId, "logs", "last"],
    queryFn: async () => {
      const lines = await apiJson<string[] | null>(
        `/api/deployments/${deploymentId}/logs?tail=1`,
      );
      return Array.isArray(lines) && lines.length > 0 ? lines[lines.length - 1] : null;
    },
    refetchInterval: 3000,
  });

export const NO_REPOS: GitHubRepo[] = [];
export const NO_INSTALLATIONS: GitHubInstallation[] = [];

/**
 * The repositories the user has given the Hatch GitHub App access to, and the
 * accounts it is installed on. `installed` is false until the App is installed
 * on at least one account.
 */
export const githubReposQuery = () =>
  queryOptions({
    queryKey: ["github", "repos"],
    queryFn: async () => {
      const data = await apiJson<{
        installed?: boolean;
        installations?: GitHubInstallation[] | null;
        repos?: GitHubRepo[] | null;
      } | null>("/api/github/repos");
      return {
        installed: data?.installed === true,
        installations: Array.isArray(data?.installations)
          ? data.installations
          : NO_INSTALLATIONS,
        repos: Array.isArray(data?.repos) ? data.repos : NO_REPOS,
      };
    },
  });
