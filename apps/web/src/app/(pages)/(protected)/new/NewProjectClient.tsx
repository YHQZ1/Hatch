/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { debounce } from "lodash";
import { PageLoadingState } from "../../../components/LoadingState";

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

const CPU_OPTIONS = [
  { label: "0.25 vCPU", value: "256" },
  { label: "0.5 vCPU", value: "512" },
  { label: "1 vCPU", value: "1024" },
  { label: "2 vCPU", value: "2048" },
];

const MEMORY_OPTIONS: Record<string, { label: string; value: string }[]> = {
  "256": [{ label: "512 MB", value: "512" }],
  "512": [
    { label: "1 GB", value: "1024" },
    { label: "2 GB", value: "2048" },
  ],
  "1024": [
    { label: "2 GB", value: "2048" },
    { label: "3 GB", value: "3072" },
    { label: "4 GB", value: "4096" },
  ],
  "2048": [
    { label: "4 GB", value: "4096" },
    { label: "8 GB", value: "8192" },
  ],
};

export default function NewProjectClient() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [token, setToken] = useState<string | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [branch, setBranch] = useState("main");
  const [port, setPort] = useState("");
  const [cpu, setCpu] = useState("512");
  const [memory, setMemory] = useState("1024");
  const [healthCheck, setHealthCheck] = useState("/health");
  const [rootPath, setRootPath] = useState("./");
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [hasDockerfile, setHasDockerfile] = useState<boolean | null>(null);
  const [checkingDocker, setCheckingDocker] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkEnv, setBulkEnv] = useState("");

  useEffect(() => {
    setMounted(true);
    const t = localStorage.getItem("hatch_token");
    if (!t) {
      router.push("/auth");
      return;
    }
    setToken(t);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/github/repos`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setRepos(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    const opts = MEMORY_OPTIONS[cpu];
    if (opts) setMemory(opts[0].value);
  }, [cpu]);

  const sanitizePath = (path: string) =>
    path.replace(/^\.\//, "").replace(/\/+$/, "").replace(/\/+/g, "/").trim();

  const debouncedCheck = useCallback(
    debounce(async (repoFullName: string, t: string, path: string) => {
      setCheckingDocker(true);
      const cleanRoot = sanitizePath(path);
      const fullDockerPath = cleanRoot
        ? `${cleanRoot}/Dockerfile`
        : "Dockerfile";
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/github/repos/${repoFullName}/dockerfile?path=${encodeURIComponent(fullDockerPath)}`,
          { headers: { Authorization: `Bearer ${t}` } },
        );
        setHasDockerfile(res.status === 200);
      } catch {
        setHasDockerfile(false);
      } finally {
        setCheckingDocker(false);
      }
    }, 600),
    [],
  );

  const handleSelectRepo = (repo: Repo) => {
    setSelectedRepo(repo);
    setProjectName(repo.name);
    setBranch(repo.default_branch || "main");
    setSubdomain("");
    if (repo.language === "Go") setPort("8080");
    else if (repo.language === "Python") setPort("8000");
    else setPort("80");
    if (token) debouncedCheck(repo.full_name, token, rootPath);
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
    if (validationErrors.length > 0 || !token) return;
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
      const projectRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/projects`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repo_name: projectName || selectedRepo?.name,
            repo_url: selectedRepo?.html_url,
            subdomain,
            branch,
            dockerfile_path: finalDockerPath,
            port: parseInt(port),
            env_vars: envVarsMap,
          }),
        },
      );
      const project = await projectRes.json();
      const deployRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/deployments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            project_id: project.id,
            branch,
            cpu: parseInt(cpu),
            memory_mb: parseInt(memory),
            port: parseInt(port),
            health_check_path: healthCheck,
            env_vars: envVarsMap,
          }),
        },
      );
      if (deployRes.ok) {
        localStorage.removeItem("hatch_projects_cache");
        localStorage.removeItem("hatch_infrastructure_cache");
        router.push(`/projects/${project.id}`);
      } else {
        setDeploying(false);
      }
    } catch {
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

  return (
    <div
      className="w-full h-screen bg-black text-white flex flex-col overflow-hidden"
      style={{ fontFamily: "'GeistMono','Menlo','Courier New',monospace" }}
    >
      {/* Header */}
      <header className="shrink-0 border-b border-[#1a1a1a] px-8 py-4 flex items-center justify-between bg-black">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#555]">
            New Service
          </span>
          <span className="text-[#2a2a2a]">/</span>
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#777]">
            {step === 1
              ? "Select Repository"
              : (selectedRepo?.name ?? "Configure")}
          </span>
        </div>
        <button
          onClick={() => router.push("/console")}
          className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#444] hover:text-[#aaa] transition-colors cursor-pointer"
        >
          <span className="text-[15px]">← </span>
          Back to Console
        </button>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* ── LEFT: form ── */}
        <div
          className="w-3/5 border-r border-[#1a1a1a] flex flex-col overflow-y-scroll bg-black"
          style={{ scrollbarWidth: "none" }}
        >
          <div className="px-8 py-2 space-y-2 pb-4">
            {/* 01 — Repository */}
            <section className="space-y-4">
              <SectionHeader index="01" title="Source Repository">
                {step === 2 && (
                  <button
                    onClick={() => {
                      setStep(1);
                      setSelectedRepo(null);
                      setProjectName("");
                      setHasDockerfile(null);
                    }}
                    className="text-[10px] font-bold text-[#444] hover:text-[#aaa] uppercase tracking-widest transition-colors cursor-pointer"
                  >
                    change
                  </button>
                )}
              </SectionHeader>

              {step === 1 ? (
                <div className="space-y-2">
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
                </div>
              ) : (
                <div className="flex items-center gap-4 px-5 py-4 border border-[#1e1e1e] bg-[#080808]">
                  <div className="w-2 h-2 rounded-full bg-[#666] flex-shrink-0" />
                  <div className="min-w-0">
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
            <div
              className={`space-y-12 transition-opacity duration-200 ${step === 2 ? "opacity-100" : "opacity-10 pointer-events-none"}`}
            >
              {/* 02 — Identity */}
              <section className="space-y-6">
                <SectionHeader index="02" title="Service Identity" />
                <div className="grid grid-cols-2 gap-8">
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

              {/* 03 — Resources */}
              <section className="space-y-6">
                <SectionHeader index="03" title="Resource Allocation" />
                <div className="grid grid-cols-2 gap-8">
                  <FieldSelect
                    label="Compute (vCPU)"
                    value={cpu}
                    options={CPU_OPTIONS}
                    onChange={setCpu}
                  />
                  <FieldSelect
                    label="Memory (RAM)"
                    value={memory}
                    options={MEMORY_OPTIONS[cpu] || []}
                    onChange={setMemory}
                  />
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <FieldInput
                    label="Ingress Port"
                    value={port}
                    onChange={(v) => setPort(v.replace(/[^0-9]/g, ""))}
                    placeholder="8080"
                  />
                  <FieldInput
                    label="Health Check Path"
                    value={healthCheck}
                    onChange={setHealthCheck}
                    placeholder="/health"
                  />
                </div>
              </section>

              {/* 04 — Build */}
              <section className="space-y-6">
                <SectionHeader index="04" title="Build Definitions" />
                <div className="grid grid-cols-2 gap-8">
                  <FieldInput
                    label="Root Directory"
                    value={rootPath}
                    onChange={(v) => {
                      setRootPath(v);
                      if (token && selectedRepo)
                        debouncedCheck(selectedRepo.full_name, token, v);
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
              <section className="space-y-5">
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
                        <div className="flex-1 grid grid-cols-2 gap-4">
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

              {/* Validation checklist */}
              {step === 2 && validationErrors.length > 0 && (
                <div className="p-5 border border-[#1e1e1e] bg-[#080808]">
                  <p className="text-[10px] font-mono text-[#444] uppercase tracking-widest mb-3">
                    Requirements
                  </p>
                  <div className="flex flex-wrap gap-x-6 gap-y-2.5">
                    {[
                      { label: "Repo Selected", fail: !selectedRepo },
                      { label: "Project Name", fail: !projectName },
                      { label: "Subdomain", fail: !subdomain },
                      { label: "Port", fail: !port },
                      { label: "Dockerfile", fail: hasDockerfile !== true },
                    ].map(({ label, fail }) => (
                      <div key={label} className="flex items-center gap-2">
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${fail ? "bg-[#2a2a2a]" : "bg-[#777]"}`}
                        />
                        <span
                          className={`text-[10px] uppercase tracking-tight font-bold ${fail ? "text-[#333]" : "text-[#777]"}`}
                        >
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Deploy */}
              <button
                onClick={handleDeploy}
                disabled={deploying || validationErrors.length > 0}
                className="w-full bg-white text-black py-4 font-bold uppercase tracking-[0.25em] text-[11px] hover:bg-zinc-200 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                {deploying ? "Initializing…" : "Deploy Service →"}
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT: manifest ── */}
        <div
          className="w-2/5 bg-[#060606] flex flex-col overflow-y-auto border-l border-[#1a1a1a]"
          style={{ scrollbarWidth: "none" }}
        >
          <div className="p-8 flex flex-col h-full">
            {/* Title */}
            <div className="mb-8 pb-6 border-b border-[#141414]">
              <p className="text-[9px] font-mono text-[#333] uppercase tracking-[0.4em] mb-2">
                Service Manifest
              </p>
              <h2 className="text-[24px] font-bold tracking-tight text-[#888] leading-tight truncate">
                {projectName || "—"}
              </h2>
              {selectedRepo && (
                <p className="text-[11px] font-mono text-[#444] mt-1.5 truncate">
                  {selectedRepo.full_name}
                </p>
              )}
            </div>

            {/* Manifest table */}
            <div className="border border-[#1a1a1a] overflow-hidden mb-5">
              <ManifestRow
                label="Ingress URL"
                value={subdomain ? `${subdomain}.hatchcloud.xyz` : "—"}
              />
              <ManifestRow label="Port" value={port ? `TCP/${port}` : "—"} />
              <ManifestRow
                label="CPU"
                value={CPU_OPTIONS.find((o) => o.value === cpu)?.label || "—"}
              />
              <ManifestRow
                label="Memory"
                value={
                  MEMORY_OPTIONS[cpu]?.find((o) => o.value === memory)?.label ||
                  "—"
                }
              />
              <ManifestRow label="Branch" value={branch || "—"} />
              <ManifestRow label="Root" value={rootPath} />
              <ManifestRow
                label="Dockerfile"
                value={buildStatusLabel}
                bright={hasDockerfile === true}
                last
              />
            </div>

            {/* Env count */}
            {envVars.some((v) => v.key) && (
              <div className="border border-[#1a1a1a] px-5 py-3.5 mb-5">
                <p className="text-[11px] font-mono text-[#555]">
                  {envVars.filter((v) => v.key).length} env var
                  {envVars.filter((v) => v.key).length !== 1 ? "s" : ""} defined
                </p>
              </div>
            )}

            {/* Dockerfile warning */}
            {hasDockerfile === false && !checkingDocker && selectedRepo && (
              <div className="border border-[#2a2a2a] px-5 py-4 mb-5">
                <p className="text-[11px] font-mono text-[#555] leading-relaxed">
                  Dockerfile not found in "{rootPath}". Deployment blocked.
                </p>
              </div>
            )}

            {/* Procedure steps */}
            <div className="mt-auto pt-6 border-t border-[#141414] space-y-3">
              <p className="text-[9px] font-mono text-[#333] uppercase tracking-[0.35em] mb-4">
                Procedure
              </p>
              {["Select repository", "Configure service", "Deploy"].map(
                (s, i) => {
                  const active =
                    (step === 1 && i === 0) ||
                    (step === 2 && i === 1) ||
                    (deploying && i === 2);
                  const done =
                    (i === 0 && step === 2) || (i === 1 && deploying);
                  return (
                    <div key={s} className="flex items-center gap-3">
                      <span
                        className={`text-[10px] font-mono tabular-nums ${done ? "text-[#555]" : active ? "text-[#999]" : "text-[#2a2a2a]"}`}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div
                        className={`flex-1 h-px ${done ? "bg-[#333]" : active ? "bg-[#2a2a2a]" : "bg-[#141414]"}`}
                      />
                      <span
                        className={`text-[10px] uppercase tracking-widest font-bold ${done ? "text-[#555]" : active ? "text-[#888]" : "text-[#2a2a2a]"}`}
                      >
                        {s}
                      </span>
                    </div>
                  );
                },
              )}
            </div>
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
  last,
}: {
  label: string;
  value: string;
  bright?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-center px-5 py-3.5 bg-black ${!last ? "border-b border-[#0d0d0d]" : ""}`}
    >
      <span className="text-[10px] font-mono text-[#333] uppercase tracking-[0.12em]">
        {label}
      </span>
      <span
        className={`text-[11px] font-mono font-bold uppercase ${bright ? "text-[#aaa]" : "text-[#555]"}`}
      >
        {value}
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

function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#555]">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent border-b border-[#222] py-3 text-[13px] font-mono outline-none cursor-pointer appearance-none text-[#999] focus:border-[#555] transition-colors"
      >
        {options.map((o) => (
          <option
            key={o.value}
            value={o.value}
            className="bg-black text-[#999]"
          >
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
