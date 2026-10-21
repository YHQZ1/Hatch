import { type UseQueryResult, queryOptions } from "@tanstack/react-query";
import { apiJson } from "./api";
import type { ActivityEvent, Deployment, Project, ProjectEnvVar } from "./types";

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
