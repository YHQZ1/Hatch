import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { NoticeToast } from "@/components/NoticeToast";
import { AppShell, Button, PageTitle, StatusText } from "@/components/ui";
import { useNotice } from "@/components/useNotice";
import {
  apiFetch,
  deploymentUrl,
  productionHost,
  readApiError,
  redirectIfUnauthorized,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { safeHttpUrl } from "@/lib/url";
import {
  NO_ENV_VARS,
  activityQuery,
  isProjectTransitioning,
  projectEnvVarsQuery,
  projectQuery,
  projectsQuery,
} from "@/lib/queries";
import type { Project, ProjectEnvVar } from "@/lib/types";

type Tab = "general" | "build" | "vars" | "danger";

interface EnvVar {
  key: string;
  value: string;
  visible: boolean;
}

const toEnvVars = (envVars: ProjectEnvVar[] | null | undefined): EnvVar[] =>
  Array.isArray(envVars)
    ? envVars.map(({ key, value }) => ({ key, value, visible: false }))
    : [];

export default function ProjectSettingsClient() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const projectResult = useQuery({
    ...projectQuery(id),
    // Suspending, resuming, and deleting finish on their own; keep checking.
    refetchInterval: (query) =>
      isProjectTransitioning(query.state.data?.status) ? 3500 : false,
  });
  const project = projectResult.data ?? null;
  const envVarsResult = useQuery(projectEnvVarsQuery(id));
  const loading = projectResult.isPending || envVarsResult.isPending;

  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [serviceActioning, setServiceActioning] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const failedAt = projectResult.isError
    ? projectResult.errorUpdatedAt
    : envVarsResult.isError
      ? envVarsResult.errorUpdatedAt
      : null;
  const { notice, setNotice, dismiss } = useNotice({
    failedAt,
    notice: {
      type: "error",
      title: "Settings unavailable",
      message: "Hatch could not load this service settings page.",
    },
  });

  // The form shows the saved project until a field is edited. A draft is null
  // until then, so editing starts from whatever was last loaded or saved.
  const [projectNameDraft, setProjectName] = useState<string | null>(null);
  const [branchDraft, setBranch] = useState<string | null>(null);
  const [dockerfilePathDraft, setDockerfilePath] = useState<string | null>(null);
  const [portDraft, setPort] = useState<string | null>(null);
  const [autoDeployDraft, setAutoDeployDraft] = useState<boolean | null>(null);
  const projectName = projectNameDraft ?? project?.repo_name ?? "";
  const branch = branchDraft ?? project?.branch ?? "main";
  const dockerfilePath =
    dockerfilePathDraft ?? rootFromDockerfilePath(project?.dockerfile_path);
  const port = portDraft ?? String(project?.port ?? 80);
  const autoDeploy = autoDeployDraft ?? Boolean(project?.auto_deploy ?? true);
  const toggleAutoDeploy = () => setAutoDeployDraft(!autoDeploy);

  const discardProjectDraft = () => {
    setProjectName(null);
    setBranch(null);
    setDockerfilePath(null);
    setPort(null);
    setAutoDeployDraft(null);
  };

  const envVarsBaseline = useMemo(
    () => toEnvVars(envVarsResult.data ?? NO_ENV_VARS),
    [envVarsResult.data],
  );
  const [envVarsDraft, setEnvVarsDraft] = useState<EnvVar[] | null>(null);
  const envVars = envVarsDraft ?? envVarsBaseline;
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [bulkEnvText, setBulkEnvText] = useState("");

  const setEnvVars = (update: EnvVar[] | ((current: EnvVar[]) => EnvVar[])) =>
    setEnvVarsDraft(typeof update === "function" ? update(envVars) : update);

  /** Other pages list this project, so they should look again. */
  const refreshProjectLists = () => {
    void queryClient.invalidateQueries({
      queryKey: projectsQuery().queryKey,
      exact: true,
    });
    void queryClient.invalidateQueries({ queryKey: activityQuery().queryKey });
  };

  const productionUrl = deploymentUrl(productionHost(project?.subdomain ?? null));

  const hasProjectChanges = project
    ? projectName.trim() !== project.repo_name ||
      branch.trim() !== project.branch ||
      dockerfilePathFromRoot(dockerfilePath) !== project.dockerfile_path ||
      Number(port) !== project.port ||
      autoDeploy !== project.auto_deploy
    : false;

  const hasEnvChanges =
    JSON.stringify(normalizeEnvVars(envVars)) !==
    JSON.stringify(normalizeEnvVars(envVarsBaseline));

  const canSave =
    activeTab === "vars" ? hasEnvChanges : activeTab !== "danger" && hasProjectChanges;

  async function saveProjectSettings() {
    if (!project || saving) return;

    const nextPort = Number(port);
    if (!Number.isInteger(nextPort) || nextPort < 1 || nextPort > 65535) {
      setNotice({
        type: "error",
        title: "Invalid port",
        message: "Port must be a whole number between 1 and 65535.",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_name: projectName.trim(),
          branch: branch.trim() || "main",
          dockerfile_path: dockerfilePathFromRoot(dockerfilePath),
          port: nextPort,
          auto_deploy: autoDeploy,
        }),
      });
      if (redirectIfUnauthorized(res, navigate)) return;
      if (!res.ok) {
        throw new Error(await readApiError(res, "failed to save project"));
      }

      const updatedProject: Project = await res.json();
      queryClient.setQueryData(projectQuery(id).queryKey, updatedProject);
      discardProjectDraft();
      refreshProjectLists();
      setNotice({
        type: "success",
        title: "Settings saved",
        message: "New build settings will apply to the next deployment.",
      });
    } catch (err) {
      setNotice({
        type: "error",
        title: "Save failed",
        message: err instanceof Error ? err.message : "Project settings were not saved.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveEnvironmentVariables() {
    if (saving) return;
    setSaving(true);
    try {
      const envVarsMap: Record<string, string> = {};
      normalizeEnvVars(envVars).forEach((envVar) => {
        envVarsMap[envVar.key] = envVar.value;
      });

      const res = await apiFetch(`/api/projects/${id}/env-vars`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ env_vars: envVarsMap }),
      });
      if (redirectIfUnauthorized(res, navigate)) return;
      if (!res.ok) {
        throw new Error(await readApiError(res, "failed to save variables"));
      }

      const saved: ProjectEnvVar[] = await res.json();
      queryClient.setQueryData(projectEnvVarsQuery(id).queryKey, saved);
      setEnvVarsDraft(null);
      setNotice({
        type: "success",
        title: "Variables saved",
        message: "Environment variables will be included in the next deployment.",
      });
    } catch (err) {
      setNotice({
        type: "error",
        title: "Save failed",
        message: err instanceof Error ? err.message : "Variables were not saved.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (activeTab === "vars") {
      await saveEnvironmentVariables();
      return;
    }
    await saveProjectSettings();
  }

  function handleDiscard() {
    if (activeTab === "vars") {
      setEnvVarsDraft(null);
      setNewKey("");
      setNewValue("");
      return;
    }
    discardProjectDraft();
  }

  async function handleDelete({ retry = false }: { retry?: boolean } = {}) {
    if (
      !project ||
      deleting ||
      (!retry && deleteConfirm !== project.repo_name)
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/projects/${id}`, { method: "DELETE" });
      if (redirectIfUnauthorized(res, navigate)) return;
      if (!res.ok) {
        throw new Error(await readApiError(res, "failed to delete service"));
      }
      refreshProjectLists();
      queryClient.removeQueries({ queryKey: projectQuery(id).queryKey });
      setNotice({
        type: "success",
        title: retry ? "Cleanup retry queued" : "Deletion queued",
        message: retry
          ? "Hatch is retrying the failed cloud cleanup."
          : "Hatch will remove the service after cloud cleanup finishes.",
      });
      navigate("/overview");
    } catch (err) {
      setNotice({
        type: "error",
        title: "Delete failed",
        message: err instanceof Error ? err.message : "Service was not deleted.",
      });
    } finally {
      setDeleting(false);
    }
  }

  async function handleServiceControl(action: "suspend" | "resume") {
    if (!project || serviceActioning) return;
    setServiceActioning(true);
    try {
      const res = await apiFetch(`/api/projects/${id}/${action}`, {
        method: "POST",
      });
      if (redirectIfUnauthorized(res, navigate)) return;
      if (!res.ok) {
        throw new Error(
          await readApiError(
            res,
            action === "suspend"
              ? "failed to suspend service"
              : "failed to resume service",
          ),
        );
      }

      const nextProject: Project = await res.json();
      queryClient.setQueryData(projectQuery(id).queryKey, nextProject);
      refreshProjectLists();
      setNotice({
        type: "success",
        title: action === "suspend" ? "Suspend queued" : "Resume queued",
        message:
          action === "suspend"
            ? "Hatch is stopping the running ECS service."
            : "Hatch is starting the ECS service again.",
      });
    } catch (err) {
      setNotice({
        type: "error",
        title: action === "suspend" ? "Suspend failed" : "Resume failed",
        message:
          err instanceof Error
            ? err.message
            : "Service operation could not be queued.",
      });
    } finally {
      setServiceActioning(false);
    }
  }

  function addEnvVar() {
    const key = normalizeEnvKey(newKey);
    if (!key) return;
    setEnvVars((prev) => {
      const withoutDuplicate = prev.filter((envVar) => normalizeEnvKey(envVar.key) !== key);
      return [...withoutDuplicate, { key, value: newValue, visible: false }];
    });
    setNewKey("");
    setNewValue("");
  }

  function mergeEnvVarsFromText(text: string) {
    const parsed = parseEnvFile(text);
    if (parsed.length === 0) {
      setNotice({
        type: "error",
        title: "No variables found",
        message: "Paste KEY=value lines or upload a .env style file.",
      });
      return;
    }

    setEnvVars((prev) => {
      const merged = new Map<string, EnvVar>();
      prev.forEach((envVar) => {
        const key = normalizeEnvKey(envVar.key);
        if (key) merged.set(key, { ...envVar, key });
      });
      parsed.forEach((envVar) => {
        merged.set(envVar.key, { ...envVar, visible: false });
      });
      return Array.from(merged.values());
    });
    setBulkEnvText("");
    setNotice({
      type: "success",
      title: "Variables imported",
      message: `${parsed.length} variable${parsed.length === 1 ? "" : "s"} staged. Save changes to apply them.`,
    });
  }

  async function handleEnvFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    mergeEnvVarsFromText(text);
    event.target.value = "";
  }

  function updateEnvVar(index: number, patch: Partial<EnvVar>) {
    setEnvVars((prev) =>
      prev.map((envVar, idx) => (idx === index ? { ...envVar, ...patch } : envVar)),
    );
  }

  function removeEnvVar(index: number) {
    setEnvVars((prev) => prev.filter((_, idx) => idx !== index));
  }

  const tabs: { key: Tab; label: string; caption: string }[] = [
    { key: "general", label: "General", caption: "Identity and production URL" },
    { key: "build", label: "Build & Deploy", caption: "Branch, Dockerfile, and deploy triggers" },
    { key: "vars", label: "Variables", caption: "Runtime environment for future deployments" },
    { key: "danger", label: "Danger", caption: "Permanent service actions" },
  ];

  const activeTabMeta = tabs.find((tab) => tab.key === activeTab) ?? tabs[0];
  const currentStatus = project?.status || "active";

  return (
    <AppShell
      className="xl:h-[calc(100vh-64px)] xl:overflow-hidden"
      contentClassName="xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:py-5"
    >
      <NoticeToast notice={notice} onDismiss={dismiss} />
      <PageTitle
        eyebrow="Service Settings"
        title={loading ? "Loading..." : project?.repo_name || "Service"}
        description={project?.repo_url.replace("https://github.com/", "") ?? "Configure this Hatch service"}
        className="xl:mb-5 xl:shrink-0 xl:pb-5"
        actions={
          <>
            <Button variant="ghost" href={`/projects/${id}`}>
              Back
            </Button>
            {activeTab !== "danger" && (
              <>
                <Button
                  variant="secondary"
                  onClick={handleDiscard}
                  disabled={!canSave || saving}
                >
                  Discard
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  disabled={!canSave || saving}
                >
                  {saving ? "Saving" : "Save"}
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-7 flex flex-col gap-5 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between xl:mb-5 xl:shrink-0 xl:pb-5">
        <nav className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "shrink-0 cursor-pointer rounded-hatch border px-4 py-3 text-left transition-colors",
                  isActive
                    ? "border-line-strong bg-ink/[0.07] text-ink"
                    : "border-line text-muted hover:border-line-strong hover:bg-ink/[0.035] hover:text-ink",
                )}
              >
                <span className="block text-[11px] font-semibold uppercase tracking-[0.16em]">
                  {tab.label}
                </span>
                <span className="mt-1 block max-w-[210px] truncate text-xs text-faint">
                  {tab.caption}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="grid grid-cols-3 gap-5 sm:flex sm:gap-8">
          <MetaStat label="Status" value={currentStatus} />
          <MetaStat label="Branch" value={project?.branch || "-"} />
          <MetaStat
            label="Auto"
            value={project?.auto_deploy ? "on" : "off"}
          />
        </div>
      </div>

      <main className="grid gap-8 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 xl:pb-8">
          <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-faint">
              {activeTabMeta.label}
            </p>
            <h2 className="mt-2 text-2xl font-medium tracking-tight text-ink">
              {activeTabMeta.caption}
            </h2>
          </div>

          <div className="max-w-4xl">
            {activeTab === "general" && (
              <Section
                title="General"
                description="These settings identify the service inside Hatch. The repository and generated URL are locked for now."
              >
                <Field label="Service name" description="Used across the console, activity feed, and deployment screens.">
                  <Input value={projectName} onChange={setProjectName} placeholder="my-service" />
                </Field>

                <ReadOnlyGrid>
                  <StaticValue label="Repository URL" value={project?.repo_url ?? "-"} />
                  <StaticValue label="Production URL" value={productionUrl ?? "Not assigned"} asLink={Boolean(productionUrl)} />
                  <StaticValue label="Project ID" value={project?.id ?? "-"} />
                  <StaticValue
                    label="Created"
                    value={project ? formatDate(project.created_at) : "-"}
                  />
                </ReadOnlyGrid>
              </Section>
            )}

            {activeTab === "build" && (
              <Section
                title="Build & Deploy"
                description="These values are used when Hatch creates the next deployment for this service."
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Production branch" description="Auto-deploy watches this branch for pushes.">
                    <Input value={branch} onChange={setBranch} placeholder="main" />
                  </Field>
                  <Field label="Dockerfile directory" description='Use "./" for the repository root, or a folder like "./backend". Hatch builds the Dockerfile inside that directory.'>
                    <Input
                      value={dockerfilePath}
                      onChange={setDockerfilePath}
                      placeholder="./"
                    />
                  </Field>
                </div>

                <Field
                  label="Detected port"
                  description="Hatch detected this from the Dockerfile. Override only if the container listens somewhere else."
                >
                  <Input value={port} onChange={setPort} placeholder="80" type="number" />
                </Field>

                <div className="rounded-hatch border border-line bg-ink/[0.018] p-5">
                  <div className="flex items-center justify-between gap-5">
                    <div>
                      <p className="text-sm font-medium text-ink">
                        Auto-deploy
                      </p>
                      <p className="mt-1 max-w-lg text-sm leading-6 text-faint">
                        When enabled, Hatch queues a deployment when the configured branch receives a GitHub push.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={toggleAutoDeploy}
                      className={`flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border p-1 transition-colors ${
                        autoDeploy
                          ? "border-success/40 bg-success/15"
                          : "border-line-strong bg-base"
                      } ${autoDeploy ? "justify-end" : "justify-start"}`}
                      aria-pressed={autoDeploy}
                    >
                      <span
                        className={`h-4 w-4 rounded-full transition-colors ${
                          autoDeploy ? "bg-success" : "bg-faint"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </Section>
            )}

            {activeTab === "vars" && (
              <Section
                title="Environment Variables"
                description="Variables are stored at the project level and snapshotted into each new deployment."
              >
                <div className="overflow-hidden rounded-hatch border border-line bg-ink/[0.018]">
                  <div className="grid grid-cols-[minmax(120px,220px)_1fr_92px] border-b border-line px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
                    <span>Key</span>
                    <span>Value</span>
                    <span className="text-right">Actions</span>
                  </div>

                  {envVars.length === 0 ? (
                    <p className="px-4 py-6 font-mono text-sm text-faint">
                      No variables defined.
                    </p>
                  ) : (
                    <div className="divide-y divide-line">
                      {envVars.map((envVar, index) => (
                        <div
                          key={`${envVar.key}-${index}`}
                          className="grid grid-cols-[minmax(120px,220px)_1fr_92px] items-center gap-3 px-4 py-3"
                        >
                          <input
                            value={envVar.key}
                            onChange={(event) =>
                              updateEnvVar(index, {
                                key: normalizeEnvKey(event.target.value),
                              })
                            }
                            className="min-w-0 bg-transparent font-mono text-sm text-ink outline-none placeholder:text-faint"
                            placeholder="KEY"
                          />
                          <input
                            value={envVar.value}
                            onChange={(event) =>
                              updateEnvVar(index, { value: event.target.value })
                            }
                            type={envVar.visible ? "text" : "password"}
                            className="min-w-0 bg-transparent font-mono text-sm text-muted outline-none placeholder:text-faint"
                            placeholder="value"
                          />
                          <div className="flex justify-end gap-3">
                            <button
                              onClick={() =>
                                updateEnvVar(index, { visible: !envVar.visible })
                              }
                              className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.14em] text-faint hover:text-ink"
                            >
                              {envVar.visible ? "Hide" : "Show"}
                            </button>
                            <button
                              onClick={() => removeEnvVar(index)}
                              className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.14em] text-danger hover:text-danger"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-hatch border border-line bg-base p-5">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
                    Add variable
                  </p>
                  <div className="grid gap-3 md:grid-cols-[minmax(120px,220px)_1fr_auto]">
                    <input
                      value={newKey}
                      onChange={(event) => setNewKey(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && addEnvVar()}
                      placeholder="VARIABLE_NAME"
                      className="rounded-hatch border border-line bg-base px-3 py-2.5 font-mono text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-line-strong"
                    />
                    <input
                      value={newValue}
                      onChange={(event) => setNewValue(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && addEnvVar()}
                      placeholder="value"
                      type="password"
                      className="rounded-hatch border border-line bg-base px-3 py-2.5 font-mono text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-line-strong"
                    />
                    <button
                      onClick={addEnvVar}
                      disabled={!normalizeEnvKey(newKey)}
                      className="cursor-pointer rounded-hatch border border-line-strong px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="rounded-hatch border border-line bg-base p-5">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
                        Bulk import
                      </p>
                      <p className="mt-1 text-sm leading-6 text-faint">
                        Paste a .env file or upload one. Imported keys replace matching staged keys.
                      </p>
                    </div>
                    <label className="shrink-0 cursor-pointer rounded-hatch border border-line-strong px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:border-line-strong hover:text-ink">
                      Upload file
                      <input
                        type="file"
                        accept=".env,.txt,text/plain"
                        onChange={handleEnvFile}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <textarea
                    value={bulkEnvText}
                    onChange={(event) => setBulkEnvText(event.target.value)}
                    placeholder={"DATABASE_URL=postgres://...\nREDIS_URL=redis://..."}
                    className="min-h-32 w-full resize-y rounded-hatch border border-line bg-base px-3 py-2.5 font-mono text-sm leading-relaxed text-ink outline-none transition-colors placeholder:text-faint focus:border-line-strong"
                  />
                  <button
                    onClick={() => mergeEnvVarsFromText(bulkEnvText)}
                    disabled={!bulkEnvText.trim()}
                    className="mt-3 cursor-pointer rounded-hatch border border-line-strong px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Import pasted variables
                  </button>
                </div>
              </Section>
            )}

            {activeTab === "danger" && (
              <Section
                title="Danger Zone"
                description="Permanent actions for this service. This area should stay small and deliberate."
              >
                <div className="mb-5 rounded-hatch border border-line bg-ink/[0.018] p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-medium text-ink">
                        Runtime control
                      </p>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-faint">
                        Suspend stops the ECS service by setting desired count
                        to 0. Resume starts it again without deleting project
                        settings, history, or environment variables.
                      </p>
                      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
                        Status{" "}
                        <span className="text-ink">
                          {project?.status || "active"}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        onClick={() => handleServiceControl("suspend")}
                        disabled={
                          serviceActioning ||
                          project?.status === "suspended" ||
                          project?.status === "suspending" ||
                          project?.status === "deleting" ||
                          project?.status === "resume_failed"
                        }
                        className="cursor-pointer rounded-hatch border border-warning/20 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-warning transition-colors hover:border-warning/40 hover:bg-warning/5 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        {project?.status === "suspend_failed"
                          ? "Retry suspend"
                          : project?.status === "suspending"
                          ? "Suspending"
                          : "Suspend"}
                      </button>
                      <button
                        onClick={() => handleServiceControl("resume")}
                        disabled={
                          serviceActioning ||
                          project?.status === "active" ||
                          project?.status === "resuming" ||
                          project?.status === "deleting" ||
                          project?.status === "suspend_failed"
                        }
                        className="cursor-pointer rounded-hatch border border-success/20 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-success transition-colors hover:border-success/40 hover:bg-success/5 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        {project?.status === "resume_failed"
                          ? "Retry resume"
                          : project?.status === "resuming"
                            ? "Resuming"
                            : "Resume"}
                      </button>
                    </div>
                  </div>
                  {(project?.status === "suspend_failed" ||
                    project?.status === "resume_failed") && (
                    <p className="mt-4 text-sm leading-6 text-danger">
                      The last runtime operation failed. Check the deployer
                      worker logs, then retry the action.
                    </p>
                  )}
                </div>

                <div className="rounded-hatch border border-danger/20 bg-danger/[0.025] p-5">
                  <p className="text-sm font-medium text-ink">
                    Delete service
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-faint">
                    This marks the service for deletion, queues cloud cleanup, and removes the project after the AWS resources are gone.
                  </p>
                  <p className="mt-5 text-xs font-medium tracking-[0.04em] text-faint">
                    Type <span className="text-ink">{project?.repo_name}</span> to confirm
                  </p>
                  <input
                    value={deleteConfirm}
                    onChange={(event) => setDeleteConfirm(event.target.value)}
                    placeholder={project?.repo_name}
                    className="mt-2 w-full rounded-hatch border border-danger/15 bg-base px-3 py-2.5 font-mono text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-danger/40"
                  />
                  <button
                    onClick={() => handleDelete()}
                    disabled={deleteConfirm !== project?.repo_name || deleting}
                    className="mt-4 w-full cursor-pointer rounded-hatch border border-danger/25 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-danger transition-colors hover:border-danger/45 hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {deleting ? "Queueing cleanup" : "Delete service"}
                  </button>
                  {project?.status === "delete_failed" && (
                    <div className="mt-4 flex flex-col gap-3 rounded-hatch border border-danger/15 bg-base p-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm leading-6 text-danger">
                        Previous cleanup failed. Check the deployer worker logs,
                        then retry the cleanup job.
                      </p>
                      <button
                        onClick={() => handleDelete({ retry: true })}
                        disabled={deleting}
                        className="shrink-0 cursor-pointer rounded-hatch border border-danger/25 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-danger transition-colors hover:border-danger/45 hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        {deleting ? "Retrying" : "Retry cleanup"}
                      </button>
                    </div>
                  )}
                </div>
              </Section>
            )}
          </div>
        </section>

        <aside className="space-y-7 xl:pb-8">
          <SidePanel title="Service">
            <div className="space-y-4">
              <MetaRow label="Project ID" value={project?.id ?? "-"} />
              <MetaRow label="Created" value={project ? formatDate(project.created_at) : "-"} />
              <MetaRow label="Production" value={productionUrl ? productionUrl.replace(/^https?:\/\//, "") : "-"} />
              <div className="pt-2">
                <StatusText tone={projectStatusTone(currentStatus)}>
                  {currentStatus}
                </StatusText>
              </div>
            </div>
          </SidePanel>

          <SidePanel title="Applies On Next Deploy">
            <p className="text-sm leading-6 text-faint">
              Build settings and environment variables are saved immediately, then snapshotted into the next deployment.
            </p>
            <div className="mt-4">
              <Button href={`/projects/${id}`} variant="secondary" className="w-full">
                View service
              </Button>
            </div>
          </SidePanel>
        </aside>
      </main>
    </AppShell>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div className="border-b border-line pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          {title}
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-faint">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </span>
      <span className="block text-sm leading-6 text-faint">
        {description}
      </span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-hatch border border-line bg-base px-3 py-2.5 font-mono text-sm text-ink outline-none transition-colors placeholder:text-faint hover:border-line-strong focus:border-line-strong"
    />
  );
}

function ReadOnlyGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
        {label}
      </p>
      <p className="truncate font-mono text-sm text-ink">{value}</p>
    </div>
  );
}

function SidePanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-y border-line py-5">
      <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function StaticValue({
  label,
  value,
  asLink = false,
}: {
  label: string;
  value: string;
  asLink?: boolean;
}) {
  return (
    <div className="rounded-hatch border border-line bg-ink/[0.018] p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
        {label}
      </p>
      {asLink ? (
        <a
          href={safeHttpUrl(value) ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate font-mono text-sm text-success hover:underline"
        >
          {value.replace(/^https?:\/\//, "")}
        </a>
      ) : (
        <p className="truncate font-mono text-sm text-muted">{value}</p>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
        {label}
      </span>
      <span className="truncate font-mono text-xs text-muted">{value}</span>
    </div>
  );
}

function normalizeEnvKey(key: string) {
  return key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_");
}

function projectStatusTone(
  status?: string,
): "default" | "success" | "warning" | "danger" | "muted" {
  if (!status || status === "active") return "success";
  if (status === "suspended") return "muted";
  if (status === "suspending" || status === "resuming" || status === "deleting") {
    return "warning";
  }
  if (status.endsWith("_failed")) return "danger";
  return "default";
}

function parseEnvFile(text: string): EnvVar[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
      const separatorIndex = withoutExport.indexOf("=");
      if (separatorIndex < 1) return null;

      const key = normalizeEnvKey(withoutExport.slice(0, separatorIndex));
      const rawValue = withoutExport.slice(separatorIndex + 1).trim();
      const value = stripEnvQuotes(rawValue);
      return key ? { key, value, visible: false } : null;
    })
    .filter((envVar): envVar is EnvVar => Boolean(envVar));
}

function stripEnvQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function normalizeEnvVars(envVars: EnvVar[]) {
  return envVars
    .map((envVar) => ({
      key: normalizeEnvKey(envVar.key),
      value: envVar.value,
    }))
    .filter((envVar) => envVar.key)
    .sort((a, b) => a.key.localeCompare(b.key));
}

function rootFromDockerfilePath(path?: string) {
  const cleaned = (path || "Dockerfile").replace(/^\.?\//, "");
  if (cleaned === "Dockerfile") return "./";
  if (cleaned.endsWith("/Dockerfile")) {
    return `./${cleaned.slice(0, -"/Dockerfile".length)}`;
  }
  return cleaned.startsWith("./") ? cleaned : `./${cleaned}`;
}

function dockerfilePathFromRoot(root: string) {
  const cleaned = root.trim().replace(/^\.?\//, "").replace(/\/+$/, "");
  return cleaned ? `${cleaned}/Dockerfile` : "Dockerfile";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
