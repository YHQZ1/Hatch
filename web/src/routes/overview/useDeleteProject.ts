import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { NoticePayload } from "@/components/NoticeToast";
import { apiFetch, readApiError } from "@/lib/api";
import { projectsQuery } from "@/lib/queries";
import type { Project } from "@/lib/types";
import type { ServiceRow } from "../services/service";

/**
 * Deleting a project. A first delete asks the user to type the project's name;
 * retrying a cleanup that failed goes straight through. The project stays in
 * the list, marked as being deleted, until Hatch has removed what it created.
 */
export function useDeleteProject(notify: (notice: NoticePayload) => void) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<ServiceRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const run = async (row: ServiceRow) => {
    const { project } = row;
    const retrying = project.status === "delete_failed";
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) {
        notify({
          type: "error",
          title: "Delete failed",
          message: await readApiError(res, "We couldn't remove that project right now."),
        });
        return;
      }
      const queued = (await res.json()) as Project;
      queryClient.setQueryData<Project[]>(projectsQuery().queryKey, (current) =>
        current?.map((item) => (item.id === queued.id ? queued : item)),
      );
      notify({
        type: "success",
        title: retrying ? "Cleanup retry queued" : "Deletion queued",
        message: retrying
          ? `${project.repo_name} cleanup is being retried.`
          : `${project.repo_name} will disappear after cloud cleanup finishes.`,
      });
    } catch {
      notify({ type: "error", title: "Delete failed", message: "We couldn't reach the API." });
    } finally {
      setDeleting(false);
      setTarget(null);
    }
  };

  return {
    /** The project the confirmation is open for, or null. */
    target,
    deleting,
    /** Starts a delete: asks first, unless this is a retry. */
    request: (row: ServiceRow) => {
      if (row.project.status === "delete_failed") void run(row);
      else setTarget(row);
    },
    cancel: () => setTarget(null),
    confirm: () => {
      if (target) void run(target);
    },
  };
}
