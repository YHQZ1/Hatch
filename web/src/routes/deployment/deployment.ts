import type { Deployment } from "@/lib/types";
import { safeHttpUrl } from "@/lib/url";

/** A deployment's id as people say it: its first eight characters. */
export const shortId = (id: string) => id.slice(0, 8);

/**
 * Where a commit is on GitHub, from the repository's address, or null when the
 * address is not a web address on github.com or there is no commit.
 */
export function commitUrl(repoUrl: string, sha: string | null | undefined): string | null {
  if (!sha) return null;
  const safe = safeHttpUrl(repoUrl);
  if (!safe) return null;
  try {
    const url = new URL(safe);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
    const path = url.pathname.replace(/\/+$/, "").replace(/\.git$/, "");
    return /^\/[^/]+\/[^/]+$/.test(path) ? `https://github.com${path}/commit/${encodeURIComponent(sha)}` : null;
  } catch {
    return null;
  }
}

/**
 * The deployments either side of one in a project's history. The list is newest
 * first, so "newer" comes before it and "older" after.
 */
export function neighbours(deployments: Deployment[], id: string): { newer: Deployment | null; older: Deployment | null } {
  const at = deployments.findIndex((deployment) => deployment.id === id);
  if (at < 0) return { newer: null, older: null };
  return { newer: deployments[at - 1] ?? null, older: deployments[at + 1] ?? null };
}

/** When a deployment ended, if it has: when it went live or when it failed. */
export function endedAt(deployment: Deployment): string | null {
  return deployment.deployed_at ?? deployment.failed_at;
}

/** Whether any field of a deployment names something in a cloud account (nothing does on the local target). */
export function hasCloudResources(deployment: Deployment): boolean {
  return Boolean(deployment.ecs_service_name || deployment.target_group_arn || deployment.ecs_task_arn);
}

/** The last two parts of an ARN, which is the part a person can tell apart. */
export function shortArn(value: string | null | undefined): string {
  if (!value) return "—";
  return value.split("/").slice(-2).join("/");
}
