import { describe, expect, it } from "vitest";
import type { Deployment } from "@/lib/types";
import { commitUrl, endedAt, hasCloudResources, neighbours, shortArn, shortId } from "./deployment";

const dep = (id: string, over: Partial<Deployment> = {}): Deployment => ({
  id, project_id: "p", branch: "main", status: "live", cpu: 1, memory_mb: 1, port: 80, health_check: "/",
  image_uri: null, ecs_task_arn: null, ecs_service_name: null, target_group_arn: null, subdomain: null, url: null,
  commit_sha: null, commit_message: null, error_stage: null, error_message: null, created_at: "2026-10-22T10:00:00Z",
  deployed_at: null, failed_at: null, ...over,
});

describe("commitUrl", () => {
  it("links a commit on GitHub", () => {
    expect(commitUrl("https://github.com/octo/shop", "abc123")).toBe("https://github.com/octo/shop/commit/abc123");
    expect(commitUrl("https://github.com/octo/shop.git/", "abc123")).toBe("https://github.com/octo/shop/commit/abc123");
    expect(commitUrl("https://www.github.com/octo/shop", "abc123")).toBe("https://github.com/octo/shop/commit/abc123");
  });
  it("makes no link when it cannot be sure", () => {
    expect(commitUrl("https://github.com/octo/shop", null)).toBeNull();
    expect(commitUrl("https://github.com/octo/shop", "")).toBeNull();
    expect(commitUrl("https://gitlab.com/octo/shop", "abc")).toBeNull();
    expect(commitUrl("https://github.com/octo", "abc")).toBeNull();
    expect(commitUrl("javascript:alert(1)", "abc")).toBeNull();
    expect(commitUrl("not a url", "abc")).toBeNull();
  });
  it("does not let a commit id change the address", () => {
    expect(commitUrl("https://github.com/octo/shop", "../../evil?x=1")).toBe(
      "https://github.com/octo/shop/commit/..%2F..%2Fevil%3Fx%3D1",
    );
  });
});

describe("neighbours", () => {
  const list = [dep("c"), dep("b"), dep("a")]; // newest first
  it("finds the newer and the older", () => {
    expect(neighbours(list, "b")).toEqual({ newer: list[0], older: list[2] });
  });
  it("has nothing past either end", () => {
    expect(neighbours(list, "c")).toEqual({ newer: null, older: list[1] });
    expect(neighbours(list, "a")).toEqual({ newer: list[1], older: null });
  });
  it("has nothing for a deployment that is not in the list", () => {
    expect(neighbours(list, "zzz")).toEqual({ newer: null, older: null });
  });
});

describe("small helpers", () => {
  it("shortens ids and ARNs", () => {
    expect(shortId("430b592c-089e-4776-a214-0cbfcd0de2f4")).toBe("430b592c");
    expect(shortArn("arn:aws:ecs:ap-south-1:1:service/hatch-cluster/shop")).toBe("hatch-cluster/shop");
    expect(shortArn(null)).toBe("—");
  });
  it("says when a deployment ended", () => {
    expect(endedAt(dep("a", { deployed_at: "2026-10-22T10:01:00Z" }))).toBe("2026-10-22T10:01:00Z");
    expect(endedAt(dep("a", { status: "failed", failed_at: "2026-10-22T10:00:30Z" }))).toBe("2026-10-22T10:00:30Z");
    expect(endedAt(dep("a", { status: "building" }))).toBeNull();
  });
  it("knows whether a deployment has cloud resources", () => {
    expect(hasCloudResources(dep("a"))).toBe(false);
    expect(hasCloudResources(dep("a", { ecs_service_name: "svc" }))).toBe(true);
  });
});
