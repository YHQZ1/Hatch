/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/app/components/Navbar";

interface Repo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string;
  language: string;
  updated_at: string;
  stargazers_count?: number;
  open_issues_count?: number;
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

// Languages that almost always have a Dockerfile
const DOCKER_LIKELY = [
  "Go",
  "Rust",
  "Python",
  "Java",
  "PHP",
  "Ruby",
  "Elixir",
  "C#",
  "C++",
  "TypeScript",
  "JavaScript",
];

export default function NewProject() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [token, setToken] = useState<string | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
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
        setReposLoading(false);
      })
      .catch(() => setReposLoading(false));
  }, []);

  // when cpu changes, reset memory to first valid option
  useEffect(() => {
    const opts = MEMORY_OPTIONS[cpu];
    if (opts) setMemory(opts[0].value);
  }, [cpu]);

  const filteredRepos = repos.filter((r) =>
    r.full_name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelectRepo = (repo: Repo) => {
    setSelectedRepo(repo);
    setBranch(repo.default_branch || "main");
    // infer port from language
    if (repo.language === "Go") setPort("8080");
    else if (repo.language === "Python") setPort("8000");
    else if (repo.language === "Ruby") setPort("3000");
    else if (repo.language === "Java" || repo.language === "Kotlin")
      setPort("8080");
    else setPort("3000");
    setStep(2);
  };

  const handleDeploy = async () => {
    if (!selectedRepo || !token) return;
    setDeploying(true);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repo_name: selectedRepo.name,
        repo_url: selectedRepo.html_url,
      }),
    });
    if (res.ok) {
      const project = await res.json();
      router.push(`/projects/${project.id}`);
    } else {
      setDeploying(false);
    }
  };

  const addEnvVar = () => setEnvVars((p) => [...p, { key: "", value: "" }]);
  const removeEnvVar = (i: number) =>
    setEnvVars((p) => p.filter((_, idx) => idx !== i));
  const updateEnvVar = (i: number, f: "key" | "value", v: string) =>
    setEnvVars((p) => p.map((e, idx) => (idx === i ? { ...e, [f]: v } : e)));

  const dockerLikely = selectedRepo
    ? DOCKER_LIKELY.includes(selectedRepo.language)
    : false;
  const selectedCpuLabel =
    CPU_OPTIONS.find((o) => o.value === cpu)?.label ?? cpu;
  const selectedMemoryLabel =
    MEMORY_OPTIONS[cpu]?.find((o) => o.value === memory)?.label ?? memory;
  const updatedAt = selectedRepo
    ? new Date(selectedRepo.updated_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  if (!mounted) return <div className="min-h-screen bg-[var(--bg)]" />;

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] text-[var(--text-main)] flex flex-col relative overflow-hidden selection:bg-white selection:text-black font-sans">
      <Navbar />

      <main className="relative z-10 flex-grow flex flex-col lg:flex-row h-[calc(100vh-64px)] overflow-hidden">
        {/* ── LEFT PANEL ── */}
        <section className="w-full lg:w-[460px] border-r border-[var(--border)] bg-[var(--bg)] flex flex-col overflow-hidden z-20">
          {/* Panel header */}
          <div className="px-8 py-5 border-b border-[var(--border)] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <StepDot active={step === 1} done={step === 2} n={1} />
              <StepDot active={step === 2} done={false} n={2} />
            </div>
            <span className="font-mono text-[9px] text-[var(--text-muted)] uppercase tracking-[0.25em]">
              {step === 1 ? "Select_Source" : "Configure_Runtime"}
            </span>
          </div>

          <div className="flex-grow overflow-y-auto no-scrollbar">
            {/* ── STEP 1: REPO SELECT ── */}
            {step === 1 && (
              <div className="p-8 space-y-6">
                <div>
                  <h1 className="text-3xl font-medium tracking-tighter">
                    Source
                  </h1>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1 font-light">
                    Select the repository to deploy.
                  </p>
                </div>

                <input
                  type="text"
                  placeholder="Filter repositories..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] px-4 h-11 text-sm font-mono outline-none focus:border-[var(--border-focus)] transition-all placeholder-[#333]"
                />

                <div className="border border-[var(--border)] overflow-hidden">
                  {reposLoading ? (
                    [...Array(7)].map((_, i) => (
                      <div
                        key={i}
                        className="h-14 bg-[var(--bg)] border-b border-[var(--border)] animate-pulse"
                        style={{ opacity: 1 - i * 0.12 }}
                      />
                    ))
                  ) : filteredRepos.length === 0 ? (
                    <div className="h-24 flex items-center justify-center">
                      <span className="font-mono text-[9px] text-[#333] uppercase tracking-widest">
                        No repositories found
                      </span>
                    </div>
                  ) : (
                    filteredRepos.map((repo) => (
                      <button
                        key={repo.id}
                        onClick={() => handleSelectRepo(repo)}
                        className="w-full flex items-center justify-between px-5 py-3.5 bg-[var(--bg)] hover:bg-[var(--surface)] border-b border-[var(--border)] last:border-0 transition-all text-left group"
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src="https://cdn.simpleicons.org/github/FFFFFF"
                            className="w-3.5 h-3.5 opacity-20 group-hover:opacity-70 transition-opacity"
                            alt=""
                          />
                          <div>
                            <p className="text-sm font-medium text-[#ccc] group-hover:text-white transition-colors">
                              {repo.name}
                            </p>
                            <p className="font-mono text-[8px] text-[#333] uppercase tracking-widest mt-0.5">
                              {repo.language || "—"}
                              {repo.private ? " · Private" : ""}
                            </p>
                          </div>
                        </div>
                        <span className="font-mono text-[10px] text-[#444] group-hover:text-white transition-colors">
                          →
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ── STEP 2: CONFIGURE ── */}
            {step === 2 && selectedRepo && (
              <div className="p-8 space-y-8">
                <div>
                  <h1 className="text-3xl font-medium tracking-tighter">
                    Configure
                  </h1>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1 font-light">
                    Set runtime parameters for{" "}
                    <span className="text-white font-mono">
                      {selectedRepo.name}
                    </span>
                  </p>
                </div>

                {/* Dockerfile warning */}
                {!dockerLikely && (
                  <div className="border border-yellow-900/50 bg-yellow-900/10 px-4 py-3 flex items-start gap-3">
                    <span className="text-yellow-500 text-xs mt-0.5">⚠</span>
                    <p className="font-mono text-[9px] text-yellow-500/80 leading-relaxed uppercase tracking-wider">
                      Ensure a Dockerfile exists at the root of this repository.
                      Hatch requires it to build your image.
                    </p>
                  </div>
                )}

                <div className="space-y-6">
                  <Field label="Branch" sub="Source branch to deploy from">
                    <input
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="w-full bg-transparent border-b border-[var(--border)] py-2 text-sm font-mono outline-none focus:border-white transition-colors"
                    />
                  </Field>

                  <Field
                    label="Exposed Port"
                    sub="Port your container listens on"
                  >
                    <input
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      className="w-full bg-transparent border-b border-[var(--border)] py-2 text-sm font-mono outline-none focus:border-white transition-colors"
                    />
                  </Field>

                  <Field
                    label="Health Check Path"
                    sub="Used by ALB to verify container health"
                  >
                    <input
                      value={healthCheck}
                      onChange={(e) => setHealthCheck(e.target.value)}
                      className="w-full bg-transparent border-b border-[var(--border)] py-2 text-sm font-mono outline-none focus:border-white transition-colors"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-6">
                    <Field label="CPU" sub="Fargate CPU units">
                      <select
                        value={cpu}
                        onChange={(e) => setCpu(e.target.value)}
                        className="w-full bg-transparent border-b border-[var(--border)] py-2 text-sm font-mono outline-none focus:border-white transition-colors cursor-pointer appearance-none"
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
                    </Field>
                    <Field label="Memory" sub="Container RAM">
                      <select
                        value={memory}
                        onChange={(e) => setMemory(e.target.value)}
                        className="w-full bg-transparent border-b border-[var(--border)] py-2 text-sm font-mono outline-none focus:border-white transition-colors cursor-pointer appearance-none"
                      >
                        {(MEMORY_OPTIONS[cpu] ?? []).map((o) => (
                          <option
                            key={o.value}
                            value={o.value}
                            className="bg-black"
                          >
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  {/* Env vars */}
                  <Field
                    label="Environment Variables"
                    sub="Encrypted at rest via AWS Secrets Manager"
                  >
                    <div className="space-y-px mt-2">
                      {envVars.map((e, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-[1fr_1fr_auto] gap-px bg-[var(--border)]"
                        >
                          <input
                            type="text"
                            placeholder="KEY"
                            value={e.key}
                            onChange={(ev) =>
                              updateEnvVar(i, "key", ev.target.value)
                            }
                            className="h-9 bg-[var(--bg)] px-3 font-mono text-xs text-white placeholder-[#333] outline-none focus:bg-[var(--surface)]"
                          />
                          <input
                            type="text"
                            placeholder="value"
                            value={e.value}
                            onChange={(ev) =>
                              updateEnvVar(i, "value", ev.target.value)
                            }
                            className="h-9 bg-[var(--bg)] px-3 font-mono text-xs text-white placeholder-[#333] outline-none focus:bg-[var(--surface)]"
                          />
                          <button
                            onClick={() => removeEnvVar(i)}
                            className="h-9 w-9 bg-[var(--bg)] hover:bg-red-950 flex items-center justify-center text-[#444] hover:text-red-400 transition-colors font-mono text-xs"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={addEnvVar}
                        className="w-full h-9 border border-dashed border-[var(--border)] hover:border-[var(--border-focus)] font-mono text-[9px] text-[#444] hover:text-white transition-colors uppercase tracking-widest"
                      >
                        + Add Variable
                      </button>
                    </div>
                  </Field>
                </div>

                <div className="pt-6 border-t border-[var(--border)] space-y-3">
                  <button
                    onClick={handleDeploy}
                    disabled={deploying}
                    className="w-full bg-white text-black h-13 py-4 font-bold font-mono text-[11px] uppercase tracking-[0.2em] hover:bg-[#e5e5e5] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {deploying ? "Initializing Stack..." : "Begin Deployment →"}
                  </button>
                  <button
                    onClick={() => setStep(1)}
                    className="w-full text-center font-mono text-[9px] text-[#444] hover:text-white uppercase tracking-widest transition-colors py-1"
                  >
                    [ Change Repository ]
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── RIGHT PANEL ── */}
        <section className="flex-grow bg-[#050505] relative flex flex-col items-center justify-center p-8 lg:p-16 overflow-hidden">
          <div className="absolute inset-0 bg-grid-pattern opacity-[0.025]" />

          <div className="w-full max-w-2xl border border-[var(--border)] bg-[var(--bg)] flex flex-col relative z-10 shadow-2xl">
            {/* Panel header */}
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[#050505]">
              <div className="flex items-center gap-2">
                <div
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${selectedRepo ? "bg-white" : "bg-[#1a1a1a]"}`}
                />
                <span className="font-mono text-[9px] text-[var(--text-muted)] uppercase tracking-widest">
                  {selectedRepo ? "Entity_Locked" : "Awaiting_Source"}
                </span>
              </div>
              <span className="font-mono text-[9px] text-[#333] uppercase tracking-widest">
                {step === 1 ? "Step_01 / Select" : "Step_02 / Configure"}
              </span>
            </div>

            {!selectedRepo ? (
              /* ── No repo selected ── */
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-10 h-10 border border-[#1a1a1a] flex items-center justify-center">
                  <img
                    src="https://cdn.simpleicons.org/github/FFFFFF"
                    className="w-4 h-4 opacity-10"
                    alt=""
                  />
                </div>
                <p className="font-mono text-[9px] text-[#333] uppercase tracking-widest">
                  Select a repository to begin
                </p>
              </div>
            ) : (
              /* ── Repo selected ── */
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border)]">
                {/* Left: repo metadata */}
                <div className="p-8 space-y-8">
                  <div>
                    <p className="font-mono text-[8px] text-[#333] uppercase tracking-widest mb-2">
                      Repository
                    </p>
                    <h2 className="text-3xl font-medium tracking-tighter text-white leading-none">
                      {selectedRepo.name}
                    </h2>
                    {selectedRepo.description && (
                      <p className="text-[11px] text-[var(--text-muted)] mt-2 leading-relaxed">
                        {selectedRepo.description}
                      </p>
                    )}
                  </div>

                  <div className="space-y-4">
                    <MetaRow
                      label="Language"
                      value={selectedRepo.language || "—"}
                    />
                    <MetaRow
                      label="Default Branch"
                      value={selectedRepo.default_branch || "main"}
                    />
                    <MetaRow
                      label="Stars"
                      value={selectedRepo.stargazers_count?.toString() ?? "0"}
                    />
                    <MetaRow
                      label="Open Issues"
                      value={selectedRepo.open_issues_count?.toString() ?? "0"}
                    />
                    <MetaRow
                      label="Visibility"
                      value={selectedRepo.private ? "Private" : "Public"}
                    />
                    <MetaRow label="Last Updated" value={updatedAt ?? "—"} />
                  </div>
                </div>

                {/* Right: deployment preview */}
                <div className="p-8 bg-[#080808] flex flex-col gap-8">
                  <div>
                    <p className="font-mono text-[8px] text-[#333] uppercase tracking-widest mb-4">
                      Deployment_Manifest
                    </p>
                    <div className="font-mono text-[10px] leading-relaxed space-y-1 bg-black border border-[var(--border)] p-5">
                      <p className="text-blue-400">
                        manifest <span className="text-[#555]">=</span> {"{"}
                      </p>
                      <p className="pl-4 text-[#555]">
                        repo:{" "}
                        <span className="text-white">
                          "{selectedRepo.name}"
                        </span>
                        ,
                      </p>
                      <p className="pl-4 text-[#555]">
                        branch: <span className="text-white">"{branch}"</span>,
                      </p>
                      <p className="pl-4 text-[#555]">
                        port: <span className="text-green-400">{port}</span>,
                      </p>
                      <p className="pl-4 text-[#555]">
                        cpu:{" "}
                        <span className="text-yellow-400">
                          "{selectedCpuLabel}"
                        </span>
                        ,
                      </p>
                      <p className="pl-4 text-[#555]">
                        memory:{" "}
                        <span className="text-yellow-400">
                          "{selectedMemoryLabel}"
                        </span>
                        ,
                      </p>
                      <p className="pl-4 text-[#555]">
                        health:{" "}
                        <span className="text-white">"{healthCheck}"</span>,
                      </p>
                      <p className="pl-4 text-[#555]">
                        env_vars:{" "}
                        <span className="text-green-400">
                          {envVars.filter((e) => e.key).length}
                        </span>
                        ,
                      </p>
                      <p className="pl-4 text-[#555]">
                        runtime:{" "}
                        <span className="text-white">"aws_fargate"</span>,
                      </p>
                      <p className="pl-4 text-[#555]">
                        region: <span className="text-white">"ap-south-1"</span>
                      </p>
                      <p className="text-blue-400">{"}"}</p>
                    </div>
                  </div>

                  {/* Dockerfile status */}
                  <div
                    className={`flex items-center gap-3 px-4 py-3 border ${dockerLikely ? "border-green-900/40 bg-green-900/5" : "border-yellow-900/40 bg-yellow-900/5"}`}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${dockerLikely ? "bg-[#10b981]" : "bg-yellow-500"}`}
                    />
                    <p
                      className={`font-mono text-[8px] uppercase tracking-wider ${dockerLikely ? "text-[#10b981]/70" : "text-yellow-500/70"}`}
                    >
                      {dockerLikely
                        ? "Dockerfile likely present for this language"
                        : "Verify Dockerfile exists at repo root"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Watermark */}
          <div className="absolute -bottom-8 right-8 text-[160px] font-bold text-white/[0.012] select-none pointer-events-none tracking-tighter">
            HATCH
          </div>
        </section>
      </main>
    </div>
  );
}

// --- HELPERS ---

function StepDot({
  n,
  active,
  done,
}: {
  n: number;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className={`flex items-center gap-1.5`}>
      <div
        className={`w-4 h-4 flex items-center justify-center font-mono text-[8px] font-bold border transition-colors ${
          done
            ? "bg-[#10b981] border-[#10b981] text-black"
            : active
              ? "bg-white border-white text-black"
              : "bg-transparent border-[#333] text-[#333]"
        }`}
      >
        {done ? "✓" : n}
      </div>
    </div>
  );
}

function Field({
  label,
  sub,
  children,
}: {
  label: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-[9px] text-white uppercase tracking-widest">
        {label}
      </p>
      <p className="font-mono text-[8px] text-[#444] uppercase tracking-wider">
        {sub}
      </p>
      {children}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#0f0f0f] pb-2">
      <span className="font-mono text-[8px] text-[#333] uppercase tracking-widest">
        {label}
      </span>
      <span className="font-mono text-[10px] text-[#888]">{value}</span>
    </div>
  );
}
