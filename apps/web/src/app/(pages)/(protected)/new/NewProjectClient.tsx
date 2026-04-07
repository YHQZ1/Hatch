/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect, useCallback } from "react";
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

export default function NewProject() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [token, setToken] = useState<string | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Configuration States
  const [projectName, setProjectName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [branch, setBranch] = useState("main");
  const [port, setPort] = useState("80");
  const [cpu, setCpu] = useState("512");
  const [memory, setMemory] = useState("1024");
  const [healthCheck, setHealthCheck] = useState("/health");
  // Changed from Dockerfile to Build Context Path
  const [rootPath, setRootPath] = useState("./");
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [hasDockerfile, setHasDockerfile] = useState<boolean | null>(null);
  const [checkingDocker, setCheckingDocker] = useState(false);

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

  const handleDeploy = async () => {
    if (!selectedRepo || !token || !hasDockerfile) return;
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
            repo_name: projectName || selectedRepo.name,
            repo_url: selectedRepo.html_url,
            subdomain,
            branch,
            dockerfile_path: finalDockerPath,
            port: parseInt(port),
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
    } catch (err) {
      setDeploying(false);
    }
  };

  const sanitizePath = (path: string) => {
    return path
      .replace(/^\.\//, "")
      .replace(/\/+$/, "")
      .replace(/\/+/g, "/")
      .trim();
  };

  if (!mounted) return null;

  return (
    <div className="w-full h-screen bg-black text-white flex flex-col font-sans overflow-hidden">
      <header className="w-full border-b border-zinc-900 px-8 py-4 flex justify-between items-center shrink-0 bg-black z-20">
        <div className="flex items-center gap-4">
          <h1 className="text-md font-bold uppercase tracking-tight">
            Provision New Service
          </h1>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* LEFT PANEL: CONFIGURATION */}
        <div className="w-3/5 border-r border-zinc-900 flex flex-col overflow-y-auto scrollbar-hide bg-black">
          <div className="p-12 space-y-16">
            {/* SECTION 01: SOURCE */}
            <section className="space-y-6">
              <div className="flex justify-between items-end border-b border-zinc-900 pb-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Source Selection
                </h2>
                {step === 2 && (
                  <button
                    onClick={() => {
                      setStep(1);
                      setSelectedRepo(null);
                    }}
                    className="text-[12px] font-bold text-zinc-600 hover:text-white uppercase transition-colors cursor-pointer"
                  >
                    [ Switch Repository ]
                  </button>
                )}
              </div>

              {step === 1 ? (
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Search GitHub repositories..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-zinc-900/40 border border-zinc-800 px-5 py-3 text-sm font-mono outline-none focus:border-zinc-500 transition-all rounded-sm"
                  />
                  <div className="border border-zinc-900 rounded-sm overflow-hidden divide-y divide-zinc-900 bg-zinc-950/20">
                    {loading ? (
                      <div className="p-10 text-center text-zinc-800 font-mono text-[10px] uppercase tracking-[0.3em] animate-pulse">
                        Fetching_Registry...
                      </div>
                    ) : (
                      repos
                        .filter((r) =>
                          r.full_name
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        )
                        .map((repo) => (
                          <div
                            key={repo.id}
                            onClick={() => handleSelectRepo(repo)}
                            className="flex items-center justify-between px-6 py-4 hover:bg-zinc-900 transition-all cursor-pointer group"
                          >
                            <div className="flex items-center gap-4">
                              <img
                                src="https://cdn.simpleicons.org/github/666666"
                                className="w-3.5 h-3.5 group-hover:invert transition-all"
                                alt=""
                              />
                              <span className="text-sm font-medium text-zinc-400 group-hover:text-white transition-colors">
                                {repo.name}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-800 group-hover:text-zinc-500">
                              Import
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-6 bg-zinc-900/20 border border-zinc-800 rounded-sm flex items-center gap-4">
                  <img
                    src="https://cdn.simpleicons.org/github/FFFFFF"
                    className="w-5 h-5 opacity-50"
                    alt=""
                  />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">
                      {selectedRepo?.name}
                    </p>
                    <p className="text-[10px] font-mono text-zinc-600">
                      {selectedRepo?.html_url}
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* SECTION 02: CORE CONFIG */}
            <div
              className={
                step === 2
                  ? "opacity-100 space-y-16 pb-20"
                  : "opacity-10 pointer-events-none space-y-16"
              }
            >
              <section className="space-y-8">
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 border-b border-zinc-900 pb-4">
                  Service Identity
                </h2>
                <div className="grid grid-cols-2 gap-10">
                  <InputField
                    label="Project Name"
                    value={projectName}
                    onChange={setProjectName}
                    placeholder="Production API"
                  />
                  <div className="space-y-2 group">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-700 group-focus-within:text-white transition-colors">
                      Subdomain Prefix
                    </label>
                    <div className="flex items-center border-b border-zinc-800 focus-within:border-white transition-colors">
                      <input
                        value={subdomain}
                        onChange={(e) =>
                          setSubdomain(
                            e.target.value.toLowerCase().replace(/\s+/g, "-"),
                          )
                        }
                        className="flex-1 bg-transparent py-3 text-sm font-mono outline-none"
                      />
                      <span className="text-[10px] font-mono text-zinc-700">
                        .hatchcloud.xyz
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-8">
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 border-b border-zinc-900 pb-4">
                  Resource Allocation
                </h2>
                <div className="grid grid-cols-2 gap-10">
                  <SelectField
                    label="Compute (vCPU)"
                    value={cpu}
                    options={CPU_OPTIONS}
                    onChange={setCpu}
                  />
                  <SelectField
                    label="Memory (RAM)"
                    value={memory}
                    options={MEMORY_OPTIONS[cpu] || []}
                    onChange={setMemory}
                  />
                </div>
                <div className="grid grid-cols-2 gap-10">
                  <InputField
                    label="Ingress Port"
                    value={port}
                    onChange={setPort}
                    placeholder="80"
                  />
                  <InputField
                    label="Health Check Path"
                    value={healthCheck}
                    onChange={setHealthCheck}
                    placeholder="/health"
                  />
                </div>
              </section>

              <section className="space-y-8">
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 border-b border-zinc-900 pb-4">
                  Build Definitions
                </h2>
                <div className="grid grid-cols-2 gap-10">
                  {/* CHANGED: Dockerfile Path -> Build Context */}
                  <InputField
                    label="Root Directory"
                    value={rootPath}
                    onChange={(v) => {
                      setRootPath(v);
                      if (token && selectedRepo)
                        debouncedCheck(selectedRepo.full_name, token, v);
                    }}
                    placeholder="./"
                  />
                  <InputField
                    label="Deployment Branch"
                    value={branch}
                    onChange={setBranch}
                  />
                </div>
              </section>

              <button
                onClick={handleDeploy}
                disabled={deploying || !hasDockerfile}
                className="w-full bg-white text-black py-5 font-bold uppercase tracking-[0.3em] text-[11px] rounded-sm hover:bg-zinc-200 transition-all disabled:opacity-10 shadow-[0_0_20px_rgba(255,255,255,0.05)] cursor-pointer"
              >
                {deploying ? "Initializing Deployment..." : "Deploy Service"}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: BLUEPRINT MANIFEST */}
        <div className="w-2/5 bg-[#030303] p-12 lg:p-20 flex flex-col justify-between">
          <div className="space-y-12">
            <div className="space-y-3">
              <span className="text-[9px] font-mono text-zinc-700 uppercase tracking-[0.5em]">
                Service Manifest
              </span>
              <h3 className="text-4xl font-bold tracking-tight uppercase truncate">
                {projectName || "Untitled_Service"}
              </h3>
            </div>

            <div className="space-y-6">
              <ManifestRow
                label="Ingress URL"
                value={`${subdomain || "..."}.hatchcloud.xyz`}
              />
              <ManifestRow label="Port Protocol" value={`TCP/${port}`} />
              <ManifestRow
                label="CPU Allocation"
                value={CPU_OPTIONS.find((o) => o.value === cpu)?.label || "..."}
              />
              <ManifestRow
                label="Memory Limit"
                value={
                  MEMORY_OPTIONS[cpu]?.find((o) => o.value === memory)?.label ||
                  "..."
                }
              />
              <ManifestRow label="Root Context" value={rootPath} />
              <ManifestRow
                label="Build Status"
                value={
                  checkingDocker
                    ? "Scanning..."
                    : hasDockerfile
                      ? "Verified"
                      : "Pending"
                }
              />
            </div>

            {/* IMPROVED: Simple, decent message without the red */}
            {hasDockerfile === false && !checkingDocker && (
              <div className="p-5 border border-zinc-800 bg-zinc-900/20 rounded-sm">
                <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest leading-relaxed">
                  Notice: Dockerfile not detected in "{rootPath}". Deployment
                  requires a valid Dockerfile in your root directory.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* Internal Components */

function ManifestRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center border-b border-zinc-900 pb-4">
      <span className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
        {label}
      </span>
      <span className="text-xs font-bold text-zinc-300">{value}</span>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder }: any) {
  return (
    <div className="space-y-2 group">
      <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-700 group-focus-within:text-white transition-colors">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent border-b border-zinc-800 py-3 text-sm font-mono outline-none focus:border-white transition-colors"
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: any) {
  return (
    <div className="space-y-2 group">
      <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-700 group-focus-within:text-white transition-colors">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent border-b border-zinc-800 py-3 text-sm font-mono outline-none cursor-pointer appearance-none text-zinc-400 focus:text-white"
      >
        {options.map((o: any) => (
          <option key={o.value} value={o.value} className="bg-black">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
