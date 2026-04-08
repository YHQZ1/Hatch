/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { debounce } from "lodash";

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
      if (deployRes.ok) router.push(`/projects/${project.id}`);
      else setDeploying(false);
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
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setBulkEnv(content);
    };
    reader.readAsText(file);
  };

  const handleSwitchRepo = () => {
    setStep(1);
    setSelectedRepo(null);
    setProjectName("");
    setSubdomain("");
    setHasDockerfile(null);
  };

  if (!mounted) return null;

  const buildStatusLabel = checkingDocker
    ? "Scanning..."
    : hasDockerfile === true
      ? "Verified"
      : hasDockerfile === false
        ? "Not Found"
        : "Pending";

  return (
    <div className="w-full h-screen bg-black text-white flex flex-col overflow-hidden font-sans">
      <header className="shrink-0 border-b border-[#1a1a1a] px-8 py-4 flex items-center justify-between bg-black z-20">
        <h1 className="text-[11px] font-bold uppercase tracking-[0.25em] text-white">
          Provision New Service
        </h1>
        <button
          onClick={() => router.push("/console")}
          className="text-[9px] font-bold uppercase  text-zinc-700 hover:text-white transition-colors cursor-pointer"
        >
          ← Back to Console
        </button>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* LEFT PANEL */}
        <div className="w-3/5 border-r border-[#1a1a1a] flex flex-col overflow-y-auto bg-black scrollbar-hide">
          <div className="p-10 space-y-14 pb-24">
            <section className="space-y-5">
              <div className="flex justify-between items-end border-b border-[#1a1a1a] pb-3">
                <SectionLabel index="01" title="Source Repository" />
                {step === 2 && (
                  <button
                    onClick={() => {
                      setStep(1);
                      setSelectedRepo(null);
                      setProjectName("");
                      setHasDockerfile(null);
                      handleSwitchRepo();
                    }}
                    className="text-[9px] font-bold text-zinc-700 hover:text-white uppercase  transition-colors cursor-pointer"
                  >
                    [ Switch ]
                  </button>
                )}
              </div>

              {step === 1 ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Search repositories..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#1f1f1f] px-4 py-2.5 text-[12px] font-mono outline-none focus:border-zinc-600 transition-colors rounded-[2px] placeholder:text-zinc-800"
                  />
                  <div className="border border-[#1a1a1a] rounded-[2px] overflow-hidden divide-y divide-[#111] max-h-[480px] overflow-y-auto">
                    {loading ? (
                      <div className="py-20 text-center text-zinc-800 font-mono text-[9px] uppercase tracking-[0.3em] animate-pulse">
                        Fetching Registry...
                      </div>
                    ) : (
                      repos
                        .filter((r) =>
                          r.full_name
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        )
                        .map((repo) => (
                          <button
                            key={repo.id}
                            onClick={() => handleSelectRepo(repo)}
                            className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#0f0f0f] transition-colors group text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-zinc-800 group-hover:bg-zinc-500 transition-colors flex-shrink-0" />
                              <span className="text-[12px] font-mono text-zinc-500 group-hover:text-white transition-colors truncate">
                                {repo.full_name}
                              </span>
                              {repo.private && (
                                <span className="text-[8px] text-zinc-700 border border-zinc-800 px-1.5 py-0.5 rounded-[2px] uppercase tracking-wider flex-shrink-0">
                                  private
                                </span>
                              )}
                            </div>
                            <span className="text-[9px] font-bold uppercase  text-zinc-800 group-hover:text-zinc-500 flex-shrink-0 ml-4">
                              Select →
                            </span>
                          </button>
                        ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 p-5 bg-[#0a0a0a] border border-[#1f1f1f] rounded-[2px]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-mono text-zinc-300 truncate">
                      {selectedRepo?.full_name}
                    </p>
                    <p className="text-[10px] font-mono text-zinc-700 mt-1">
                      {selectedRepo?.html_url}
                    </p>
                  </div>
                </div>
              )}
            </section>

            <div
              className={
                step === 2
                  ? "space-y-14 opacity-100"
                  : "space-y-14 opacity-10 pointer-events-none"
              }
            >
              <section className="space-y-6">
                <div className="border-b border-[#1a1a1a] pb-3">
                  <SectionLabel index="02" title="Service Identity" />
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <FieldInput
                    label="Project Name"
                    value={projectName}
                    onChange={setProjectName}
                    placeholder="my-api"
                  />
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#3a3a3a]">
                      Subdomain
                    </label>
                    <div className="flex items-center border-b border-[#222] focus-within:border-zinc-500 transition-colors">
                      <input
                        value={subdomain}
                        onChange={(e) =>
                          setSubdomain(
                            e.target.value.toLowerCase().replace(/\s+/g, "-"),
                          )
                        }
                        placeholder="Enter the desired subdomain"
                        className="flex-1 bg-transparent py-2.5 text-[12px] font-mono outline-none text-zinc-300"
                      />
                      <span className="text-[9px] font-mono text-zinc-800">
                        .p.hatchcloud.xyz
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <div className="border-b border-[#1a1a1a] pb-3">
                  <SectionLabel index="03" title="Resource Allocation" />
                </div>
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
                    onChange={(v) => {
                      const numericValue = v.replace(/[^0-9]/g, "");
                      setPort(numericValue);
                    }}
                    placeholder="Enter Your Port Number"
                  />
                  <FieldInput
                    label="Health Check Path"
                    value={healthCheck}
                    onChange={setHealthCheck}
                    placeholder="/health"
                  />
                </div>
              </section>

              <section className="space-y-6">
                <div className="border-b border-[#1a1a1a] pb-3">
                  <SectionLabel index="04" title="Build Definitions" />
                </div>
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

              <section className="space-y-6">
                <div className="flex justify-between items-end border-b border-[#1a1a1a] pb-3">
                  <SectionLabel index="05" title="Environment Variables" />
                  <div className="flex gap-4">
                    <button
                      onClick={() => setIsBulkModalOpen(true)}
                      className="text-[12px] font-bold text-zinc-500 hover:text-white transition-colors cursor-pointer"
                    >
                      [ Add from .env ]
                    </button>
                    <button
                      onClick={() =>
                        setEnvVars([...envVars, { key: "", value: "" }])
                      }
                      className="text-[12px] font-bold text-zinc-500 hover:text-white transition-colors cursor-pointer"
                    >
                      [ + Add ]
                    </button>
                  </div>
                </div>
                {envVars.length === 0 ? (
                  <p className="text-[9px] font-mono text-zinc-800 uppercase  py-2">
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
                            onChange={(v: string) => {
                              const next = [...envVars];
                              next[index].key = v
                                .toUpperCase()
                                .replace(/\s+/g, "_");
                              setEnvVars(next);
                            }}
                            placeholder="SECRET_VARIABLE"
                          />
                          <FieldInput
                            label="Value"
                            value={ev.value}
                            onChange={(v: string) => {
                              const next = [...envVars];
                              next[index].value = v;
                              setEnvVars(next);
                            }}
                            placeholder="secret_value"
                          />
                        </div>
                        <button
                          onClick={() =>
                            setEnvVars(envVars.filter((_, i) => i !== index))
                          }
                          className="mb-2.5 text-zinc-800 hover:text-red-700 transition-colors text-lg cursor-pointer px-1"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Validation Feedback */}
              {step === 2 && validationErrors.length > 0 && (
                <div className="p-4 border border-zinc-900 bg-[#050505] space-y-2">
                  <p className="text-[8px] font-mono text-zinc-700 uppercase ">
                    Requirements
                  </p>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {[
                      "Repo Selected",
                      "Project Name",
                      "Subdomain",
                      "Port",
                      "Dockerfile",
                    ].map((req) => {
                      const isErr =
                        (req === "Repo Selected" && !selectedRepo) ||
                        (req === "Project Name" && !projectName) ||
                        (req === "Subdomain" && !subdomain) ||
                        (req === "Port" && !port) ||
                        (req === "Dockerfile" && hasDockerfile !== true);
                      return (
                        <div key={req} className="flex items-center gap-2">
                          <div
                            className={`w-1 h-1 rotate-45 ${isErr ? "bg-zinc-800" : "bg-emerald-500 shadow-[0_0_4px_emerald]"}`}
                          />
                          <span
                            className={`text-[9px] uppercase tracking-tighter ${isErr ? "text-zinc-700" : "text-zinc-400"}`}
                          >
                            {req}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                onClick={handleDeploy}
                disabled={deploying || validationErrors.length > 0}
                className="w-full bg-white text-black py-4 font-bold uppercase tracking-[0.3em] text-[10px] rounded-[2px] hover:bg-zinc-200 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {deploying ? "Initializing Deployment..." : "Deploy Service →"}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="w-2/5 bg-[#030303] flex flex-col overflow-y-auto border-l border-[#1a1a1a]">
          <div className="p-10 flex flex-col h-full min-h-screen">
            <div className="mb-10">
              <p className="text-[8px] font-mono text-zinc-800 uppercase tracking-[0.5em] mb-3">
                Service Manifest
              </p>
              <h2 className="text-3xl font-bold tracking-tight uppercase truncate text-white leading-tight">
                {projectName || "Select Service"}
              </h2>
              {selectedRepo && (
                <p className="text-[10px] font-mono text-zinc-700 mt-2 truncate">
                  {selectedRepo.full_name}
                </p>
              )}
            </div>

            <div className="border border-[#1a1a1a] rounded-[2px] overflow-hidden mb-6">
              <ManifestRow
                label="Ingress URL"
                value={
                  subdomain ? `${subdomain}.p.hatchcloud.xyz` : "pending..."
                }
              />
              <ManifestRow
                label="Port Protocol"
                value={port ? `TCP/${port}` : "—"}
              />
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
              <ManifestRow label="Root Context" value={rootPath} />
              <ManifestRow
                label="Dockerfile"
                value={buildStatusLabel}
                accent={
                  hasDockerfile === true
                    ? "live"
                    : hasDockerfile === false
                      ? "failed"
                      : "neutral"
                }
                last
              />
            </div>

            {envVars.some((v) => v.key) && (
              <div className="border border-[#1a1a1a] rounded-[2px] px-5 py-4 mb-6">
                <p className="text-[9px] font-mono text-zinc-700 uppercase ">
                  {envVars.filter((v) => v.key).length} environment variable
                  {envVars.filter((v) => v.key).length !== 1 ? "s" : ""}{" "}
                  detected
                </p>
              </div>
            )}

            {hasDockerfile === false && !checkingDocker && selectedRepo && (
              <div className="border border-red-900/30 bg-red-900/5 rounded-[2px] px-5 py-4 mb-6">
                <p className="text-[9px] font-mono text-red-900 uppercase  leading-relaxed">
                  Dockerfile not detected in &quot;{rootPath}&quot;. Deployment
                  restricted.
                </p>
              </div>
            )}

            <div className="mt-auto space-y-3 pb-10">
              <p className="text-[8px] font-mono text-zinc-800 uppercase tracking-[0.4em]">
                Procedure
              </p>
              {["Select a repository", "Configure service", "Deploy"].map(
                (s, i) => {
                  const active =
                    (step === 1 && i === 0) ||
                    (step === 2 && i === 1) ||
                    (deploying && i === 2);
                  return (
                    <div key={s} className="flex items-center gap-3">
                      <span
                        className={`text-[9px] font-mono ${active ? "text-white" : "text-zinc-800"}`}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`text-[10px] uppercase tracking-tighter ${active ? "text-zinc-400" : "text-zinc-800"}`}
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

      {isBulkModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-pointer transition-opacity"
            onClick={() => setIsBulkModalOpen(false)}
          />

          <div className="relative w-full max-w-xl bg-[#0a0a0a] border border-zinc-800 shadow-2xl overflow-hidden flex flex-col">
            {/* Top Bar */}
            <div className="flex justify-between items-center px-8 py-6 border-b border-zinc-900 bg-black">
              <div>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.3em] text-white">
                  Environment Ingest
                </h2>
                <p className="text-[10px] text-zinc-500 font-mono mt-1.5 uppercase tracking-tighter">
                  Import bulk keys via text or local file
                </p>
              </div>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors cursor-pointer p-2"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M1 1L11 11M1 11L11 1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <div className="p-8 space-y-6">
              {/* File Upload Zone */}
              <div className="relative group">
                <input
                  type="file"
                  accept=".env,text/plain"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="border border-dashed border-zinc-800 bg-black/50 py-6 px-4 text-center group-hover:border-zinc-500 transition-colors">
                  <p className="text-[10px] font-mono text-zinc-500 uppercase ">
                    Click or drag <span className="text-white">.env</span> file
                    to upload
                  </p>
                </div>
              </div>

              {/* Text Area */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold text-zinc-600 uppercase  font-mono">
                    Raw Configuration
                  </span>
                  <span className="text-[9px] text-zinc-800 font-mono uppercase tracking-tighter italic">
                    Key=Value format
                  </span>
                </div>
                <textarea
                  autoFocus
                  value={bulkEnv}
                  onChange={(e) => setBulkEnv(e.target.value)}
                  placeholder={
                    "PORT=8080\nDB_URL=postgresql://...\nNODE_ENV=production"
                  }
                  className="w-full h-56 bg-black border border-zinc-900 p-5 text-[12px] font-mono text-zinc-400 outline-none focus:border-zinc-500 transition-all resize-none placeholder:text-zinc-900 leading-relaxed"
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-8 py-6 bg-black border-t border-zinc-900 flex justify-between items-center">
              <button
                onClick={() => setBulkEnv("")}
                className="text-[9px] font-bold uppercase  text-zinc-500 hover:text-white transition-colors cursor-pointer"
              >
                Clear
              </button>
              <div className="flex gap-4">
                <button
                  onClick={() => setIsBulkModalOpen(false)}
                  className="text-[9px] font-bold uppercase  text-zinc-500 hover:text-white transition-colors cursor-pointer px-4"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    parseBulkEnv(bulkEnv);
                    setIsBulkModalOpen(false);
                    setBulkEnv("");
                  }}
                  className="bg-white text-black px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-zinc-200 transition-colors cursor-pointer active:scale-95"
                >
                  Add Variables
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[9px] font-mono text-zinc-800">{index}</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
        {title}
      </span>
    </div>
  );
}

function ManifestRow({
  label,
  value,
  accent,
  last,
}: {
  label: string;
  value: string;
  accent?: "live" | "failed" | "neutral";
  last?: boolean;
}) {
  const valueColor =
    accent === "live"
      ? "text-emerald-500"
      : accent === "failed"
        ? "text-red-900"
        : "text-zinc-400";
  return (
    <div
      className={`flex justify-between items-center px-6 py-4 bg-[#050505] ${!last ? "border-b border-[#111]" : ""}`}
    >
      <span className="text-[9px] font-mono text-zinc-800 uppercase tracking-[0.2em]">
        {label}
      </span>
      <span
        className={`text-[10px] font-mono font-bold uppercase tracking-tight ${valueColor}`}
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
    <div className="space-y-3 group">
      <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500 group-focus-within:text-zinc-500 transition-colors">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent border-b border-[#1a1a1a] py-3 text-[12px] font-mono outline-none focus:border-zinc-500 transition-colors text-zinc-300 placeholder:text-zinc-500"
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
    <div className="space-y-3 group">
      <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#2a2a2a] group-focus-within:text-zinc-500 transition-colors">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent border-b border-[#1a1a1a] py-3 text-[12px] font-mono outline-none cursor-pointer appearance-none text-zinc-500 focus:text-white focus:border-zinc-500 transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-black text-white">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
