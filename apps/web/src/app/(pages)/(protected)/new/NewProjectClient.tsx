/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { debounce } from "lodash";
import { PageLoadingState } from "../../../components/LoadingState";
import {
  apiFetch,
  pushFlashNotice,
  readApiError,
  redirectIfUnauthorized,
} from "@/app/lib/api";
import {
  NoticeToast,
  type NoticePayload,
} from "../../../components/NoticeToast";

interface Repo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string;
  language: string;
  updated_at: string;
  default_branch?: string;
}

interface EnvVar {
  key: string;
  value: string;
}

export default function NewProjectClient() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [sourceMode, setSourceMode] = useState<"connected" | "url">("connected");
  const [manualRepoUrl, setManualRepoUrl] = useState("");
  const [manualRepoError, setManualRepoError] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [branch, setBranch] = useState("main");
  const [port, setPort] = useState("");
  const [healthCheck, setHealthCheck] = useState("/health");
  const [rootPath, setRootPath] = useState("./");
  const [detectedPorts, setDetectedPorts] = useState<number[]>([]);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [hasDockerfile, setHasDockerfile] = useState<boolean | null>(null);
  const [checkingDocker, setCheckingDocker] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkEnv, setBulkEnv] = useState("");
  const [notice, setNotice] = useState<NoticePayload | null>(null);
  const userEditedPortRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    apiFetch("/api/github/repos")
      .then((r) => {
        if (redirectIfUnauthorized(r, router)) return [];
        return r.json();
      })
      .then((data) => {
        setRepos(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setNotice({
          type: "error",
          title: "GitHub unavailable",
          message: "We couldn't load your repositories right now.",
        });
        setLoading(false);
      });
  }, [router]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const sanitizePath = (path: string) =>
    path.replace(/^\.\//, "").replace(/\/+$/, "").replace(/\/+/g, "/").trim();

  const debouncedCheck = useCallback(
    debounce(async (repoFullName: string, path: string) => {
      setCheckingDocker(true);
      const cleanRoot = sanitizePath(path);
      const fullDockerPath = cleanRoot
        ? `${cleanRoot}/Dockerfile`
        : "Dockerfile";
      try {
        const res = await apiFetch(
          `/api/github/repos/${repoFullName}/dockerfile?path=${encodeURIComponent(fullDockerPath)}`,
        );
        if (redirectIfUnauthorized(res, router)) return;
        if (res.status === 200) {
          const data = await res.json();
          const ports = Array.isArray(data.ports)
            ? data.ports.filter(
                (value: unknown) =>
                  typeof value === "number" && Number.isInteger(value),
              )
            : [];
          setHasDockerfile(true);
          setDetectedPorts(ports);
          if (ports.length > 0 && !userEditedPortRef.current) {
            setPort(String(ports[0]));
          }
        } else {
          setHasDockerfile(false);
          setDetectedPorts([]);
        }
      } catch {
        setHasDockerfile(false);
        setDetectedPorts([]);
      } finally {
        setCheckingDocker(false);
      }
    }, 600),
    [],
  );

  const handleSelectRepo = (repo: Repo) => {
    setSelectedRepo(repo);
    setManualRepoError("");
    setProjectName(repo.name);
    setBranch(repo.default_branch || "main");
    setSubdomain("");
    userEditedPortRef.current = false;
    if (repo.language === "Go") setPort("8080");
    else if (repo.language === "Python") setPort("8000");
    else setPort("80");
    setDetectedPorts([]);
    debouncedCheck(repo.full_name, rootPath);
    setStep(2);
  };

  const handleManualRepoContinue = () => {
    const parsed = parseGitHubRepoUrl(manualRepoUrl);
    if (!parsed) {
      setManualRepoError("Enter a valid GitHub repository URL.");
      return;
    }

    const repo: Repo = {
      id: -Date.now(),
      name: parsed.repo,
      full_name: parsed.fullName,
      private: false,
      html_url: parsed.url,
      description: "",
      language: "",
      updated_at: new Date().toISOString(),
      default_branch: branch || "main",
    };

    setSourceMode("url");
    setSelectedRepo(repo);
    setManualRepoUrl(parsed.url);
    setManualRepoError("");
    setProjectName(parsed.repo);
    setBranch(branch || "main");
    setSubdomain("");
    userEditedPortRef.current = false;
    setPort("80");
    setDetectedPorts([]);
    debouncedCheck(parsed.fullName, rootPath);
    setStep(2);
  };

  const validationErrors = useMemo(() => {
    const errors = [];
    if (!selectedRepo) errors.push("Repository required");
    if (!projectName.trim()) errors.push("Project name required");
    if (!subdomain.trim()) errors.push("Subdomain required");
    if (!port.trim() || isNaN(parseInt(port)))
      errors.push("Valid port required");
    if (hasDockerfile === false) errors.push("Dockerfile missing");
    return errors;
  }, [selectedRepo, projectName, subdomain, port, hasDockerfile]);

  const handleDeploy = async () => {
    if (validationErrors.length > 0) return;
    setDeploying(true);
    const envVarsMap: Record<string, string> = {};
    envVars.forEach(({ key, value }) => {
      if (key.trim()) envVarsMap[key.trim()] = value;
    });
    const cleanRoot = sanitizePath(rootPath);
    const finalDockerPath = cleanRoot
      ? `${cleanRoot}/Dockerfile`
      : "Dockerfile";
    try {
      const projectRes = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_name: projectName || selectedRepo?.name,
          repo_url: selectedRepo?.html_url,
          subdomain,
          branch,
          dockerfile_path: finalDockerPath,
          port: parseInt(port),
          env_vars: envVarsMap,
        }),
      });
      if (redirectIfUnauthorized(projectRes, router)) return;
      if (!projectRes.ok) {
        setNotice({
          type: "error",
          title: "Project creation failed",
          message: await readApiError(
            projectRes,
            "We couldn't create the service record.",
          ),
        });
        setDeploying(false);
        return;
      }
      const project = await projectRes.json();
      const deployRes = await apiFetch("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          branch,
          port: parseInt(port),
          health_check: healthCheck,
          env_vars: envVarsMap,
        }),
      });
      if (redirectIfUnauthorized(deployRes, router)) return;
      if (deployRes.ok) {
        localStorage.removeItem("hatch_projects_cache");
        localStorage.removeItem("hatch_insights_cache");
        pushFlashNotice({
          type: "success",
          title: "Service created",
          message: "The first deployment has been queued.",
        });
        router.push(`/projects/${project.id}`);
      } else {
        pushFlashNotice({
          type: "error",
          title: "Deployment failed to start",
          message: await readApiError(
            deployRes,
            "The service was created, but the first deployment could not be queued.",
          ),
        });
        router.push(`/projects/${project.id}`);
        setDeploying(false);
      }
    } catch {
      setNotice({
        type: "error",
        title: "Request failed",
        message: "We couldn't reach the API to create the service.",
      });
      setDeploying(false);
    }
  };

  const parseBulkEnv = (text: string) => {
    const parsed: EnvVar[] = [];
    text.split("\n").forEach((line) => {
      const clean = line.split("#")[0].trim();
      if (!clean || !clean.includes("=")) return;
      const eq = clean.indexOf("=");
      const k = clean.substring(0, eq).trim();
      let v = clean.substring(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      if (k)
        parsed.push({ key: k.toUpperCase().replace(/\s+/g, "_"), value: v });
    });
    if (parsed.length > 0) setEnvVars(parsed);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setBulkEnv(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  if (!mounted) return <PageLoadingState />;

  const buildStatusLabel = checkingDocker
    ? "scanning…"
    : hasDockerfile === true
      ? "verified"
      : hasDockerfile === false
        ? "not found"
        : "pending";

  const filteredRepos = repos.filter((r) =>
    r.full_name.toLowerCase().includes(search.toLowerCase()),
  );
  const preflight = [
    { label: "Repository", ready: Boolean(selectedRepo) },
    { label: "Service name", ready: Boolean(projectName.trim()) },
    { label: "Subdomain", ready: Boolean(subdomain.trim()) },
    { label: "Port", ready: Boolean(port.trim()) },
    { label: "Dockerfile", ready: hasDockerfile === true },
  ];
  const repoSourceLabel =
    sourceMode === "url" ? "external repository" : "connected repository";

  const hasSource = step === 2 && Boolean(selectedRepo);

  return (
    <div
      className="w-full min-h-[calc(100vh-4rem)] xl:h-[calc(100vh-4rem)] bg-black text-white flex flex-col xl:overflow-hidden"
      style={{ fontFamily: "'GeistMono','Menlo','Courier New',monospace" }}
    >
      <NoticeToast notice={notice} onDismiss={() => setNotice(null)} />
      {/* Header */}
      <header className="shrink-0 border-b border-[#1a1a1a] px-5 sm:px-8 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-black">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#555]">
              New Service
            </span>
            <span className="text-[#2a2a2a]">/</span>
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#777] truncate">
              {step === 1
                ? "Select Repository"
                : (selectedRepo?.name ?? "Configure")}
            </span>
          </div>
          <p className="text-[11px] text-[#3a3a3a] mt-1.5">
            Create a deployable service from a GitHub repository.
          </p>
        </div>
        <button
          onClick={() => router.push("/console")}
          className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#444] hover:text-[#aaa] transition-colors cursor-pointer"
        >
          <span className="text-[15px]">← </span>
          Back to Console
        </button>
      </header>

      <main className="flex-1 min-h-0 flex flex-col xl:flex-row xl:overflow-hidden">
        {/* ── LEFT: form ── */}
        <div
          className="w-full xl:w-[62%] xl:border-r border-[#1a1a1a] flex flex-col bg-black xl:overflow-y-auto"
          style={{ scrollbarWidth: "none" }}
        >
          <div className="px-5 sm:px-8 py-7 pb-12 max-w-5xl w-full">
            {/* 01 — Repository */}
            <section className="space-y-5 pb-7 border-b border-[#141414]">
              <SectionHeader index="01" title="Source Repository">
                {step === 2 && (
                  <button
                    onClick={() => {
                      setStep(1);
                      setSelectedRepo(null);
                      setProjectName("");
                      setHasDockerfile(null);
                      setManualRepoError("");
                    }}
                    className="text-[10px] font-bold text-[#444] hover:text-[#aaa] uppercase tracking-widest transition-colors cursor-pointer"
                  >
                    change
                  </button>
                )}
              </SectionHeader>

              {step === 1 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-px bg-[#1a1a1a] border border-[#1a1a1a] rounded-[4px] overflow-hidden">
                    <button
                      onClick={() => setSourceMode("connected")}
                      className={`py-3 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors cursor-pointer ${
                        sourceMode === "connected"
                          ? "bg-white text-black"
                          : "bg-black text-[#555] hover:text-[#aaa]"
                      }`}
                    >
                      Connected GitHub
                    </button>
                    <button
                      onClick={() => setSourceMode("url")}
                      className={`py-3 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors cursor-pointer ${
                        sourceMode === "url"
                          ? "bg-white text-black"
                          : "bg-black text-[#555] hover:text-[#aaa]"
                      }`}
                    >
                      Repository URL
                    </button>
                  </div>

                  {sourceMode === "connected" ? (
                    <>
                      <input
                        type="text"
                        placeholder="Search repositories…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-black border border-[#1e1e1e] px-4 py-3 text-[13px] font-mono outline-none focus:border-[#444] transition-colors placeholder-[#333] text-[#999]"
                      />
                      <div
                        className="border border-[#1a1a1a] overflow-hidden divide-y divide-[#111] max-h-[500px] overflow-y-auto"
                        style={{ scrollbarWidth: "none" }}
                      >
                        {loading ? (
                          <div className="py-16 text-center text-[#333] text-[10px] uppercase tracking-[0.3em] animate-pulse">
                            Fetching repositories…
                          </div>
                        ) : filteredRepos.length === 0 ? (
                          <div className="py-16 text-center text-[#333] text-[10px] uppercase tracking-[0.3em]">
                            No repositories found
                          </div>
                        ) : (
                          filteredRepos.map((repo) => (
                            <button
                              key={repo.id}
                              onClick={() => handleSelectRepo(repo)}
                              className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#0a0a0a] transition-colors group text-left cursor-pointer"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#2a2a2a] group-hover:bg-[#666] transition-colors flex-shrink-0" />
                                <span className="text-[13px] font-mono text-[#666] group-hover:text-[#ccc] transition-colors truncate">
                                  {repo.full_name}
                                </span>
                                {repo.private && (
                                  <span className="text-[9px] text-[#444] border border-[#2a2a2a] px-1.5 py-0.5 uppercase tracking-wider flex-shrink-0">
                                    private
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] font-bold uppercase text-[#333] group-hover:text-[#777] flex-shrink-0 ml-4 transition-colors">
                                select →
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="border border-[#1a1a1a] bg-black p-5 space-y-4 rounded-[4px]">
                      <div className="space-y-2.5">
                        <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#555]">
                          GitHub Repository URL
                        </label>
                        <input
                          type="url"
                          placeholder="https://github.com/owner/repo"
                          value={manualRepoUrl}
                          onChange={(e) => {
                            setManualRepoUrl(e.target.value);
                            setManualRepoError("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleManualRepoContinue();
                          }}
                          className="w-full bg-black border border-[#1e1e1e] px-4 py-3 text-[13px] font-mono outline-none focus:border-[#444] transition-colors placeholder-[#333] text-[#999]"
                        />
                      </div>
                      <p className="text-[11px] font-mono text-[#444] leading-relaxed">
                        Public repositories work immediately. Private repositories
                        work only if your connected GitHub account has access.
                      </p>
                      {manualRepoError && (
                        <p className="text-[11px] font-mono text-[#d05252]">
                          {manualRepoError}
                        </p>
                      )}
                      <button
                        onClick={handleManualRepoContinue}
                        className="w-full bg-white text-black py-3 font-bold uppercase tracking-[0.22em] text-[10px] hover:bg-zinc-200 transition-all cursor-pointer"
                      >
                        Use Repository →
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-4 px-5 py-4 border border-[#1e1e1e] bg-[#050505] rounded-[6px]">
                  <div className="w-2 h-2 rounded-full bg-[#666] flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-[#333] mb-1">
                      {repoSourceLabel}
                    </p>
                    <p className="text-[14px] font-mono text-[#999] truncate">
                      {selectedRepo?.full_name}
                    </p>
                    <p className="text-[11px] font-mono text-[#444] mt-0.5">
                      {selectedRepo?.html_url}
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* Steps 2–5 */}
            {hasSource && (
            <div className="space-y-0">
              {/* 02 — Identity */}
              <section className="space-y-6 py-7 border-b border-[#141414]">
                <SectionHeader index="02" title="Service Identity" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                  <FieldInput
                    label="Project Name"
                    value={projectName}
                    onChange={setProjectName}
                    placeholder="my-api"
                  />
                  <div className="space-y-2.5">
                    <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#555]">
                      Subdomain
                    </label>
                    <div className="flex items-center border-b border-[#222] focus-within:border-[#555] transition-colors">
                      <input
                        value={subdomain}
                        onChange={(e) =>
                          setSubdomain(
                            e.target.value.toLowerCase().replace(/\s+/g, "-"),
                          )
                        }
                        placeholder="my-service"
                        className="flex-1 bg-transparent py-3 text-[13px] font-mono outline-none text-[#999] placeholder-[#333]"
                      />
                      <span className="text-[10px] font-mono text-[#333] pl-1">
                        .hatchcloud.xyz
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {/* 03 — Runtime */}
              <section className="space-y-6 py-7 border-b border-[#141414]">
                <SectionHeader index="03" title="Runtime Contract" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                  <FieldInput
                    label="Service Port"
                    value={port}
                    onChange={(v) => {
                      userEditedPortRef.current = true;
                      setPort(v.replace(/[^0-9]/g, ""));
                    }}
                    placeholder="8080"
                  />
                  <FieldInput
                    label="Health Check Path"
                    value={healthCheck}
                    onChange={setHealthCheck}
                    placeholder="/health"
                  />
                </div>
                <p className="text-[11px] font-mono text-[#3a3a3a] leading-relaxed">
                  {detectedPorts.length > 0
                    ? `Detected from Dockerfile: ${detectedPorts.join(", ")}`
                    : checkingDocker
                      ? "Scanning Dockerfile for EXPOSE ports..."
                      : "Hatch will try to detect this from the Dockerfile. You can override it if your app listens somewhere else."}
                </p>
              </section>

              {/* 04 — Build */}
              <section className="space-y-6 py-7 border-b border-[#141414]">
                <SectionHeader index="04" title="Build Definitions" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                  <FieldInput
                    label="Root Directory"
                    value={rootPath}
                    onChange={(v) => {
                      setRootPath(v);
                      if (selectedRepo) debouncedCheck(selectedRepo.full_name, v);
                    }}
                    placeholder="./"
                  />
                  <FieldInput
                    label="Deployment Branch"
                    value={branch}
                    onChange={setBranch}
                    placeholder="main"
                  />
                </div>
              </section>

              {/* 05 — Env vars */}
              <section className="space-y-5 py-7">
                <SectionHeader index="05" title="Environment Variables">
                  <div className="flex gap-5">
                    <button
                      onClick={() => setIsBulkModalOpen(true)}
                      className="text-[10px] font-bold text-[#444] hover:text-[#aaa] uppercase tracking-widest transition-colors cursor-pointer"
                    >
                      from .env
                    </button>
                    <button
                      onClick={() =>
                        setEnvVars([...envVars, { key: "", value: "" }])
                      }
                      className="text-[10px] font-bold text-[#444] hover:text-[#aaa] uppercase tracking-widest transition-colors cursor-pointer"
                    >
                      + add
                    </button>
                  </div>
                </SectionHeader>

                {envVars.length === 0 ? (
                  <p className="text-[11px] font-mono text-[#333] py-1">
                    No variables defined
                  </p>
                ) : (
                  <div className="space-y-3">
                    {envVars.map((ev, index) => (
                      <div key={index} className="flex gap-4 items-end">
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FieldInput
                            label="Key"
                            value={ev.key}
                            onChange={(v) => {
                              const next = [...envVars];
                              next[index].key = v
                                .toUpperCase()
                                .replace(/\s+/g, "_");
                              setEnvVars(next);
                            }}
                            placeholder="VARIABLE_NAME"
                          />
                          <FieldInput
                            label="Value"
                            value={ev.value}
                            onChange={(v) => {
                              const next = [...envVars];
                              next[index].value = v;
                              setEnvVars(next);
                            }}
                            placeholder="value"
                          />
                        </div>
                        <button
                          onClick={() =>
                            setEnvVars(envVars.filter((_, i) => i !== index))
                          }
                          className="mb-3 text-[#333] hover:text-[#888] transition-colors text-lg cursor-pointer px-1"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Deploy */}
              <button
                onClick={handleDeploy}
                disabled={deploying || validationErrors.length > 0}
                className="w-full bg-white text-black py-4 font-bold uppercase tracking-[0.25em] text-[11px] hover:bg-zinc-200 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer rounded-[3px]"
              >
                {deploying ? "Initializing…" : "Deploy Service →"}
              </button>
            </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: manifest ── */}
        <div
          className="w-full xl:w-[38%] min-h-0 bg-[#050505] flex flex-col overflow-y-auto overscroll-contain border-t xl:border-t-0 xl:border-l border-[#1a1a1a]"
          style={{ scrollbarColor: "#2a2a2a transparent" }}
        >
          <div className="p-5 sm:p-7 flex flex-col gap-5 pb-10">
            {hasSource ? (
              <>
                {/* Title */}
                <div className="pb-5 border-b border-[#202020]">
                  <p className="text-[10px] font-mono text-[#666] uppercase tracking-[0.28em] mb-3">
                    Deployment Preview
                  </p>
                  <h2 className="text-[32px] font-bold tracking-tight text-[#e7e7e7] leading-tight truncate">
                    {projectName || "—"}
                  </h2>
                  {selectedRepo && (
                    <div className="flex items-center gap-2 mt-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#5bcf93]" />
                      <p className="text-[12px] font-mono text-[#8c8c8c] truncate">
                        {selectedRepo.full_name}
                      </p>
                    </div>
                  )}
                </div>

                {/* Manifest table */}
                <div className="border border-[#242424] bg-black overflow-hidden rounded-[6px]">
                  <ManifestRow
                    label="Ingress URL"
                    value={subdomain ? `${subdomain}.hatchcloud.xyz` : "—"}
                  />
                  <ManifestRow label="Port" value={port ? `TCP/${port}` : "—"} />
                  <ManifestRow label="Branch" value={branch || "—"} />
                  <ManifestRow label="Root" value={rootPath} />
                  <ManifestRow
                    label="Dockerfile"
                    value={buildStatusLabel}
                    bright={hasDockerfile === true}
                    tone={hasDockerfile === false ? "warning" : undefined}
                    last
                  />
                </div>

                <div className="border border-[#242424] bg-black rounded-[6px] overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-[#171717]">
                    <p className="text-[10px] font-mono text-[#666] uppercase tracking-[0.26em]">
                      Preflight
                    </p>
                  </div>
                  <div className="divide-y divide-[#171717]">
                    {preflight.map((item) => (
                      <PreflightRow key={item.label} {...item} />
                    ))}
                  </div>
                </div>

                {/* Env count */}
                <div className="border border-[#242424] px-5 py-3.5 rounded-[6px] bg-black">
                  <p className="text-[12px] font-mono text-[#8c8c8c]">
                    {envVars.filter((v) => v.key).length} env var
                    {envVars.filter((v) => v.key).length !== 1 ? "s" : ""} defined
                  </p>
                </div>

                {/* Dockerfile warning */}
                {hasDockerfile === false && !checkingDocker && selectedRepo && (
                  <div className="border border-[#3a3020] bg-[#0b0905] px-5 py-4 rounded-[6px]">
                    <p className="text-[12px] font-mono text-[#b08a54] leading-relaxed">
                      Dockerfile not found in "{rootPath}". Deployment blocked.
                    </p>
                  </div>
                )}

                <div className="pt-5 border-t border-[#202020]">
                  <p className="text-[12px] font-mono text-[#747474] leading-relaxed">
                    Hatch will clone the selected branch, build the Dockerfile,
                    publish an image, and route traffic once the target is healthy.
                  </p>
                </div>
              </>
            ) : (
              <div className="flex min-h-full flex-col justify-between gap-8">
                <div>
                  <p className="text-[9px] font-mono text-[#333] uppercase tracking-[0.4em] mb-4">
                    Deployment Preview
                  </p>
                  <h2 className="text-[30px] font-bold tracking-tight text-[#aaa] leading-tight">
                    Pick a source to begin.
                  </h2>
                  <p className="text-[12px] text-[#555] leading-relaxed mt-4 max-w-md">
                    Choose one of your connected repositories or paste a GitHub
                    URL. Hatch will inspect the Dockerfile before the deploy
                    controls unlock.
                  </p>
                </div>

                <div className="space-y-3">
                  {[
                    "Clone selected branch",
                    "Build Dockerfile",
                    "Publish image",
                    "Provision runtime",
                  ].map((item, index) => (
                    <div
                      key={item}
                      className="flex items-center gap-3 border-b border-[#111] pb-3 last:border-b-0"
                    >
                      <span className="text-[10px] text-[#333] font-mono tabular-nums">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-[11px] text-[#555] uppercase tracking-[0.16em] font-bold">
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── BULK MODAL ── */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80"
            onClick={() => setIsBulkModalOpen(false)}
          />
          <div className="relative w-full max-w-xl bg-[#0a0a0a] border border-[#2a2a2a] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-7 py-5 border-b border-[#1a1a1a]">
              <div>
                <h2 className="text-[13px] font-bold uppercase tracking-[0.2em] text-[#888]">
                  Import Variables
                </h2>
                <p className="text-[10px] text-[#444] font-mono mt-1">
                  Paste .env content or upload a file
                </p>
              </div>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="text-[#444] hover:text-[#aaa] transition-colors cursor-pointer p-1.5"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M1 1L11 11M1 11L11 1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <div className="p-7 space-y-5">
              <div className="relative group">
                <input
                  type="file"
                  accept=".env,text/plain"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="border border-dashed border-[#2a2a2a] py-5 px-4 text-center group-hover:border-[#555] transition-colors">
                  <p className="text-[10px] font-mono text-[#444] uppercase tracking-widest">
                    drop .env file or click to upload
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#444]">
                  Raw Input
                </p>
                <textarea
                  autoFocus
                  value={bulkEnv}
                  onChange={(e) => setBulkEnv(e.target.value)}
                  placeholder={
                    "PORT=8080\nDB_URL=postgresql://...\nNODE_ENV=production"
                  }
                  className="w-full h-52 bg-black border border-[#1e1e1e] p-4 text-[13px] font-mono text-[#777] outline-none focus:border-[#444] transition-all resize-none placeholder-[#2a2a2a] leading-relaxed"
                />
              </div>
            </div>

            <div className="px-7 py-4 border-t border-[#1a1a1a] flex items-center justify-between">
              <button
                onClick={() => setBulkEnv("")}
                className="text-[10px] font-bold uppercase tracking-widest text-[#444] hover:text-[#888] transition-colors cursor-pointer"
              >
                Clear
              </button>
              <div className="flex gap-4 items-center">
                <button
                  onClick={() => setIsBulkModalOpen(false)}
                  className="text-[10px] font-bold uppercase tracking-widest text-[#444] hover:text-[#888] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    parseBulkEnv(bulkEnv);
                    setIsBulkModalOpen(false);
                    setBulkEnv("");
                  }}
                  className="bg-white text-black px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-zinc-200 transition-colors cursor-pointer"
                >
                  Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── COMPONENTS ── */

function SectionHeader({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[#1a1a1a] pb-3">
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-mono text-[#333]">{index}</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#666]">
          {title}
        </span>
      </div>
      {children && <div>{children}</div>}
    </div>
  );
}

function ManifestRow({
  label,
  value,
  bright,
  tone,
  last,
}: {
  label: string;
  value: string;
  bright?: boolean;
  tone?: "warning";
  last?: boolean;
}) {
  const isEmpty = value === "—";
  const valueColor =
    tone === "warning"
      ? "text-[#b08a54]"
      : isEmpty
        ? "text-[#555]"
        : bright
          ? "text-[#e4e4e4]"
          : "text-[#a7a7a7]";

  return (
    <div
      className={`flex justify-between items-center gap-5 px-5 py-3.5 bg-black ${!last ? "border-b border-[#171717]" : ""}`}
    >
      <span className="text-[10px] font-mono text-[#6b6b6b] uppercase tracking-[0.13em] shrink-0">
        {label}
      </span>
      <span
        title={value}
        className={`text-[12px] font-mono font-semibold text-right truncate max-w-[68%] ${valueColor}`}
      >
        {isEmpty ? "Not set" : value}
      </span>
    </div>
  );
}

function PreflightRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            ready ? "bg-[#5bcf93]" : "bg-[#444]"
          }`}
        />
        <span className="text-[12px] font-mono text-[#9a9a9a] truncate">
          {label}
        </span>
      </div>
      <span
        className={`text-[10px] font-bold uppercase tracking-[0.14em] shrink-0 ${
          ready ? "text-[#5bcf93]" : "text-[#666]"
        }`}
      >
        {ready ? "Ready" : "Needed"}
      </span>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2.5">
      <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#555]">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent border-b border-[#222] py-3 text-[13px] font-mono outline-none focus:border-[#555] transition-colors text-[#999] placeholder-[#333]"
      />
    </div>
  );
}

function parseGitHubRepoUrl(value: string) {
  const raw = value.trim();
  if (!raw) return null;

  const normalized = raw
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");

  try {
    const url = new URL(normalized);
    if (url.hostname !== "github.com") return null;
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repo) return null;
    return {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      url: `https://github.com/${owner}/${repo}`,
    };
  } catch {
    const [owner, repo] = normalized.split("/").filter(Boolean);
    if (!owner || !repo || normalized.includes("://")) return null;
    return {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      url: `https://github.com/${owner}/${repo}`,
    };
  }
}
