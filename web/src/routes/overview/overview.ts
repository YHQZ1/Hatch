import type { AppTraffic, Deployment, Project } from "@/lib/types";
import { type ServiceRow, formatCommit } from "../services/service";

export type StatusFilter = "all" | "live" | "building" | "failed" | "suspended";

export const FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All",
  live: "Live",
  building: "Building",
  failed: "Failed",
  suspended: "Suspended",
};

export const FILTERS = Object.keys(FILTER_LABELS) as StatusFilter[];

/** Reads a filter from a URL parameter, falling back to "all". */
export function parseFilter(value: string | null): StatusFilter {
  return FILTERS.includes(value as StatusFilter) ? (value as StatusFilter) : "all";
}

export function matchesFilter(row: ServiceRow, filter: StatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "live":
      return row.status.kind === "live";
    case "building":
      return row.status.kind === "active";
    case "failed":
      return row.status.kind === "failed";
    case "suspended":
      return row.status.kind === "suspended";
  }
}

/** Whether every word of the search appears in the project's name, repository, address, branch or commit. */
export function matchesQuery(row: ServiceRow, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [
    row.project.repo_name,
    row.repoSlug,
    row.project.subdomain,
    row.liveUrl,
    row.lastDeployment?.branch ?? row.project.branch,
    row.lastDeployment?.commit_message,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** The rows that match the search. */
export function filterByQuery(rows: ServiceRow[], query: string): ServiceRow[] {
  return rows.filter((row) => matchesQuery(row, query));
}

/** How many services each filter would show, for the chips. */
export function countByFilter(rows: ServiceRow[]): Record<StatusFilter, number> {
  const counts = { all: rows.length, live: 0, building: 0, failed: 0, suspended: 0 };
  for (const row of rows) {
    for (const filter of FILTERS) {
      if (filter !== "all" && matchesFilter(row, filter)) counts[filter] += 1;
    }
  }
  return counts;
}

/**
 * Failed services first, so what needs a look is never below the fold, then
 * the order the rows came in (most recently active first).
 */
export function failedFirst(rows: ServiceRow[]): ServiceRow[] {
  const rank = (row: ServiceRow) => (row.status.kind === "failed" ? 0 : 1);
  return [...rows].sort((a, b) => rank(a) - rank(b));
}

/** The stages of a deployment, in order. */
export const DEPLOY_STEPS = ["Queued", "Building", "Deploying"] as const;

/** Which stage a deployment status is in, or -1 when it is not in progress. */
export function stepIndex(status: string | undefined): number {
  switch (status?.toLowerCase()) {
    case "queued":
      return 0;
    case "building":
      return 1;
    case "deploying":
      return 2;
    default:
      return -1;
  }
}

/** A running time as m:ss, or h:mm:ss from an hour on. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = String(total % 60).padStart(2, "0");
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** 1,204 as "1.2k", small numbers as they are. */
export function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 999_500) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** The share of requests that failed, as a percentage; null with no requests. */
export function errorRate(traffic: Pick<AppTraffic, "total_requests" | "total_errors">): number | null {
  if (traffic.total_requests === 0) return null;
  return (traffic.total_errors / traffic.total_requests) * 100;
}

/** "0%", "0.4%", "12%": enough precision to tell small rates from none. */
export function formatPercent(value: number): string {
  if (value === 0) return "0%";
  if (value < 1) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

/** Adds up several apps' per-minute series into one. */
export function sumSeries(series: number[][]): number[] {
  const length = Math.max(0, ...series.map((s) => s.length));
  return Array.from({ length }, (_, i) => series.reduce((sum, s) => sum + (s[i] ?? 0), 0));
}

/** What a service can be asked to do from the Overview, given its state. */
export interface RowAbilities {
  redeploy: boolean;
  suspend: boolean;
  resume: boolean;
}

export function abilities(project: Project, lastDeployment?: Deployment): RowAbilities {
  const status = project.status.toLowerCase();
  const building = ["queued", "building", "deploying"].includes(
    lastDeployment?.status.toLowerCase() ?? "",
  );
  return {
    redeploy: status === "active" && !building,
    suspend: status === "active" || status === "suspend_failed",
    resume: status === "suspended" || status === "resume_failed",
  };
}

/** The line under a project's name: why it failed, or its latest commit. */
export function projectDetail(row: ServiceRow): string {
  const { lastDeployment, status } = row;
  if (status.kind === "failed") {
    return lastDeployment?.error_stage
      ? `Failed during ${lastDeployment.error_stage.replaceAll("_", " ")}`
      : status.label;
  }
  return formatCommit(lastDeployment).message ?? "No deployments yet";
}

/** Every list row is this tall, loaded or not, so the list never jumps. */
export const ROW_HEIGHT = "min-h-[72px]";

/**
 * The address line under a project's name: a link while it is live, plain
 * text for an address that is not answering (suspended), and nothing for a
 * project that was never deployed.
 */
export function addressOf(row: ServiceRow): { text: string; link: string | null } | null {
  const text = row.liveUrl?.replace(/^https?:\/\//, "") ?? "";
  // Without a dot or a port it is just the name, not an address.
  if (!/[.:]/.test(text)) return null;
  return { text, link: row.status.kind === "live" ? row.liveUrl : null };
}

/**
 * A short note on a project that is not simply live: what is wrong or in
 * progress. Live projects have none, so the row stays quiet when all is well.
 */
export function noteOf(row: ServiceRow): { text: string; tone: "danger" | "warning" | "muted" } | null {
  const { status, lastDeployment } = row;
  switch (status.kind) {
    case "failed":
      return {
        text: lastDeployment?.error_stage
          ? `Failed during ${lastDeployment.error_stage.replaceAll("_", " ")}`
          : status.label,
        tone: "danger",
      };
    case "active":
    case "deleting":
      return { text: status.label.charAt(0).toUpperCase() + status.label.slice(1), tone: "warning" };
    case "suspended":
    case "canceled":
      return { text: status.label, tone: "muted" };
    default:
      return null;
  }
}

/** A project's name as shown: its address name, or the repository's name without the owner. */
export function displayName(row: ServiceRow): string {
  return row.project.subdomain || row.repoSlug.split("/").pop() || row.project.repo_name;
}
