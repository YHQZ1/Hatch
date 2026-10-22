import { describe, expect, it } from "vitest";
import type { Deployment, Project } from "@/lib/types";
import { type ServiceRow, getProjectStatusMeta } from "../services/service";
import {
  abilities,
  addressOf,
  compactNumber,
  countByFilter,
  displayName,
  errorRate,
  failedFirst,
  filterByQuery,
  formatElapsed,
  formatPercent,
  matchesFilter,
  matchesQuery,
  noteOf,
  parseFilter,
  stepIndex,
  sumSeries,
} from "./overview";

function project(over: Partial<Project> = {}): Project {
  return {
    id: "p1", user_id: "u", repo_name: "octo/shop", repo_url: "https://github.com/octo/shop",
    auto_deploy: false, branch: "main", dockerfile_path: "Dockerfile", port: 8080,
    subdomain: "shop", status: "active", delete_requested_at: null, delete_error: null,
    created_at: "2026-10-22T10:00:00Z", ...over,
  };
}

function deployment(over: Partial<Deployment> = {}): Deployment {
  return {
    id: "d1", project_id: "p1", branch: "main", status: "live", cpu: 512, memory_mb: 1024,
    port: 8080, health_check: "/", image_uri: null, ecs_task_arn: null, ecs_service_name: null,
    target_group_arn: null, subdomain: "shop", url: "http://shop.localhost:8081",
    commit_sha: "a3f9c1d2", commit_message: "Fix the cart", error_stage: null,
    error_message: null, created_at: "2026-10-22T10:00:00Z", deployed_at: "2026-10-22T10:01:00Z",
    failed_at: null, ...over,
  };
}

function row(p: Partial<Project> = {}, d?: Partial<Deployment>): ServiceRow {
  const proj = project(p);
  const last = d === undefined ? deployment() : deployment(d);
  return {
    project: proj, lastDeployment: last, status: getProjectStatusMeta(proj, last),
    liveUrl: last.url, repoSlug: "octo/shop", updatedAtRaw: last.created_at,
  };
}

describe("filters", () => {
  const live = row();
  const building = row({}, { status: "building", url: null });
  const failed = row({}, { status: "failed", url: null });
  const paused = row({ status: "suspended" });

  it("matches each status to its filter", () => {
    expect(matchesFilter(live, "live")).toBe(true);
    expect(matchesFilter(building, "building")).toBe(true);
    expect(matchesFilter(failed, "failed")).toBe(true);
    expect(matchesFilter(paused, "suspended")).toBe(true);
    expect(matchesFilter(live, "failed")).toBe(false);
    expect(matchesFilter(live, "all")).toBe(true);
  });

  it("counts rows per filter", () => {
    expect(countByFilter([live, live, building, failed, paused])).toEqual({
      all: 5, live: 2, building: 1, failed: 1, suspended: 1,
    });
  });

  it("treats a runtime failure as failed", () => {
    expect(matchesFilter(row({ status: "resume_failed" }), "failed")).toBe(true);
  });

  it("falls back to all for an unknown filter parameter", () => {
    expect(parseFilter("live")).toBe("live");
    expect(parseFilter("nonsense")).toBe("all");
    expect(parseFilter(null)).toBe("all");
  });

  it("lists failed services first and keeps the rest in order", () => {
    const a = row({ id: "a" });
    const b = row({ id: "b" }, { status: "failed", url: null });
    const c = row({ id: "c" });
    expect(failedFirst([a, b, c]).map((r) => r.project.id)).toEqual(["b", "a", "c"]);
  });
});

describe("search", () => {
  const r = row({ repo_name: "octo/payments-api", subdomain: "pay" }, { commit_message: "Retry charges", branch: "release" });

  it("matches name, subdomain, branch and commit message, in any case", () => {
    expect(matchesQuery(r, "PAYMENTS")).toBe(true);
    expect(matchesQuery(r, "pay")).toBe(true);
    expect(matchesQuery(r, "release")).toBe(true);
    expect(matchesQuery(r, "retry")).toBe(true);
  });

  it("matches the repository's owner and name, not only the project's name", () => {
    expect(matchesQuery(r, "octo/shop")).toBe(true);
  });

  it("needs every word to match", () => {
    expect(matchesQuery(r, "payments retry")).toBe(true);
    expect(matchesQuery(r, "payments missing")).toBe(false);
  });

  it("matches everything for an empty search", () => {
    expect(matchesQuery(r, "   ")).toBe(true);
    expect(filterByQuery([r], "")).toHaveLength(1);
    expect(filterByQuery([r], "zzz")).toHaveLength(0);
  });
});

