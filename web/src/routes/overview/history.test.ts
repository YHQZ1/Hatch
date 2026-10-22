import { describe, expect, it } from "vitest";
import type { Deployment, Project } from "@/lib/types";
import { type ServiceRow, getProjectStatusMeta } from "../services/service";
import { parseSort, recentTicks, sortRows, tickSummary } from "./history";

function project(over: Partial<Project> = {}): Project {
  return {
    id: "p", user_id: "u", repo_name: "shop", repo_url: "https://github.com/octo/shop",
    auto_deploy: false, branch: "main", dockerfile_path: "Dockerfile", port: 8080,
    subdomain: "shop", status: "active", delete_requested_at: null, delete_error: null,
    created_at: "2026-10-22T10:00:00Z", ...over,
  };
}

function deployment(id: string, status: string, message: string | null = null): Deployment {
  return {
    id, project_id: "p", branch: "main", status, cpu: 512, memory_mb: 1024, port: 8080,
    health_check: "/", image_uri: null, ecs_task_arn: null, ecs_service_name: null,
    target_group_arn: null, subdomain: "shop", url: null, commit_sha: "abc1234", commit_message: message,
    error_stage: null, error_message: null, created_at: new Date().toISOString(), deployed_at: null, failed_at: null,
  };
}

function row(name: string, status = "live"): ServiceRow {
  const proj = project({ id: name, subdomain: name });
  const last = deployment(`d-${name}`, status);
  return {
    project: proj, lastDeployment: last, status: getProjectStatusMeta(proj, last),
    liveUrl: null, repoSlug: `octo/${name}`, updatedAtRaw: last.created_at,
  };
}

describe("sortRows", () => {
  const rows = [row("zeta"), row("alpha", "failed"), row("Mid")];
  const requests = (r: ServiceRow) => ({ zeta: 5, alpha: 900, Mid: 40 })[r.project.id] ?? 0;
  const names = (rs: ServiceRow[]) => rs.map((r) => r.project.id);

  it("keeps the arrival order for recent activity", () => {
    expect(names(sortRows(rows, "activity", requests))).toEqual(["zeta", "alpha", "Mid"]);
  });
  it("sorts by name without regard to case", () => {
    expect(names(sortRows(rows, "name", requests))).toEqual(["alpha", "Mid", "zeta"]);
  });
  it("puts the busiest first", () => {
    expect(names(sortRows(rows, "traffic", requests))).toEqual(["alpha", "Mid", "zeta"]);
  });
  it("puts failures first and keeps the rest in order", () => {
    expect(names(sortRows(rows, "attention", requests))).toEqual(["alpha", "zeta", "Mid"]);
  });
  it("does not change the rows it was given", () => {
    const before = names(rows);
    sortRows(rows, "name", requests);
    expect(names(rows)).toEqual(before);
  });
  it("falls back to recent activity for an unknown sort", () => {
    expect(parseSort("nonsense")).toBe("activity");
    expect(parseSort("name")).toBe("name");
    expect(parseSort(null)).toBe("activity");
  });
});

describe("recentTicks", () => {
  const newestFirst = [deployment("d3", "live", "Third"), deployment("d2", "failed", "Second"), deployment("d1", "live", "First")];

  it("puts the newest deployment last", () => {
    expect(recentTicks(newestFirst).map((t) => t.id)).toEqual(["d1", "d2", "d3"]);
  });
  it("keeps only the latest few", () => {
    const many = Array.from({ length: 30 }, (_, i) => deployment(`d${i}`, "live"));
    const ticks = recentTicks(many, 16);
    expect(ticks).toHaveLength(16);
    expect(ticks[ticks.length - 1].id).toBe("d0");
  });
  it("describes each deployment in its tooltip", () => {
    const [first] = recentTicks([deployment("d1", "failed", "Break things")]);
    expect(first.title).toContain("Break things");
    expect(first.title).toContain("Failed");
  });
  it("summarises the strip", () => {
    expect(tickSummary(recentTicks(newestFirst))).toBe("Last 3 deployments: 2 live, 1 failed");
    expect(tickSummary([])).toBe("No deployments yet");
  });
});
