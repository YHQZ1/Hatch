/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

  const [branch, setBranch] = useState("main");
  const [port, setPort] = useState("3000");
  const [cpu, setCpu] = useState("512");
  const [memory, setMemory] = useState("1024");
  const [healthCheck, setHealthCheck] = useState("/");
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
  }, []);

  useEffect(() => {
    const opts = MEMORY_OPTIONS[cpu];
    if (opts) setMemory(opts[0].value);
  }, [cpu]);

  const checkDockerfile = async (repoFullName: string, t: string) => {
    setCheckingDocker(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/github/repos/${repoFullName}/dockerfile`,
        { headers: { Authorization: `Bearer ${t}` } },
      );
      setHasDockerfile(res.status === 200);
    } catch {
      setHasDockerfile(false);
    } finally {
      setCheckingDocker(false);
    }
  };

  const handleSelectRepo = (repo: Repo) => {
    setSelectedRepo(repo);
    setBranch(repo.default_branch || "main");
    if (repo.language === "Go") setPort("8080");
    else if (repo.language === "Python") setPort("8000");
    else setPort("3000");

    if (token) checkDockerfile(repo.full_name, token);
    setStep(2);
  };

  const handleDeploy = async () => {
    if (!selectedRepo || !token || !hasDockerfile) return;
    setDeploying(true);
    const envVarsMap: Record<string, string> = {};
    envVars.forEach(({ key, value }) => {
      if (key.trim()) envVarsMap[key.trim()] = value;
    });

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
            repo_name: selectedRepo.name,
            repo_url: selectedRepo.html_url,
          }),
        },
      );
      if (!projectRes.ok) throw new Error();
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

  if (!mounted) return null;

  const filteredRepos = repos.filter((r) =>
    r.full_name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="w-full min-h-screen bg-black text-white flex flex-col items-center relative z-20">
      {/* FAIL-PROOF GRID LAYER */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)`,
            backgroundSize: "30px 30px",
            maskImage:
              "radial-gradient(circle at center, white 0%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(circle at center, white 0%, transparent 80%)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black opacity-60" />
      </div>

      <header className="w-full max-w-4xl px-6 py-12 flex flex-col gap-4 relative z-10">
        <nav className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-600">
          <span className={step >= 1 ? "text-white" : ""}>01 Source</span>
          <span>/</span>
          <span className={step >= 2 ? "text-white" : ""}>02 Configure</span>
        </nav>
        <h1 className="text-4xl font-medium tracking-tighter uppercase">
          {step === 1 ? "Import Source" : "Build Config"}
        </h1>
      </header>

      <main className="w-full max-w-4xl px-6 pb-24 relative z-10">
        {step === 1 ? (
          <div className="space-y-6 animate-in">
            <input
              type="text"
              placeholder="Search repositories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-black/40 backdrop-blur-md border border-[#1a1a1a] px-5 py-4 text-sm font-mono outline-none focus:border-white transition-all rounded-[2px] placeholder-zinc-800"
            />
            <div className="border border-[#1a1a1a] rounded-[2px] overflow-hidden bg-[#050505]/80 backdrop-blur-xl">
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse border-b border-[#1a1a1a] last:border-0 bg-white/5"
                  />
                ))
              ) : (
                <div className="divide-y divide-[#1a1a1a]">
                  {filteredRepos.map((repo) => (
                    <div
                      key={repo.id}
                      onClick={() => handleSelectRepo(repo)}
                      className="flex items-center justify-between px-6 py-4 hover:bg-white/[0.03] transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 border border-[#1a1a1a] rounded-sm flex items-center justify-center bg-black group-hover:border-zinc-700">
                          <img
                            src="https://cdn.simpleicons.org/github/FFFFFF"
                            className="w-4 h-4 opacity-40 group-hover:opacity-100"
                            alt=""
                          />
                        </div>
                        <div>
                          <h3 className="text-[15px] font-semibold text-zinc-100 group-hover:text-white">
                            {repo.name}
                          </h3>
                          <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-tighter">
                            {repo.language || "Web"}
                          </span>
                        </div>
                      </div>
                      <button className="text-[10px] font-bold uppercase tracking-widest text-zinc-700 group-hover:text-white border border-zinc-900 group-hover:border-zinc-600 px-4 py-1.5 rounded-sm transition-all cursor-pointer">
                        Import
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 animate-in">
            <div className="lg:col-span-7 space-y-10">
              {!checkingDocker && hasDockerfile === false && (
                <div className="border border-red-900/30 bg-red-900/5 px-4 py-3 rounded-sm backdrop-blur-md">
                  <p className="font-mono text-[10px] text-red-500 uppercase tracking-wider">
                    Critical: No Dockerfile detected. Deployment will fail.
                  </p>
                </div>
              )}
              <ConfigSection title="Project Details">
                <ConfigField
                  label="Repository Path"
                  value={selectedRepo?.full_name || ""}
                  disabled
                />
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">
                    Deployment Branch
                  </label>
                  <input
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full bg-transparent border-b border-zinc-800 py-2 text-sm font-mono outline-none focus:border-white transition-colors"
                  />
                </div>
              </ConfigSection>
              <ConfigSection title="Instance Specs">
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">
                      vCPU Unit
                    </label>
                    <select
                      value={cpu}
                      onChange={(e) => setCpu(e.target.value)}
                      className="w-full bg-transparent border-b border-zinc-800 py-2 text-sm font-mono outline-none cursor-pointer appearance-none"
                    >
                      {CPU_OPTIONS.map((o) => (
                        <option
                          key={o.value}
                          value={o.value}
                          className="bg-black"
                        >
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">
                      Memory (RAM)
                    </label>
                    <select
                      value={memory}
                      onChange={(e) => setMemory(e.target.value)}
                      className="w-full bg-transparent border-b border-zinc-800 py-2 text-sm font-mono outline-none cursor-pointer appearance-none"
                    >
                      {(MEMORY_OPTIONS[cpu] || []).map((o) => (
                        <option
                          key={o.value}
                          value={o.value}
                          className="bg-black"
                        >
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">
                      Exposed Port
                    </label>
                    <input
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      className="w-full bg-transparent border-b border-zinc-800 py-2 text-sm font-mono outline-none focus:border-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">
                      Health Check
                    </label>
                    <input
                      value={healthCheck}
                      onChange={(e) => setHealthCheck(e.target.value)}
                      className="w-full bg-transparent border-b border-zinc-800 py-2 text-sm font-mono outline-none focus:border-white"
                    />
                  </div>
                </div>
              </ConfigSection>
              <ConfigSection title="Secrets & Variables">
                <div className="space-y-3">
                  {envVars.map((e, i) => (
                    <div
                      key={i}
                      className="flex gap-px bg-zinc-800 border border-zinc-800 rounded-sm overflow-hidden"
                    >
                      <input
                        placeholder="KEY"
                        value={e.key}
                        onChange={(ev) => {
                          const n = [...envVars];
                          n[i].key = ev.target.value;
                          setEnvVars(n);
                        }}
                        className="flex-1 bg-black px-3 py-2 text-xs font-mono outline-none"
                      />
                      <input
                        placeholder="VALUE"
                        value={e.value}
                        onChange={(ev) => {
                          const n = [...envVars];
                          n[i].value = ev.target.value;
                          setEnvVars(n);
                        }}
                        className="flex-1 bg-black px-3 py-2 text-xs font-mono outline-none text-white"
                      />
                      <button
                        onClick={() =>
                          setEnvVars(envVars.filter((_, idx) => idx !== i))
                        }
                        className="bg-black px-4 text-zinc-600 hover:text-red-500 cursor-pointer transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      setEnvVars([...envVars, { key: "", value: "" }])
                    }
                    className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest hover:text-white transition-colors cursor-pointer py-2"
                  >
                    + Register Variable
                  </button>
                </div>
              </ConfigSection>
              <div className="pt-10 border-t border-zinc-900 flex items-center gap-6">
                <button
                  onClick={() => setStep(1)}
                  className="text-[11px] font-bold uppercase tracking-widest text-zinc-600 hover:text-white transition-colors cursor-pointer"
                >
                  [ Back ]
                </button>
                <button
                  onClick={handleDeploy}
                  disabled={
                    deploying || checkingDocker || hasDockerfile === false
                  }
                  className="flex-1 bg-white text-black font-bold text-[11px] uppercase tracking-[0.2em] py-4 rounded-[2px] hover:bg-zinc-200 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {deploying ? "Initializing..." : "Begin Deployment →"}
                </button>
              </div>
            </div>
            <aside className="lg:col-span-5">
              <div className="sticky top-32 border border-[#1a1a1a] bg-[#050505]/80 backdrop-blur-md p-8 rounded-[2px] space-y-8 shadow-2xl">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                    Reviewing_Entity
                  </p>
                  <h3 className="text-3xl font-medium tracking-tighter truncate">
                    {selectedRepo?.name}
                  </h3>
                </div>
                <div className="space-y-5">
                  <SummaryRow label="Region" value="ap-south-1 (Mumbai)" />
                  <SummaryRow label="Provisioning" value="AWS Fargate" />
                  <SummaryRow label="Auto-SSL" value="Enabled" />
                  <SummaryRow
                    label="Language"
                    value={selectedRepo?.language || "Detected"}
                  />
                </div>
                <div
                  className={`p-4 border ${hasDockerfile ? "border-zinc-800 bg-zinc-900/10" : "border-red-900/20 bg-red-900/5"} rounded-sm flex items-center gap-3 transition-colors`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${checkingDocker ? "bg-zinc-600 animate-pulse" : hasDockerfile ? "bg-white shadow-[0_0_8px_white]" : "bg-red-500 shadow-[0_0_8px_red]"}`}
                  />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                    {checkingDocker
                      ? "Scanning..."
                      : hasDockerfile
                        ? "Dockerfile_Verified"
                        : "Dockerfile_Missing"}
                  </span>
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function ConfigSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6 relative z-10">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-500 border-b border-zinc-900 pb-2">
        {title}
      </h2>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

function ConfigField({
  label,
  value,
  disabled,
}: {
  label: string;
  value: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">
        {label}
      </label>
      <input
        defaultValue={value}
        disabled={disabled}
        className={`w-full bg-transparent border-b border-zinc-800 py-2 text-sm font-mono outline-none ${disabled ? "text-zinc-600 cursor-not-allowed" : "text-white"}`}
      />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center border-b border-zinc-900 pb-3">
      <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-mono">
        {label}
      </span>
      <span className="text-xs font-medium text-white">{value}</span>
    </div>
  );
}