describe("stages", () => {
  it("numbers the stages in order and -1 outside them", () => {
    expect(["queued", "building", "deploying"].map(stepIndex)).toEqual([0, 1, 2]);
    expect(stepIndex("live")).toBe(-1);
    expect(stepIndex(undefined)).toBe(-1);
  });
});

describe("formatElapsed", () => {
  it("shows minutes and seconds", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(42_000)).toBe("0:42");
    expect(formatElapsed(65_000)).toBe("1:05");
  });
  it("shows hours from an hour on", () => {
    expect(formatElapsed(3_723_000)).toBe("1:02:03");
  });
  it("never goes negative", () => {
    expect(formatElapsed(-5000)).toBe("0:00");
  });
});

describe("numbers", () => {
  it("compacts counts", () => {
    expect([0, 999, 1000, 1204, 9999, 10_400, 999_999, 1_500_000].map(compactNumber)).toEqual([
      "0", "999", "1k", "1.2k", "10k", "10k", "1M", "1.5M",
    ]);
  });

  it("works out an error rate, or none without requests", () => {
    expect(errorRate({ total_requests: 0, total_errors: 0 })).toBeNull();
    expect(errorRate({ total_requests: 200, total_errors: 1 })).toBe(0.5);
  });

  it("keeps a small rate distinguishable from zero", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.4)).toBe("0.4%");
    expect(formatPercent(12.3)).toBe("12%");
  });

  it("adds series of different lengths", () => {
    expect(sumSeries([[1, 2, 3], [10, 20]])).toEqual([11, 22, 3]);
    expect(sumSeries([])).toEqual([]);
  });
});

describe("abilities", () => {
  it("lets a healthy service be redeployed and suspended", () => {
    expect(abilities(project(), deployment())).toEqual({ redeploy: true, suspend: true, resume: false });
  });

  it("does not offer a redeploy while one is running", () => {
    expect(abilities(project(), deployment({ status: "building" })).redeploy).toBe(false);
  });

  it("offers resume, not suspend, for a suspended service", () => {
    expect(abilities(project({ status: "suspended" }), deployment())).toEqual({
      redeploy: false, suspend: false, resume: true,
    });
  });

  it("offers nothing while the service is changing state", () => {
    for (const status of ["suspending", "resuming", "deleting"]) {
      expect(abilities(project({ status }), deployment())).toEqual({
        redeploy: false, suspend: false, resume: false,
      });
    }
  });
});

describe("displayName", () => {
  it("prefers the address name", () => {
    expect(displayName(row({ subdomain: "portfolio" }))).toBe("portfolio");
  });
  it("falls back to the repository name without its owner", () => {
    expect(displayName(row({ subdomain: null, repo_name: "whatever" }))).toBe("shop");
  });
});

describe("addressOf", () => {
  it("links a live project's address", () => {
    expect(addressOf(row())).toEqual({ text: "shop.localhost:8081", link: "http://shop.localhost:8081" });
  });
  it("shows a suspended project's address without a link", () => {
    const suspended = row({ status: "suspended" });
    expect(addressOf(suspended)).toEqual({ text: "shop.localhost:8081", link: null });
  });
  it("has no address for a project that was never reachable", () => {
    expect(addressOf({ ...row({}, { status: "failed", url: null }), liveUrl: "shop" })).toBeNull();
    expect(addressOf({ ...row(), liveUrl: null })).toBeNull();
  });
});

describe("noteOf", () => {
  it("says nothing about a live project", () => {
    expect(noteOf(row())).toBeNull();
  });
  it("says where a failed build failed", () => {
    expect(noteOf(row({}, { status: "failed", error_stage: "source_sync", url: null }))).toEqual({
      text: "Failed during source sync",
      tone: "danger",
    });
  });
  it("names a build in progress", () => {
    expect(noteOf(row({}, { status: "building", url: null }))).toEqual({ text: "Building", tone: "warning" });
  });
  it("names a suspended project", () => {
    expect(noteOf(row({ status: "suspended" }))).toEqual({ text: "Suspended", tone: "muted" });
  });
});
