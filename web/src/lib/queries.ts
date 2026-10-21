import { queryOptions } from "@tanstack/react-query";
import { apiJson } from "./api";
import type { Deployment, Project } from "./types";

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

// The API answers null for an empty list.
const list = <T>(data: T[] | null, empty: T[]): T[] =>
  Array.isArray(data) ? data : empty;

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
