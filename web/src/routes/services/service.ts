import { deploymentUrl } from "@/lib/api";
import { ACTIVE_DEPLOYMENT_STATUSES as ACTIVE_STATUSES } from "@/lib/queries";
import type { Deployment, Project } from "@/lib/types";

export interface ServiceRow {
  project: Project;
  lastDeployment?: Deployment;
  status: StatusMeta;
  liveUrl: string | null;
  repoSlug: string;
  updatedAtRaw: string;
}

export type StatusKind =
  | "live"
  | "active"
  | "failed"
  | "canceled"
  | "deleting"
  | "suspended"
  | "idle";

export interface StatusMeta {
  label: string;
  kind: StatusKind;
  raw: string;
}

const FAILED_STATUSES = new Set(["failed", "error"]);
const CANCELED_STATUSES = new Set(["canceled", "cancelled"]);

export function getProjectStatusMeta(project: Project, deployment?: Deployment): StatusMeta {
  const projectStatus = (project.status || "active").toLowerCase();
  if (projectStatus === "deleting") {
    return { raw: projectStatus, label: "Deleting", kind: "deleting" };
  }
  if (projectStatus === "suspending") {
    return { raw: projectStatus, label: "Suspending", kind: "active" };
  }
  if (projectStatus === "resuming") {
    return { raw: projectStatus, label: "Resuming", kind: "active" };
  }
  if (projectStatus === "suspended") {
    return { raw: projectStatus, label: "Suspended", kind: "suspended" };
  }
  if (projectStatus === "suspend_failed" || projectStatus === "resume_failed") {
    return { raw: projectStatus, label: "Runtime failed", kind: "failed" };
  }
  if (projectStatus === "delete_failed") {
    return { raw: projectStatus, label: "Delete failed", kind: "failed" };
  }
  return getStatusMeta(deployment?.status);
}

export function getStatusMeta(status?: string | null): StatusMeta {
  const raw = (status || "none").toLowerCase();

  if (raw === "live") return { raw, label: "Live", kind: "live" };
  if (ACTIVE_STATUSES.has(raw)) {
    return {
      raw,
      label: raw === "queued" ? "Queued" : raw,
      kind: "active",
    };
  }
  if (FAILED_STATUSES.has(raw)) return { raw, label: "Failed", kind: "failed" };
  if (CANCELED_STATUSES.has(raw)) {
    return { raw, label: "Canceled", kind: "canceled" };
  }
  return { raw, label: "No deploys", kind: "idle" };
}

export function getServiceUrl(project: Project, deployment?: Deployment) {
  const candidate =
    deployment?.url ||
    deployment?.subdomain ||
    project.subdomain ||
    null;

  if (!candidate) return null;
  return deploymentUrl(candidate);
}

export function formatRepoSlug(url: string) {
  return url
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/\.git$/, "");
}

export function formatCommit(deployment?: Deployment): {
  short: string;
  message: string | null;
} {
  const sha = deployment?.commit_sha?.trim();
  const message = deployment?.commit_message?.trim() || null;

  if (!sha) {
    return { short: "—", message };
  }

  return {
    short: sha.slice(0, 7),
    message,
  };
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (Number.isNaN(date.getTime())) return "—";
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** How long a deployment took, or has taken so far; "—" if it never started. */
export function formatDeploymentDuration(deployment: Deployment): string {
  const start = new Date(deployment.created_at).getTime();
  const end = new Date(deployment.deployed_at ?? deployment.failed_at ?? "").getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";
  const seconds = Math.round((end - start) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

