import type { Deployment } from "@/lib/types";
import type { FeedItem } from "../services/useDeploymentFeed";
import { type StatusKind, getStatusMeta } from "../services/service";

/** Every row is this tall on a wide screen, so the list never jumps as it loads. */
export const ROW_HEIGHT = "min-h-[64px]";

/** How long a deployment took, in seconds; null while it runs or when it never finished. */
export function durationSeconds(deployment: Deployment): number | null {
  const end = deployment.deployed_at ?? deployment.failed_at;
  if (!end) return null;
  const seconds = (new Date(end).getTime() - new Date(deployment.created_at).getTime()) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds) : null;
}

/** 42 -> "42s", 125 -> "2m 5s", 3700 -> "1h 1m". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/** What a deployment is, in the words the page uses. */
export type DeployState = "current" | "replaced" | "building" | "failed" | "canceled" | "other";

export interface StateInfo {
  state: DeployState;
  /** The word the status column shows: Ready, Building, Failed, Canceled. */
  label: string;
  /** What marks it beside the status: "Current" or "Replaced" for a ready one. */
  badge: "Current" | "Replaced" | null;
  /** Whether it ended well: a deployment that went live, now or earlier. */
  succeeded: boolean;
}

/**
 * The ids of the deployments that are what their project is running now: its
 * newest successful deployment, unless the project is suspended. Older
 * successful ones were replaced by it.
 */
export function currentIds(items: FeedItem[]): Set<string> {
  const current = new Set<string>();
  const seen = new Set<string>();
  // Items arrive newest first.
  for (const { deployment, project } of items) {
    if (seen.has(project.id)) continue;
    if (getStatusMeta(deployment.status).kind === "live") {
      seen.add(project.id);
      if (project.status.toLowerCase() === "active") current.add(deployment.id);
    }
  }
  return current;
}

export function stateOf(item: FeedItem, current: Set<string>): StateInfo {
  const kind = getStatusMeta(item.deployment.status).kind;
  switch (kind) {
    case "live":
      return current.has(item.deployment.id)
        ? { state: "current", label: "Ready", badge: "Current", succeeded: true }
        : { state: "replaced", label: "Ready", badge: "Replaced", succeeded: true };
    case "active": {
      const raw = item.deployment.status.toLowerCase();
      return { state: "building", label: raw.charAt(0).toUpperCase() + raw.slice(1), badge: null, succeeded: false };
    }
    case "failed":
      return { state: "failed", label: "Failed", badge: null, succeeded: false };
    case "canceled":
      return { state: "canceled", label: "Canceled", badge: null, succeeded: false };
    default:
      return { state: "other", label: getStatusMeta(item.deployment.status).label, badge: null, succeeded: false };
  }
}

export type StatusTab = "all" | "succeeded" | "building" | "failed" | "canceled";

export const TAB_LABELS: Record<StatusTab, string> = {
  all: "All",
  succeeded: "Ready",
  building: "Building",
  failed: "Failed",
  canceled: "Canceled",
};

export const TABS = Object.keys(TAB_LABELS) as StatusTab[];

export function parseTab(value: string | null): StatusTab {
  return TABS.includes(value as StatusTab) ? (value as StatusTab) : "all";
}

const TAB_KINDS: Record<Exclude<StatusTab, "all">, StatusKind> = {
  succeeded: "live",
  building: "active",
  failed: "failed",
  canceled: "canceled",
};

export function matchesTab(item: FeedItem, tab: StatusTab): boolean {
  return tab === "all" || getStatusMeta(item.deployment.status).kind === TAB_KINDS[tab];
}

/** Whether every word of the search is in the project, commit message, branch or commit id. */
export function matchesSearch(item: FeedItem, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const { deployment, project } = item;
  const haystack = [project.repo_name, project.subdomain, deployment.commit_message, deployment.branch, deployment.commit_sha]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function countByTab(items: FeedItem[]): Record<StatusTab, number> {
  const counts: Record<StatusTab, number> = { all: items.length, succeeded: 0, building: 0, failed: 0, canceled: 0 };
  for (const item of items) {
    for (const tab of TABS) {
      if (tab !== "all" && matchesTab(item, tab)) counts[tab] += 1;
    }
  }
  return counts;
}

/** The local calendar day of a time, as "2026-10-22". */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "Today", "Yesterday", or "Mon, Oct 20". */
export function dayLabel(date: Date, now: Date): string {
  const key = dayKey(date);
  if (key === dayKey(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === dayKey(yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export interface DayBucket {
  key: string;
  label: string;
  succeeded: number;
  failed: number;
  canceled: number;
  building: number;
  total: number;
}

/** One bucket per day for the last `days` days, oldest first, including empty days. */
export function bucketsByDay(items: FeedItem[], days: number, now: Date): DayBucket[] {
  const buckets: DayBucket[] = [];
  const byKey = new Map<string, DayBucket>();
  for (let back = days - 1; back >= 0; back--) {
    const day = new Date(now);
    day.setDate(now.getDate() - back);
    const bucket: DayBucket = {
      key: dayKey(day),
      label: dayLabel(day, now),
      succeeded: 0,
      failed: 0,
      canceled: 0,
      building: 0,
      total: 0,
    };
    buckets.push(bucket);
    byKey.set(bucket.key, bucket);
  }
  for (const { deployment } of items) {
    const bucket = byKey.get(dayKey(new Date(deployment.created_at)));
    if (!bucket) continue;
    const kind = getStatusMeta(deployment.status).kind;
    if (kind === "live") bucket.succeeded += 1;
    else if (kind === "failed") bucket.failed += 1;
    else if (kind === "canceled") bucket.canceled += 1;
    else if (kind === "active") bucket.building += 1;
    else continue;
    bucket.total += 1;
  }
  return buckets;
}

/** The share of finished deployments that succeeded, 0 to 100; null when none have finished. */
export function successRate(buckets: DayBucket[]): number | null {
  const ok = buckets.reduce((sum, b) => sum + b.succeeded, 0);
  const bad = buckets.reduce((sum, b) => sum + b.failed, 0);
  return ok + bad === 0 ? null : (ok / (ok + bad)) * 100;
}

/** The middle duration of the successful deployments, in seconds; null when there are none. */
export function medianDuration(items: FeedItem[]): number | null {
  const durations = items
    .filter(({ deployment }) => getStatusMeta(deployment.status).kind === "live")
    .map(({ deployment }) => durationSeconds(deployment))
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);
  if (durations.length === 0) return null;
  const mid = Math.floor(durations.length / 2);
  return durations.length % 2 ? durations[mid] : Math.round((durations[mid - 1] + durations[mid]) / 2);
}
