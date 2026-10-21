import { useNavigate, useParams } from "react-router";
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  apiFetch,
  deploymentUrl,
  productionHost,
  readApiError,
  redirectIfUnauthorized,
} from "@/lib/api";
import {
  AppShell,
  Button,
  PageTitle,
  StatusText,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  NoticeToast,
  type NoticePayload,
} from "@/components/NoticeToast";

type Tab = "general" | "build" | "vars" | "danger";
interface NullableString {
  String?: string;
  Valid?: boolean;
}

interface Project {
  id: string;
  repo_name: string;
  repo_url: string;
  branch: string;
  dockerfile_path: string;
  port: number;
  subdomain: NullableString | string | null;
  auto_deploy: boolean;
  status?: string;
  delete_error?: NullableString | string | null;
  created_at: string;
}

interface EnvVar {
  key: string;
  value: string;
  visible: boolean;
}

interface ProjectEnvVarResponse {
  key: string;
  value: string;
}

export default function ProjectSettingsClient() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [serviceActioning, setServiceActioning] = useState(false);
  const [notice, setNotice] = useState<NoticePayload | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const [projectName, setProjectName] = useState("");
  const [branch, setBranch] = useState("main");
  const [dockerfilePath, setDockerfilePath] = useState("Dockerfile");
  const [port, setPort] = useState("80");
  const [autoDeploy, setAutoDeploy] = useState(true);

  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [envVarsBaseline, setEnvVarsBaseline] = useState<EnvVar[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [bulkEnvText, setBulkEnvText] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadSettings() {
      setLoading(true);
      try {
        const [projectRes, envRes] = await Promise.all([
          apiFetch(`/api/projects/${id}`),
          apiFetch(`/api/projects/${id}/env-vars`),
        ]);

        if (
          redirectIfUnauthorized(projectRes, navigate) ||
          redirectIfUnauthorized(envRes, navigate)
        ) {
          return;
        }
        if (!projectRes.ok) throw new Error("failed to load project");

        const projectData: Project = await projectRes.json();
        const envData: ProjectEnvVarResponse[] = envRes.ok
          ? await envRes.json()
          : [];

        if (!alive) return;
        setProject(projectData);
        hydrateProjectForm(projectData);

        const nextEnvVars = Array.isArray(envData)
          ? envData.map((envVar) => ({
              key: envVar.key,
              value: envVar.value,
              visible: false,
            }))
          : [];
        setEnvVars(nextEnvVars);
        setEnvVarsBaseline(nextEnvVars);
      } catch {
        if (!alive) return;
        setNotice({
          type: "error",
          title: "Settings unavailable",
          message: "Hatch could not load this service settings page.",
        });
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadSettings();
    return () => {
      alive = false;
    };
  }, [id, navigate]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const clearProjectCaches = useCallback(function clearProjectCaches() {
    localStorage.removeItem(`hatch_project_${id}`);
    localStorage.removeItem("hatch_projects_cache");
    localStorage.removeItem("hatch_insights_cache");
  }, [id]);

  useEffect(() => {
    if (!project || !isProjectTransitioning(project.status)) return;

    const interval = window.setInterval(async () => {
      try {
        const res = await apiFetch(`/api/projects/${id}`);
        if (redirectIfUnauthorized(res, navigate)) return;
        if (!res.ok) return;
        const nextProject: Project = await res.json();
        setProject(nextProject);
        if (!isProjectTransitioning(nextProject.status)) {
          clearProjectCaches();
        }
      } catch {
        // Try again on the next poll.
      }
    }, 3500);

    return () => window.clearInterval(interval);
  }, [clearProjectCaches, id, project, navigate]);

  const productionUrl = useMemo(() => {
    const subdomain = subdomainValue(project?.subdomain);
    return deploymentUrl(productionHost(subdomain));
  }, [project?.subdomain]);

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

  function hydrateProjectForm(nextProject: Project) {
    setProjectName(nextProject.repo_name ?? "");
    setBranch(nextProject.branch ?? "main");
    setDockerfilePath(rootFromDockerfilePath(nextProject.dockerfile_path));
    setPort(String(nextProject.port ?? 80));
    setAutoDeploy(Boolean(nextProject.auto_deploy));
  }

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
      setProject(updatedProject);
      hydrateProjectForm(updatedProject);
      clearProjectCaches();
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

      const data: ProjectEnvVarResponse[] = await res.json();
      const next = Array.isArray(data)
        ? data.map((envVar) => ({
            key: envVar.key,
            value: envVar.value,
            visible: false,
          }))
        : [];
      setEnvVars(next);
      setEnvVarsBaseline(next);
      clearProjectCaches();
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
      setEnvVars(envVarsBaseline);
      setNewKey("");
      setNewValue("");
      return;
    }
    if (project) hydrateProjectForm(project);
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
      clearProjectCaches();
      setNotice({
        type: "success",
        title: retry ? "Cleanup retry queued" : "Deletion queued",
        message: retry
          ? "Hatch is retrying the failed cloud cleanup."
          : "Hatch will remove the service after cloud cleanup finishes.",
      });
      navigate("/console");
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
      setProject(nextProject);
      clearProjectCaches();
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
      <NoticeToast notice={notice} onDismiss={() => setNotice(null)} />
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

      <div className="mb-7 flex flex-col gap-5 border-b border-white/[0.08] pb-6 lg:flex-row lg:items-end lg:justify-between xl:mb-5 xl:shrink-0 xl:pb-5">
        <nav className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "shrink-0 cursor-pointer rounded-lg border px-4 py-3 text-left transition-colors",
                  isActive
                    ? "border-white/20 bg-white/[0.07] text-white"
                    : "border-white/[0.08] text-zinc-500 hover:border-white/15 hover:bg-white/[0.035] hover:text-zinc-300",
                )}
              >
                <span className="block text-[10px] font-semibold uppercase tracking-[0.16em]">
                  {tab.label}
                </span>
                <span className="mt-1 block max-w-[210px] truncate text-xs text-zinc-600">
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-600">
              {activeTabMeta.label}
            </p>
            <h2 className="mt-2 text-2xl font-medium tracking-tight text-white">
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

                <div className="rounded-xl border border-white/[0.08] bg-white/[0.018] p-5">
                  <div className="flex items-center justify-between gap-5">
                    <div>
                      <p className="text-sm font-medium text-zinc-200">
                        Auto-deploy
                      </p>
                      <p className="mt-1 max-w-lg text-sm leading-6 text-zinc-600">
                        When enabled, Hatch queues a deployment when the configured branch receives a GitHub push.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAutoDeploy((value) => !value)}
                      className={`flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border p-1 transition-colors ${
                        autoDeploy
                          ? "border-[#5cc98f]/40 bg-[#5cc98f]/15"
                          : "border-white/[0.12] bg-black"
                      } ${autoDeploy ? "justify-end" : "justify-start"}`}
                      aria-pressed={autoDeploy}
                    >
                      <span
                        className={`h-4 w-4 rounded-full transition-colors ${
                          autoDeploy ? "bg-[#5cc98f]" : "bg-zinc-600"
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
                <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.018]">
                  <div className="grid grid-cols-[minmax(120px,220px)_1fr_92px] border-b border-white/[0.08] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                    <span>Key</span>
                    <span>Value</span>
                    <span className="text-right">Actions</span>
                  </div>

                  {envVars.length === 0 ? (
                    <p className="px-4 py-6 font-mono text-sm text-zinc-700">
                      No variables defined.
                    </p>
                  ) : (
                    <div className="divide-y divide-white/[0.06]">
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
                            className="min-w-0 bg-transparent font-mono text-sm text-zinc-300 outline-none placeholder:text-zinc-800"
                            placeholder="KEY"
                          />
                          <input
                            value={envVar.value}
                            onChange={(event) =>
                              updateEnvVar(index, { value: event.target.value })
                            }
                            type={envVar.visible ? "text" : "password"}
                            className="min-w-0 bg-transparent font-mono text-sm text-zinc-500 outline-none placeholder:text-zinc-800"
                            placeholder="value"
                          />
                          <div className="flex justify-end gap-3">
                            <button
                              onClick={() =>
                                updateEnvVar(index, { visible: !envVar.visible })
                              }
                              className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600 hover:text-zinc-300"
                            >
                              {envVar.visible ? "Hide" : "Show"}
                            </button>
                            <button
                              onClick={() => removeEnvVar(index)}
                              className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d86666] hover:text-[#e18a8a]"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-white/[0.08] bg-black p-5">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                    Add variable
                  </p>
                  <div className="grid gap-3 md:grid-cols-[minmax(120px,220px)_1fr_auto]">
                    <input
                      value={newKey}
                      onChange={(event) => setNewKey(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && addEnvVar()}
                      placeholder="VARIABLE_NAME"
                      className="rounded-lg border border-white/[0.09] bg-black px-3 py-2.5 font-mono text-sm text-zinc-300 outline-none transition-colors placeholder:text-zinc-800 focus:border-white/30"
                    />
                    <input
                      value={newValue}
                      onChange={(event) => setNewValue(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && addEnvVar()}
                      placeholder="value"
                      type="password"
                      className="rounded-lg border border-white/[0.09] bg-black px-3 py-2.5 font-mono text-sm text-zinc-300 outline-none transition-colors placeholder:text-zinc-800 focus:border-white/30"
                    />
                    <button
                      onClick={addEnvVar}
                      disabled={!normalizeEnvKey(newKey)}
                      className="cursor-pointer rounded-md border border-white/[0.11] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-white/[0.08] bg-black p-5">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                        Bulk import
                      </p>
                      <p className="mt-1 text-sm leading-6 text-zinc-600">
                        Paste a .env file or upload one. Imported keys replace matching staged keys.
                      </p>
                    </div>
                    <label className="shrink-0 cursor-pointer rounded-md border border-white/[0.11] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:border-white/25 hover:text-white">
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
                    className="min-h-32 w-full resize-y rounded-lg border border-white/[0.09] bg-black px-3 py-2.5 font-mono text-sm leading-relaxed text-zinc-300 outline-none transition-colors placeholder:text-zinc-800 focus:border-white/30"
                  />
                  <button
                    onClick={() => mergeEnvVarsFromText(bulkEnvText)}
                    disabled={!bulkEnvText.trim()}
                    className="mt-3 cursor-pointer rounded-md border border-white/[0.11] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
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
                <div className="mb-5 rounded-xl border border-white/[0.08] bg-white/[0.018] p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-200">
                        Runtime control
                      </p>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
                        Suspend stops the ECS service by setting desired count
                        to 0. Resume starts it again without deleting project
                        settings, history, or environment variables.
                      </p>
                      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                        Status{" "}
                        <span className="text-zinc-300">
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
                        className="cursor-pointer rounded-md border border-[#d8ad4f]/20 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#d8ad4f] transition-colors hover:border-[#d8ad4f]/40 hover:bg-[#d8ad4f]/5 disabled:cursor-not-allowed disabled:opacity-30"
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
                        className="cursor-pointer rounded-md border border-[#5cc98f]/20 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5cc98f] transition-colors hover:border-[#5cc98f]/40 hover:bg-[#5cc98f]/5 disabled:cursor-not-allowed disabled:opacity-30"
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
                    <p className="mt-4 text-sm leading-6 text-[#d86666]">
                      The last runtime operation failed. Check the deployer
                      worker logs, then retry the action.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-[#d86666]/20 bg-[#d86666]/[0.025] p-5">
                  <p className="text-sm font-medium text-zinc-200">
                    Delete service
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
                    This marks the service for deletion, queues cloud cleanup, and removes the project after the AWS resources are gone.
                  </p>
                  <p className="mt-5 text-xs font-medium tracking-[0.04em] text-zinc-600">
                    Type <span className="text-zinc-300">{project?.repo_name}</span> to confirm
                  </p>
                  <input
                    value={deleteConfirm}
                    onChange={(event) => setDeleteConfirm(event.target.value)}
                    placeholder={project?.repo_name}
                    className="mt-2 w-full rounded-lg border border-[#d86666]/15 bg-black px-3 py-2.5 font-mono text-sm text-zinc-300 outline-none transition-colors placeholder:text-zinc-800 focus:border-[#d86666]/40"
                  />
                  <button
                    onClick={() => handleDelete()}
                    disabled={deleteConfirm !== project?.repo_name || deleting}
                    className="mt-4 w-full cursor-pointer rounded-md border border-[#d86666]/25 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#d86666] transition-colors hover:border-[#d86666]/45 hover:bg-[#d86666]/5 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {deleting ? "Queueing cleanup" : "Delete service"}
                  </button>
                  {project?.status === "delete_failed" && (
                    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-[#d86666]/15 bg-black p-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm leading-6 text-[#d86666]">
                        Previous cleanup failed. Check the deployer worker logs,
                        then retry the cleanup job.
                      </p>
                      <button
                        onClick={() => handleDelete({ retry: true })}
                        disabled={deleting}
                        className="shrink-0 cursor-pointer rounded-md border border-[#d86666]/25 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#d86666] transition-colors hover:border-[#d86666]/45 hover:bg-[#d86666]/5 disabled:cursor-not-allowed disabled:opacity-30"
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
            <p className="text-sm leading-6 text-zinc-600">
              Build settings and environment variables are saved immediately, then snapshotted into the next deployment.
            </p>
            <div className="mt-4">
              <Button href={`/projects/${id}`} variant="secondary" className="w-full">
                View Deployment Console
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
      <div className="border-b border-white/[0.08] pb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          {title}
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
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
      <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </span>
      <span className="block text-sm leading-6 text-zinc-600">
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
      className="w-full rounded-lg border border-white/[0.09] bg-black px-3 py-2.5 font-mono text-sm text-zinc-300 outline-none transition-colors placeholder:text-zinc-800 hover:border-white/15 focus:border-white/30"
    />
  );
}

function ReadOnlyGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
        {label}
      </p>
      <p className="truncate font-mono text-sm text-zinc-300">{value}</p>
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
    <section className="border-y border-white/[0.08] py-5">
      <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
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
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.018] p-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
        {label}
      </p>
      {asLink ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate font-mono text-sm text-[#5cc98f] hover:underline"
        >
          {value.replace(/^https?:\/\//, "")}
        </a>
      ) : (
        <p className="truncate font-mono text-sm text-zinc-400">{value}</p>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
        {label}
      </span>
      <span className="truncate font-mono text-xs text-zinc-500">{value}</span>
    </div>
  );
}

function normalizeEnvKey(key: string) {
  return key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_");
}

function isProjectTransitioning(status?: string) {
  return status === "suspending" || status === "resuming" || status === "deleting";
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

function subdomainValue(subdomain?: Project["subdomain"]) {
  if (!subdomain) return null;
  if (typeof subdomain === "string") return subdomain;
  if (subdomain.Valid && subdomain.String) return subdomain.String;
  return null;
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
