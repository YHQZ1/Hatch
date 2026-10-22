import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { NoticePayload } from "@/components/NoticeToast";
import { apiFetch, readApiError, redirectIfUnauthorized } from "@/lib/api";
import { activityQuery, projectQuery, projectsQuery } from "@/lib/queries";
import type { Project } from "@/lib/types";

/** The settings a project can change; whatever a patch leaves out stays as it is. */
export type ProjectPatch = Partial<
  Pick<Project, "repo_name" | "branch" | "dockerfile_path" | "port" | "health_check" | "auto_deploy">
>;

export type SaveProject = (patch: ProjectPatch, done: { title: string; message: string }) => Promise<boolean>;

/**
 * Saves some of a project's settings. It tells the user how it went (with the
 * server's own words when it refuses), keeps the page's copy of the project in
 * step, and says whether it worked so a section can drop its draft.
 */
export function useSaveProject(project: Project, notify: (notice: NoticePayload) => void) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const save: SaveProject = async (patch, done) => {
    if (saving) return false;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (redirectIfUnauthorized(res, navigate)) return false;
      if (!res.ok) {
        notify({
          type: "error",
          title: "Save failed",
          message: await readApiError(res, "The settings were not saved."),
        });
        return false;
      }
      queryClient.setQueryData(projectQuery(project.id).queryKey, (await res.json()) as Project);
      void queryClient.invalidateQueries({ queryKey: projectsQuery().queryKey, exact: true });
      void queryClient.invalidateQueries({ queryKey: activityQuery().queryKey });
      notify({ type: "success", ...done });
      return true;
    } catch {
      notify({ type: "error", title: "Save failed", message: "We couldn't reach the API." });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { save, saving };
}
