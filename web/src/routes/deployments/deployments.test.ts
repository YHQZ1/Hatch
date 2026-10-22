import { describe, expect, it } from "vitest";
import type { Deployment, Project } from "@/lib/types";
import type { FeedItem } from "../services/useDeploymentFeed";
import {
  bucketsByDay,
  canRollBack,
  countByTab,
  currentIds,
  dayLabel,
  durationSeconds,
  formatDuration,
  matchesSearch,
  matchesTab,
  medianDuration,
  parseTab,
  stateOf,
  successRate,
} from "./deployments";

const NOW = new Date(2026, 9, 22, 15, 0, 0); // 22 October 2026, local time

const project = (id: string, status = "active"): Project => ({
  id, user_id: "u", repo_name: id, repo_url: `https://github.com/octo/${id}`, auto_deploy: false,
  branch: "main", dockerfile_path: "Dockerfile", port: 8080, health_check: "/", subdomain: id, status,
  delete_requested_at: null, delete_error: null, created_at: "2026-10-01T00:00:00Z",
});

function item(id: string, p: Project, status: string, startedHoursAgo: number, seconds: number | null = 60, over: Partial<Deployment> = {}): FeedItem {
  const created = new Date(NOW.getTime() - startedHoursAgo * 3600_000);
  const end = seconds === null ? null : new Date(created.getTime() + seconds * 1000).toISOString();
  return {
    project: p,
    deployment: {
      id, project_id: p.id, branch: "main", status, cpu: 512, memory_mb: 1024, port: 8080, health_check: "/",
      image_uri: null, ecs_task_arn: null, ecs_service_name: null, target_group_arn: null, subdomain: p.id, url: null,
      commit_sha: "abc1234", commit_message: `commit ${id}`, error_stage: null, error_message: null,
      created_at: created.toISOString(),
      deployed_at: status === "live" ? end : null,
      failed_at: status === "failed" ? end : null,
      ...over,
    },
  };
}

describe("durations", () => {
  it("measures a finished deployment", () => {
    expect(durationSeconds(item("a", project("p"), "live", 1, 125).deployment)).toBe(125);
    expect(durationSeconds(item("a", project("p"), "failed", 1, 30).deployment)).toBe(30);
  });
  it("has none for one that is still running or was canceled", () => {
    expect(durationSeconds(item("a", project("p"), "building", 1, null).deployment)).toBeNull();
    expect(durationSeconds(item("a", project("p"), "canceled", 1, 10).deployment)).toBeNull();
  });
  it("writes durations briefly", () => {
    expect([42, 125, 3700].map(formatDuration)).toEqual(["42s", "2m 5s", "1h 1m"]);
  });
});

describe("what is current", () => {
  const shop = project("shop");
  const items = [
    item("d3", shop, "failed", 1),
    item("d2", shop, "live", 5), // newest successful: current
    item("d1", shop, "live", 50), // replaced by d2
  ];

  it("is the newest successful deployment of each project", () => {
    expect([...currentIds(items)]).toEqual(["d2"]);
    expect(stateOf(items[1], currentIds(items))).toEqual({ state: "current", label: "Ready", badge: "Current", succeeded: true });
    expect(stateOf(items[2], currentIds(items))).toEqual({ state: "replaced", label: "Ready", badge: "Replaced", succeeded: true });
  });
  it("is nothing for a suspended project", () => {
    const paused = project("blog", "suspended");
    expect(currentIds([item("x", paused, "live", 2)]).size).toBe(0);
  });
  it("is tracked per project", () => {
    const other = project("docs");
    const both = [...items, item("o1", other, "live", 70)];
    expect(new Set(currentIds(both))).toEqual(new Set(["d2", "o1"]));
  });
  it("names the other states", () => {
    const empty = new Set<string>();
    expect(stateOf(item("a", shop, "failed", 1), empty).state).toBe("failed");
    expect(stateOf(item("a", shop, "canceled", 1), empty).state).toBe("canceled");
    expect(stateOf(item("a", shop, "building", 1), empty)).toEqual({ state: "building", label: "Building", badge: null, succeeded: false });
    expect(stateOf(item("a", shop, "queued", 1), empty).label).toBe("Queued");
  });
});

