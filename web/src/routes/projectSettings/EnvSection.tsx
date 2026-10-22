import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { NoticePayload } from "@/components/NoticeToast";
import { apiFetch, readApiError, redirectIfUnauthorized } from "@/lib/api";
import { NO_ENV_VARS, projectEnvVarsQuery } from "@/lib/queries";
import type { Project, ProjectEnvVar } from "@/lib/types";
import EnvEditor from "../newProject/EnvEditor";
import { type EnvVar, envMap } from "../newProject/newProject";
import Section from "./Section";

/** What changing the variables amounts to: the sorted name and value pairs, so order does not count. */
const signature = (vars: EnvVar[]) => JSON.stringify(Object.entries(envMap(vars)).sort(([a], [b]) => a.localeCompare(b)));

/**
 * The project's environment variables. Values are hidden until asked for, as
 * they are often secrets. Saving replaces the whole set; the next deployment
 * starts with it.
 */
export default function EnvSection({
  project,
  notify,
  onAppliesNextDeploy,
}: {
  project: Project;
  notify: (notice: NoticePayload) => void;
  onAppliesNextDeploy: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const result = useQuery(projectEnvVarsQuery(project.id));
  const baseline = useMemo<EnvVar[]>(
    () => (result.data ?? NO_ENV_VARS).map(({ key, value }: ProjectEnvVar) => ({ key, value })),
    [result.data],
  );
  const [draft, setDraft] = useState<EnvVar[] | null>(null);
  const [saving, setSaving] = useState(false);
  const vars = draft ?? baseline;
  const dirty = draft !== null && signature(draft) !== signature(baseline);

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/projects/${project.id}/env-vars`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ env_vars: envMap(vars) }),
      });
      if (redirectIfUnauthorized(res, navigate)) return;
      if (!res.ok) {
        notify({ type: "error", title: "Save failed", message: await readApiError(res, "The variables were not saved.") });
        return;
      }
      queryClient.setQueryData(projectEnvVarsQuery(project.id).queryKey, (await res.json()) as ProjectEnvVar[]);
      setDraft(null);
      notify({ type: "success", title: "Variables saved", message: "They are included in the next deployment." });
      onAppliesNextDeploy();
    } catch {
      notify({ type: "error", title: "Save failed", message: "We couldn't reach the API." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      id="variables"
      title="Environment variables"
      description="Passed to the container when it starts."
      footer={{
        dirty,
        saving,
        note: "Applies to the next deployment.",
        onDiscard: () => setDraft(null),
        onSave: () => void onSave(),
      }}
    >
      {result.isPending ? (
        <div aria-hidden className="h-24 animate-pulse rounded-hatch border border-line bg-panel" />
      ) : (
        <EnvEditor vars={vars} onChange={setDraft} maskValues />
      )}
    </Section>
  );
}
