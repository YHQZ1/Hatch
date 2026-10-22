import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { NoticePayload } from "@/components/NoticeToast";
import { apiFetch, readApiError, redirectIfUnauthorized } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { activityQuery, projectDeploymentsQuery, projectsQuery } from "@/lib/queries";
import type { Deployment, Project } from "@/lib/types";
import type { ServiceRow } from "../services/service";

/**
 * What the Overview can do to a project without leaving the page: redeploy,
 * suspend, resume, and cancel a running deployment. Each call tells the user how
 * it went and refreshes what the page shows. `busy` holds the ids of projects
 * with a call in flight.
 */
export function useProjectActions(notify: (notice: NoticePayload) => void) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  const track = async (projectId: string, work: () => Promise<void>) => {
    setBusy((current) => new Set(current).add(projectId));
    try {
      await work();
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(projectId);
        return next;
      });
    }
  };

  const refresh = (projectId: string) => {
    void queryClient.invalidateQueries({ queryKey: projectsQuery().queryKey, exact: true });
    void queryClient.invalidateQueries({ queryKey: projectDeploymentsQuery(projectId).queryKey });
    void queryClient.invalidateQueries({ queryKey: activityQuery().queryKey });
  };

  const send = async (path: string, init: RequestInit, failure: string) => {
    const res = await apiFetch(path, init);
    if (redirectIfUnauthorized(res, navigate)) return null;
    if (!res.ok) throw new Error(await readApiError(res, failure));
    return res;
  };

  const fail = (title: string, err: unknown, fallback: string) =>
    notify({ type: "error", title, message: err instanceof Error ? err.message : fallback });

  return {
    busy,

    /** Copies the project's full address, with its http:// or https://. */
    copyUrl: async (row: ServiceRow) => {
      if (!row.liveUrl) return;
      if (await copyText(row.liveUrl)) {
        notify({ type: "success", title: "URL copied", message: row.liveUrl });
      } else {
        notify({ type: "error", title: "Could not copy", message: "Your browser blocked clipboard access." });
      }
    },

    redeploy: (row: ServiceRow) =>
      track(row.project.id, async () => {
        const { project, lastDeployment } = row;
        try {
          const res = await send(
            "/api/deployments",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                project_id: project.id,
                branch: lastDeployment?.branch || project.branch || "main",
                port: Number(lastDeployment?.port || project.port || 80),
                health_check: lastDeployment?.health_check || "/",
              }),
            },
            "The deployment could not be queued.",
          );
          if (!res) return;
          refresh(project.id);
          notify({
            type: "success",
            title: "Deployment queued",
            message: `${project.repo_name} is building. Progress shows under Right now.`,
          });
        } catch (err) {
          fail("Redeploy failed", err, "The deployment could not be queued.");
        }
      }),

    suspend: (row: ServiceRow) => {
      if (!confirm(`Suspend ${row.project.repo_name}? It stops answering requests until you resume it.`)) {
        return Promise.resolve();
      }
      return track(row.project.id, () => control(row.project, "suspend"));
    },

    resume: (row: ServiceRow) => track(row.project.id, () => control(row.project, "resume")),

    cancel: (project: Project, deployment: Deployment) => {
      if (!confirm("Cancel this deployment?")) return Promise.resolve();
      return track(project.id, async () => {
        try {
          const res = await send(
            `/api/deployments/${deployment.id}/cancel`,
            { method: "POST" },
            "This deployment can no longer be canceled.",
          );
          if (!res) return;
          refresh(project.id);
          notify({ type: "success", title: "Deployment canceled", message: "Provisioning has been stopped for this run." });
        } catch (err) {
          fail("Cancel failed", err, "This deployment can no longer be canceled.");
        }
      });
    },
  };

  async function control(project: Project, action: "suspend" | "resume") {
    try {
      const res = await send(
        `/api/projects/${project.id}/${action}`,
        { method: "POST" },
        `Could not ${action} the project.`,
      );
      if (!res) return;
      refresh(project.id);
      notify({
        type: "success",
        title: action === "suspend" ? "Suspend queued" : "Resume queued",
        message:
          action === "suspend"
            ? `Hatch is stopping ${project.repo_name}.`
            : `Hatch is starting ${project.repo_name} again.`,
      });
    } catch (err) {
      fail(action === "suspend" ? "Suspend failed" : "Resume failed", err, "The project could not be changed.");
    }
  }
}
