import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  NO_DEPLOYMENTS,
  NO_PROJECTS,
  combineResults,
  projectDeploymentsQuery,
  projectsQuery,
} from "@/lib/queries";
import type { Deployment } from "@/lib/types";
import {
  type ServiceRow,
  formatRepoSlug,
  getProjectStatusMeta,
  getServiceUrl,
} from "./service";

/**
 * How many services there were last time, kept so a first paint with nothing
 * cached can reserve the right amount of space (see StatStrip) instead of
 * jumping when the answer arrives. Only a hint: the server's answer wins.
 */
const COUNT_HINT_KEY = "hatch_service_count";

function readCountHint(): number {
  try {
    return Number(localStorage.getItem(COUNT_HINT_KEY)) || 0;
  } catch {
    return 0;
  }
}

export interface ServiceStats {
  total: number;
  live: number;
  active: number;
  failed: number;
}

/**
 * Every service with its latest deployment and a status to show, newest
 * activity first, plus the counts the Overview and Services pages summarise.
 */
export function useServiceRows() {
  const projectsResult = useQuery(projectsQuery());
  const projects = projectsResult.data ?? NO_PROJECTS;
  const deploymentResults = useQueries({
    queries: projects.map((project) => projectDeploymentsQuery(project.id)),
    combine: combineResults<Deployment[]>,
  });

  const deployments = useMemo(() => {
    const byProject: Record<string, Deployment[]> = {};
    projects.forEach((project, index) => {
      byProject[project.id] = deploymentResults.data[index] ?? NO_DEPLOYMENTS;
    });
    return byProject;
  }, [projects, deploymentResults.data]);

  const loading = projectsResult.isPending || deploymentResults.pending;
  const refreshing =
    !loading && (projectsResult.isFetching || deploymentResults.fetching);
  const lastSyncedAt = projectsResult.dataUpdatedAt
    ? new Date(Math.max(projectsResult.dataUpdatedAt, deploymentResults.updatedAt))
    : null;

  const rows = useMemo<ServiceRow[]>(() => {
    return projects
      .map((project) => {
        const lastDeployment = deployments[project.id]?.[0];
        const updatedAtRaw =
          lastDeployment?.deployed_at ??
          lastDeployment?.created_at ??
          project.created_at;

        return {
          project,
          lastDeployment,
          status: getProjectStatusMeta(project, lastDeployment),
          liveUrl: getServiceUrl(project, lastDeployment),
          repoSlug: formatRepoSlug(project.repo_url),
          updatedAtRaw,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAtRaw).getTime() -
          new Date(a.updatedAtRaw).getTime(),
      );
  }, [deployments, projects]);

  const stats = useMemo<ServiceStats>(
    () => ({
      total: rows.length,
      live: rows.filter((row) => row.status.kind === "live").length,
      active: rows.filter((row) => row.status.kind === "active").length,
      failed: rows.filter((row) => row.status.kind === "failed").length,
    }),
    [rows],
  );

  const [lastKnownCount] = useState(readCountHint);
  useEffect(() => {
    if (loading) return;
    try {
      localStorage.setItem(COUNT_HINT_KEY, String(rows.length));
    } catch {
      // The hint is only an optimisation.
    }
  }, [loading, rows.length]);

  return {
    projectsResult,
    rows,
    deployments,
    stats,
    loading,
    refreshing,
    lastSyncedAt,
    expectServices: lastKnownCount > 0,
  };
}
