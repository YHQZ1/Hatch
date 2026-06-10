"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  apiFetch,
  deploymentUrl,
  readApiError,
  redirectIfUnauthorized,
} from "@/app/lib/api";

type Tab = "general" | "build" | "vars" | "danger";
type NoticeType = "success" | "error" | "info";

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

interface Notice {
  type: NoticeType;
  title: string;
  message?: string;
}

export default function ProjectSettingsClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [serviceActioning, setServiceActioning] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
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
          redirectIfUnauthorized(projectRes, router) ||
          redirectIfUnauthorized(envRes, router)
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
  }, [id, router]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!project || !isProjectTransitioning(project.status)) return;

    const interval = window.setInterval(async () => {
      try {
        const res = await apiFetch(`/api/projects/${id}`);
        if (redirectIfUnauthorized(res, router)) return;
        if (!res.ok) return;
        const nextProject: Project = await res.json();
        setProject(nextProject);
        if (!isProjectTransitioning(nextProject.status)) {
          clearProjectCaches();
        }
      } catch {}
    }, 3500);

    return () => window.clearInterval(interval);
  }, [id, project, router]);

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

  function clearProjectCaches() {
    localStorage.removeItem(`hatch_project_${id}`);
    localStorage.removeItem("hatch_projects_cache");
    localStorage.removeItem("hatch_insights_cache");
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
      if (redirectIfUnauthorized(res, router)) return;
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
      if (redirectIfUnauthorized(res, router)) return;
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
      if (redirectIfUnauthorized(res, router)) return;
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
      router.push("/console");
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
      if (redirectIfUnauthorized(res, router)) return;
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

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-black text-zinc-400">
      <SettingsToast notice={notice} onDismiss={() => setNotice(null)} />

      <aside className="hidden w-[300px] shrink-0 border-r border-[#171717] bg-[#030303] md:flex md:flex-col">
        <div className="border-b border-[#171717] px-5 py-5">
          <Link
            href={`/projects/${id}`}
            className="group mb-5 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-700 transition-colors hover:text-zinc-400"
          >
            <span className="inline-block transition-transform group-hover:-translate-x-0.5">
              -
            </span>
            Deployment
          </Link>
          <p className="text-[8px] font-bold uppercase tracking-[0.24em] text-zinc-800">
            Service settings
          </p>
          <h1 className="mt-2 truncate text-[17px] font-semibold tracking-tight text-white">
            {loading ? "Loading..." : project?.repo_name}
          </h1>
          <p className="mt-1 truncate font-mono text-[10px] text-zinc-700">
            {project?.repo_url.replace("https://github.com/", "") ?? ""}
          </p>
        </div>

        <nav className="flex-1 px-2 py-3">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full cursor-pointer border-l px-3 py-3 text-left transition-colors ${
                  isActive
                    ? "border-l-white bg-white/[0.035]"
                    : "border-l-transparent hover:bg-white/[0.02]"
                }`}
              >
                <span
                  className={`block text-[10px] font-bold uppercase tracking-[0.16em] ${
                    isActive ? "text-zinc-200" : "text-zinc-600"
                  }`}
                >
                  {tab.label}
                </span>
                <span className="mt-1 block text-[10px] leading-relaxed text-zinc-800">
                  {tab.caption}
                </span>
              </button>
            );
          })}
        </nav>

        {project && (
          <div className="border-t border-[#171717] px-5 py-4">
            <MetaRow label="Project ID" value={project.id.slice(0, 8)} />
            <MetaRow label="Branch" value={project.branch} />
            <MetaRow label="Auto deploy" value={project.auto_deploy ? "on" : "off"} />
          </div>
        )}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-black">
        <div className="shrink-0 border-b border-[#171717] bg-[#030303] px-5 py-4 md:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-zinc-800">
                {activeTabMeta.label}
              </p>
              <h2 className="mt-1 text-[20px] font-semibold tracking-tight text-zinc-100">
                {activeTabMeta.caption}
              </h2>
            </div>

            {activeTab !== "danger" && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDiscard}
                  disabled={!canSave || saving}
                  className="cursor-pointer text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-700 transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Discard
                </button>
                <button
                  onClick={handleSave}
                  disabled={!canSave || saving}
                  className="cursor-pointer border border-zinc-700 bg-white px-4 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:border-zinc-900 disabled:bg-zinc-900 disabled:text-zinc-700"
                >
                  {saving ? "Saving" : "Save changes"}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-7 md:px-8 lg:px-10">
          <div className="max-w-3xl">
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

                <div className="border border-[#181818] bg-[#030303] p-4">
                  <div className="flex items-center justify-between gap-5">
                    <div>
                      <p className="text-[11px] font-semibold text-zinc-300">
                        Auto-deploy
                      </p>
                      <p className="mt-1 max-w-lg text-[11px] leading-relaxed text-zinc-700">
                        When enabled, Hatch queues a deployment when the configured branch receives a GitHub push.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAutoDeploy((value) => !value)}
                      className={`flex h-7 w-12 shrink-0 cursor-pointer items-center border p-1 transition-colors ${
                        autoDeploy
                          ? "border-[#74c69d]/40 bg-[#74c69d]/15"
                          : "border-[#242424] bg-black"
                      } ${autoDeploy ? "justify-end" : "justify-start"}`}
                      aria-pressed={autoDeploy}
                    >
                      <span
                        className={`h-4 w-4 transition-colors ${
                          autoDeploy ? "bg-[#74c69d]" : "bg-zinc-600"
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
                <div className="border border-[#181818] bg-[#030303]">
                  <div className="grid grid-cols-[minmax(120px,220px)_1fr_92px] border-b border-[#181818] px-4 py-3 text-[8px] font-bold uppercase tracking-[0.18em] text-zinc-800">
                    <span>Key</span>
                    <span>Value</span>
                    <span className="text-right">Actions</span>
                  </div>

                  {envVars.length === 0 ? (
                    <p className="px-4 py-6 font-mono text-[11px] text-zinc-700">
                      No variables defined.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#101010]">
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
                            className="min-w-0 bg-transparent font-mono text-[11px] text-zinc-400 outline-none placeholder:text-zinc-800"
                            placeholder="KEY"
                          />
                          <input
                            value={envVar.value}
                            onChange={(event) =>
                              updateEnvVar(index, { value: event.target.value })
                            }
                            type={envVar.visible ? "text" : "password"}
                            className="min-w-0 bg-transparent font-mono text-[11px] text-zinc-500 outline-none placeholder:text-zinc-800"
                            placeholder="value"
                          />
                          <div className="flex justify-end gap-3">
                            <button
                              onClick={() =>
                                updateEnvVar(index, { visible: !envVar.visible })
                              }
                              className="cursor-pointer text-[8px] font-bold uppercase tracking-[0.14em] text-zinc-700 hover:text-zinc-300"
                            >
                              {envVar.visible ? "Hide" : "Show"}
                            </button>
                            <button
                              onClick={() => removeEnvVar(index)}
                              className="cursor-pointer text-[8px] font-bold uppercase tracking-[0.14em] text-[#c56b6b] hover:text-[#d88a8a]"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border border-[#181818] bg-black p-4">
                  <p className="mb-3 text-[8px] font-bold uppercase tracking-[0.18em] text-zinc-800">
                    Add variable
                  </p>
                  <div className="grid gap-3 md:grid-cols-[minmax(120px,220px)_1fr_auto]">
                    <input
                      value={newKey}
                      onChange={(event) => setNewKey(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && addEnvVar()}
                      placeholder="VARIABLE_NAME"
                      className="border border-[#181818] bg-[#030303] px-3 py-2.5 font-mono text-[11px] text-zinc-400 outline-none transition-colors placeholder:text-zinc-800 focus:border-zinc-700"
                    />
                    <input
                      value={newValue}
                      onChange={(event) => setNewValue(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && addEnvVar()}
                      placeholder="value"
                      type="password"
                      className="border border-[#181818] bg-[#030303] px-3 py-2.5 font-mono text-[11px] text-zinc-400 outline-none transition-colors placeholder:text-zinc-800 focus:border-zinc-700"
                    />
                    <button
                      onClick={addEnvVar}
                      disabled={!normalizeEnvKey(newKey)}
                      className="cursor-pointer border border-[#242424] px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="border border-[#181818] bg-black p-4">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-zinc-800">
                        Bulk import
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-zinc-700">
                        Paste a .env file or upload one. Imported keys replace matching staged keys.
                      </p>
                    </div>
                    <label className="shrink-0 cursor-pointer border border-[#242424] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300">
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
                    className="min-h-32 w-full resize-y border border-[#181818] bg-[#030303] px-3 py-2.5 font-mono text-[11px] leading-relaxed text-zinc-400 outline-none transition-colors placeholder:text-zinc-800 focus:border-zinc-700"
                  />
                  <button
                    onClick={() => mergeEnvVarsFromText(bulkEnvText)}
                    disabled={!bulkEnvText.trim()}
                    className="mt-3 cursor-pointer border border-[#242424] px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
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
                <div className="mb-5 border border-[#1d1d1d] bg-[#030303] p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-[13px] font-semibold text-zinc-200">
                        Runtime control
                      </p>
                      <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-zinc-600">
                        Suspend stops the ECS service by setting desired count
                        to 0. Resume starts it again without deleting project
                        settings, history, or environment variables.
                      </p>
                      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-700">
                        Status{" "}
                        <span className="text-zinc-400">
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
                        className="cursor-pointer border border-[#3a2d18] px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.15em] text-[#b8872f] transition-colors hover:border-[#b8872f] hover:text-[#d6a34a] disabled:cursor-not-allowed disabled:opacity-30"
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
                        className="cursor-pointer border border-[#244837] px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.15em] text-[#74c69d] transition-colors hover:border-[#74c69d] hover:text-[#91d9b4] disabled:cursor-not-allowed disabled:opacity-30"
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
                    <p className="mt-4 text-[11px] leading-relaxed text-[#c56b6b]">
                      The last runtime operation failed. Check the deployer
                      worker logs, then retry the action.
                    </p>
                  )}
                </div>

                <div className="border border-[#2a1515] bg-[#050202] p-5">
                  <p className="text-[13px] font-semibold text-zinc-200">
                    Delete service
                  </p>
                  <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-zinc-600">
                    This marks the service for deletion, queues cloud cleanup, and removes the project after the AWS resources are gone.
                  </p>
                  <p className="mt-5 text-[9px] font-bold tracking-[0.04em] text-zinc-700">
                    Type <span className="text-zinc-300">{project?.repo_name}</span> to confirm
                  </p>
                  <input
                    value={deleteConfirm}
                    onChange={(event) => setDeleteConfirm(event.target.value)}
                    placeholder={project?.repo_name}
                    className="mt-2 w-full border border-[#231313] bg-black px-3 py-2.5 font-mono text-[11px] text-zinc-400 outline-none transition-colors placeholder:text-zinc-800 focus:border-[#5a2525]"
                  />
                  <button
                    onClick={() => handleDelete()}
                    disabled={deleteConfirm !== project?.repo_name || deleting}
                    className="mt-4 w-full cursor-pointer border border-[#3a1b1b] px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.15em] text-[#c56b6b] transition-colors hover:border-[#6b2d2d] hover:text-[#d88a8a] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {deleting ? "Queueing cleanup" : "Delete service"}
                  </button>
                  {project?.status === "delete_failed" && (
                    <div className="mt-4 flex flex-col gap-3 border border-[#2b1919] bg-[#080303] p-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[11px] leading-relaxed text-[#c56b6b]">
                        Previous cleanup failed. Check the deployer worker logs,
                        then retry the cleanup job.
                      </p>
                      <button
                        onClick={() => handleDelete({ retry: true })}
                        disabled={deleting}
                        className="shrink-0 cursor-pointer border border-[#4a2020] px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.15em] text-[#d88a8a] transition-colors hover:border-[#7a2a2a] hover:text-[#f0a0a0] disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        {deleting ? "Retrying" : "Retry cleanup"}
                      </button>
                    </div>
                  )}
                </div>
              </Section>
            )}
          </div>
        </div>
      </main>
    </div>
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
      <div className="border-b border-[#181818] pb-4">
        <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-zinc-800">
          {title}
        </p>
        <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-zinc-600">
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
      <span className="block text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-700">
        {label}
      </span>
      <span className="block text-[11px] leading-relaxed text-zinc-700">
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
      className="w-full border border-[#181818] bg-[#030303] px-3 py-2.5 font-mono text-[12px] text-zinc-400 outline-none transition-colors placeholder:text-zinc-800 hover:border-[#242424] focus:border-zinc-700"
    />
  );
}

function ReadOnlyGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
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
    <div className="border border-[#181818] bg-[#030303] p-4">
      <p className="mb-2 text-[8px] font-bold uppercase tracking-[0.18em] text-zinc-800">
        {label}
      </p>
      {asLink ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate font-mono text-[11px] text-[#74c69d] hover:underline"
        >
          {value.replace(/^https?:\/\//, "")}
        </a>
      ) : (
        <p className="truncate font-mono text-[11px] text-zinc-500">{value}</p>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-zinc-800">
        {label}
      </span>
      <span className="truncate font-mono text-[9px] text-zinc-600">{value}</span>
    </div>
  );
}

function SettingsToast({
  notice,
  onDismiss,
}: {
  notice: Notice | null;
  onDismiss: () => void;
}) {
  if (!notice) return null;

  const color =
    notice.type === "success"
      ? "text-[#74c69d]"
      : notice.type === "error"
        ? "text-[#c56b6b]"
        : "text-zinc-300";

  return (
    <div className="fixed right-5 top-[76px] z-50 w-[320px] border border-[#242424] bg-[#050505] px-4 py-3 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${color}`}>
            {notice.title}
          </p>
          {notice.message && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
              {notice.message}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="cursor-pointer text-[13px] leading-none text-zinc-700 transition-colors hover:text-zinc-300"
          aria-label="Dismiss notification"
        >
          x
        </button>
      </div>
    </div>
  );
}

function normalizeEnvKey(key: string) {
  return key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_");
}

function isProjectTransitioning(status?: string) {
  return status === "suspending" || status === "resuming" || status === "deleting";
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

function productionHost(subdomain: string | null) {
  if (!subdomain) return null;
  if (subdomain.includes(".") || /^https?:\/\//.test(subdomain)) return subdomain;
  const baseDomain =
    process.env.NEXT_PUBLIC_USER_APP_BASE_DOMAIN || "hatchcloud.xyz";
  return `${subdomain}.${baseDomain}`;
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