describe("tabs and search", () => {
  const shop = project("shop");
  const items = [item("a", shop, "live", 1), item("b", shop, "failed", 2), item("c", shop, "canceled", 3), item("d", shop, "building", 0, null)];

  it("counts each tab", () => {
    expect(countByTab(items)).toEqual({ all: 4, succeeded: 1, building: 1, failed: 1, canceled: 1 });
  });
  it("matches a tab by outcome", () => {
    expect(items.filter((i) => matchesTab(i, "failed")).map((i) => i.deployment.id)).toEqual(["b"]);
    expect(items.filter((i) => matchesTab(i, "all"))).toHaveLength(4);
  });
  it("falls back to all for an unknown tab", () => {
    expect(parseTab("failed")).toBe("failed");
    expect(parseTab("nonsense")).toBe("all");
  });
  it("searches project, commit message, branch and commit id", () => {
    const i = item("a", shop, "live", 1, 60, { commit_message: "Fix the cart", branch: "release/2" });
    for (const q of ["shop", "fix cart", "RELEASE", "abc12"]) expect(matchesSearch(i, q), q).toBe(true);
    expect(matchesSearch(i, "shop nothing")).toBe(false);
    expect(matchesSearch(i, "  ")).toBe(true);
  });
});

describe("days", () => {
  const shop = project("shop");

  it("labels today, yesterday and older days", () => {
    expect(dayLabel(NOW, NOW)).toBe("Today");
    expect(dayLabel(new Date(2026, 9, 21, 23, 0), NOW)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 9, 18, 9, 0), NOW)).toBe("Sun, Oct 18");
  });
  it("buckets the last days including empty ones, oldest first", () => {
    const items = [item("a", shop, "live", 1), item("b", shop, "failed", 2), item("c", shop, "canceled", 30), item("old", shop, "live", 24 * 20)];
    const buckets = bucketsByDay(items, 7, NOW);
    expect(buckets).toHaveLength(7);
    expect(buckets[6].label).toBe("Today");
    expect(buckets[6]).toMatchObject({ succeeded: 1, failed: 1, total: 2 });
    expect(buckets[5]).toMatchObject({ canceled: 1, total: 1 });
    expect(buckets[0].total).toBe(0);
    expect(buckets.reduce((s, b) => s + b.total, 0)).toBe(3); // the deployment 20 days ago is outside
  });
});

describe("statistics", () => {
  const shop = project("shop");

  it("is the share of finished deployments that succeeded", () => {
    const buckets = bucketsByDay([item("a", shop, "live", 1), item("b", shop, "live", 2), item("c", shop, "live", 3), item("d", shop, "failed", 4), item("e", shop, "building", 0, null)], 3, NOW);
    expect(successRate(buckets)).toBe(75);
  });
  it("is unknown when nothing has finished", () => {
    expect(successRate(bucketsByDay([item("a", shop, "building", 0, null)], 3, NOW))).toBeNull();
    expect(successRate(bucketsByDay([], 3, NOW))).toBeNull();
  });
  it("takes the median duration of successful deployments", () => {
    const odd = [item("a", shop, "live", 1, 30), item("b", shop, "live", 2, 90), item("c", shop, "live", 3, 60), item("f", shop, "failed", 4, 5)];
    expect(medianDuration(odd)).toBe(60);
    const even = [item("a", shop, "live", 1, 30), item("b", shop, "live", 2, 90)];
    expect(medianDuration(even)).toBe(60);
    expect(medianDuration([item("f", shop, "failed", 1, 5)])).toBeNull();
  });
});

describe("canRollBack", () => {
  const withImage = (over: Partial<Deployment> = {}): Deployment =>
    item("d", project("p"), "live", 5, 60, { image_uri: "hatch-local:d", ...over }).deployment;
  const state = (state: ReturnType<typeof stateOf>["state"]): ReturnType<typeof stateOf> => ({ state, label: "", badge: null, succeeded: state === "replaced" || state === "current" });

  it("is for an earlier release whose image is still kept", () => {
    expect(canRollBack(withImage(), state("replaced"))).toBe(true);
  });
  it("is not for the release that runs now", () => {
    expect(canRollBack(withImage(), state("current"))).toBe(false);
  });
  it("is not for a release whose image was removed", () => {
    expect(canRollBack(withImage({ image_uri: null }), state("replaced"))).toBe(false);
    expect(canRollBack(withImage({ image_uri: "" }), state("replaced"))).toBe(false);
  });
  it("is not for a deployment that did not go live", () => {
    for (const s of ["failed", "canceled", "building", "other"] as const) {
      expect(canRollBack(withImage(), state(s)), s).toBe(false);
    }
  });
});
