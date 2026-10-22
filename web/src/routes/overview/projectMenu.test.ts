import { describe, expect, it, vi } from "vitest";
import type { Deployment, Project } from "@/lib/types";
import { type ServiceRow, getProjectStatusMeta } from "../services/service";
import { projectMenuItems } from "./projectMenu";

const project = (status = "active"): Project => ({
  id: "p1", user_id: "u", repo_name: "shop", repo_url: "https://github.com/octo/shop",
  auto_deploy: false, branch: "main", dockerfile_path: "Dockerfile", port: 8080,
  subdomain: "shop", status, delete_requested_at: null, delete_error: null, created_at: "2026-10-22T10:00:00Z",
});

const deployment: Deployment = {
  id: "d1", project_id: "p1", branch: "main", status: "live", cpu: 512, memory_mb: 1024, port: 8080,
  health_check: "/", image_uri: null, ecs_task_arn: null, ecs_service_name: null, target_group_arn: null,
  subdomain: "shop", url: "http://shop.localhost:8081", commit_sha: "abc1234", commit_message: "Ship it",
  error_stage: null, error_message: null, created_at: "2026-10-22T10:00:00Z", deployed_at: "2026-10-22T10:01:00Z", failed_at: null,
};

function row(status = "active", liveUrl: string | null = "http://shop.localhost:8081"): ServiceRow {
  const p = project(status);
  return { project: p, lastDeployment: deployment, status: getProjectStatusMeta(p, deployment), liveUrl, repoSlug: "octo/shop", updatedAtRaw: deployment.created_at };
}

const actions = () =>
  ({ copyUrl: vi.fn(), redeploy: vi.fn(), suspend: vi.fn(), resume: vi.fn(), cancel: vi.fn(), busy: new Set<string>() }) as never;

describe("projectMenuItems", () => {
  it("offers Copy URL next to Visit, and copies the full address", () => {
    const a = actions();
    const items = projectMenuItems(row(), a);
    expect(items.map((i) => i.label).slice(0, 3)).toEqual(["Visit", "Copy URL", "Redeploy"]);

    items[1].onSelect?.();
    expect((a as { copyUrl: ReturnType<typeof vi.fn> }).copyUrl).toHaveBeenCalledWith(expect.objectContaining({ liveUrl: "http://shop.localhost:8081" }));
  });

  it("disables Visit and Copy URL for a project with no address", () => {
    const items = projectMenuItems(row("active", null), actions());
    expect(items.find((i) => i.label === "Copy URL")?.disabled).toBe(true);
    expect(items.find((i) => i.label === "Visit")?.disabled).toBe(true);
  });

  it("disables Visit and Copy URL for a suspended project, which is not answering", () => {
    const items = projectMenuItems(row("suspended"), actions());
    expect(items.find((i) => i.label === "Copy URL")?.disabled).toBe(true);
    expect(items.find((i) => i.label === "Resume")).toBeDefined();
  });

  it("ends with a delete entry only when asked", () => {
    expect(projectMenuItems(row(), actions()).some((i) => i.danger)).toBe(false);
    expect(projectMenuItems(row(), actions(), vi.fn()).at(-1)?.danger).toBe(true);
  });
});
