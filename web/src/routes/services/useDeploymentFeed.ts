import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  NO_DEPLOYMENTS,
  NO_PROJECTS,
  combineResults,
  projectDeploymentsQuery,
  projectsQuery,
} from "@/lib/queries";
import type { Deployment, Project } from "@/lib/types";

export interface FeedItem {
  deployment: Deployment;
  project: Project;
}

/** Every deployment of every service, newest first. */
export function useDeploymentFeed() {
  const projectsResult = useQuery(projectsQuery());
  const projects = projectsResult.data ?? NO_PROJECTS;
  const results = useQueries({
    queries: projects.map((project) => projectDeploymentsQuery(project.id)),
    combine: combineResults<Deployment[]>,
  });

  const items = useMemo<FeedItem[]>(
    () =>
      projects
        .flatMap((project, index) =>
          (results.data[index] ?? NO_DEPLOYMENTS).map((deployment) => ({ deployment, project })),
        )
        .sort(
          (a, b) =>
            new Date(b.deployment.created_at).getTime() -
            new Date(a.deployment.created_at).getTime(),
        ),
    [projects, results.data],
  );

  return {
    items,
    loading: projectsResult.isPending || results.pending,
    refreshing: !projectsResult.isPending && (projectsResult.isFetching || results.fetching),
    projectCount: projects.length,
  };
}
