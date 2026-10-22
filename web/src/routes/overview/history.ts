import type { Deployment } from "@/lib/types";
import { type ServiceRow, type StatusKind, formatRelativeTime, getStatusMeta } from "../services/service";
import { displayName, failedFirst } from "./overview";

export type SortKey = "activity" | "name" | "traffic" | "attention";

export const SORT_LABELS: Record<SortKey, string> = {
  activity: "Recently active",
  name: "Name (A to Z)",
  traffic: "Most traffic",
  attention: "Failed first",
};

export const SORTS = Object.keys(SORT_LABELS) as SortKey[];

/** Reads a sort from a URL parameter, falling back to recent activity. */
export function parseSort(value: string | null): SortKey {
  return SORTS.includes(value as SortKey) ? (value as SortKey) : "activity";
}

/**
 * Puts the rows in the chosen order. `requests` says how many requests a
 * project had in the last hour. The rows arrive most recently active first,
 * and every other order keeps that as its tiebreak.
 */
export function sortRows(
  rows: ServiceRow[],
  sort: SortKey,
  requests: (row: ServiceRow) => number,
): ServiceRow[] {
  switch (sort) {
    case "activity":
      return rows;
    case "name":
      return [...rows].sort((a, b) => displayName(a).localeCompare(displayName(b), undefined, { sensitivity: "base" }));
    case "traffic":
      return [...rows].sort((a, b) => requests(b) - requests(a));
    case "attention":
      return failedFirst(rows);
  }
}

/** One deployment as a mark in the history strip. */
export interface Tick {
  id: string;
  kind: StatusKind;
  /** What it is, for the tooltip: "Fix the cart · 3h ago · Live". */
  title: string;
}

/**
 * The project's latest deployments for the history strip, oldest first, so the
 * newest sits at the right edge. `deployments` arrives newest first.
 */
export function recentTicks(deployments: Deployment[], max = 16): Tick[] {
  return deployments
    .slice(0, max)
    .map((deployment) => {
      const status = getStatusMeta(deployment.status);
      const message = deployment.commit_message?.trim() || `Deployment ${deployment.id.slice(0, 7)}`;
      return {
        id: deployment.id,
        kind: status.kind,
        title: `${message} · ${formatRelativeTime(deployment.created_at)} · ${status.label}`,
      };
    })
    .reverse();
}

/** How the strip reads aloud: "Last 5 deployments: 4 live, 1 failed". */
export function tickSummary(ticks: Tick[]): string {
  if (ticks.length === 0) return "No deployments yet";
  const counts = new Map<string, number>();
  for (const tick of ticks) counts.set(tick.kind, (counts.get(tick.kind) ?? 0) + 1);
  const parts = [...counts].map(([kind, n]) => `${n} ${kind === "active" ? "in progress" : kind}`);
  return `Last ${ticks.length} deployment${ticks.length === 1 ? "" : "s"}: ${parts.join(", ")}`;
}
