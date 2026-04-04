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
    if (repo.language === "Go") setPort("8080");
    else if (repo.language === "Python") setPort("8000");
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
        <section className="w-full lg:w-[480px] border-r border-[var(--border)] bg-[var(--bg)] flex flex-col overflow-hidden z-20">
          <div className="px-8 py-6 border-b border-[var(--border)] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <StepDot active={step === 1} done={step === 2} n={1} />
              <StepDot active={step === 2} done={false} n={2} />
            </div>
            <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-[0.2em] font-medium">
              {step === 1 ? "01 / Source" : "02 / Configure"}
            </span>
          </div>

          <div className="flex-grow overflow-y-auto no-scrollbar">
            {step === 1 && (
              <div className="p-10 space-y-8">
                <div>
                  <h1 className="text-4xl font-medium tracking-tighter text-white">
                    Source
                  </h1>
                  <p className="text-[13px] text-[var(--text-muted)] mt-2 font-light leading-relaxed">
                    Select a GitHub repository to initialize your deployment
                    pipeline.
                  </p>
                </div>

                <input
                  type="text"
                  placeholder="Filter repositories..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] px-4 h-12 text-sm font-mono outline-none focus:border-white transition-all placeholder-[#444] text-white"
                />

                <div className="border border-[var(--border)]">
                  {reposLoading ? (
                    [...Array(7)].map((_, i) => (
                      <div
                        key={i}
                        className="h-16 bg-[var(--bg)] border-b border-[var(--border)] animate-pulse"
                      />
                    ))
                  ) : filteredRepos.length === 0 ? (
                    <div className="h-32 flex items-center justify-center">
                      <span className="font-mono text-[10px] text-[#555] uppercase tracking-widest">
                        No matching repositories
                      </span>
                    </div>
                  ) : (
                    filteredRepos.map((repo) => (
                      <button
                        key={repo.id}
                        onClick={() => handleSelectRepo(repo)}
                        className="w-full flex items-center justify-between px-6 py-4 bg-[var(--bg)] hover:bg-[var(--surface)] border-b border-[var(--border)] last:border-0 transition-all text-left group cursor-pointer"
                      >
                        <div className="flex items-center gap-4">
                          <img
                            src="https://cdn.simpleicons.org/github/FFFFFF"
                            className="w-4 h-4 opacity-30 group-hover:opacity-100 transition-opacity"
                            alt=""
                          />
                          <div>
                            <p className="text-[14px] font-medium text-[#eee] group-hover:text-white transition-colors">
                              {repo.name}
                            </p>
                            <p className="font-mono text-[9px] text-[#666] uppercase tracking-wider mt-1 font-bold group-hover:text-[#999]">
                              {repo.language || "Unknown"}{" "}
                              {repo.private ? "· Private" : "· Public"}
                            </p>
                          </div>
                        </div>
                        <span className="font-mono text-xs text-[#444] group-hover:text-white transition-colors pr-2">
                          →
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {step === 2 && selectedRepo && (
              <div className="p-10 space-y-10">
                <div>
                  <h1 className="text-4xl font-medium tracking-tighter text-white">
                    Configure
                  </h1>
                  <p className="text-[13px] text-[var(--text-muted)] mt-2 font-light leading-relaxed">
                    Runtime parameters for{" "}
                    <span className="text-white font-mono bg-white/5 px-1.5 py-0.5 rounded-sm">
                      {selectedRepo.name}
                    </span>
                  </p>
                </div>

                {!dockerLikely && (
                  <div className="border border-white/10 bg-white/[0.02] px-5 py-4 flex items-start gap-4">
                    <span className="text-white text-xs mt-0.5">!</span>
                    <p className="font-mono text-[10px] text-[var(--text-muted)] leading-relaxed uppercase tracking-wider">
                      Dockerfile not detected. Ensure one exists at the root or
                      deployment will fail.
                    </p>
                  </div>
                )}

                <div className="space-y-8">
                  <Field
                    label="Target Branch"
                    sub="The branch pushed to AWS ECR"
                  >
                    <input
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="w-full bg-transparent border-b border-[var(--border)] py-3 text-sm font-mono outline-none focus:border-white transition-colors text-white"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-8">
                    <Field label="Port" sub="Container mapping">
                      <input
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        className="w-full bg-transparent border-b border-[var(--border)] py-3 text-sm font-mono outline-none focus:border-white transition-colors text-white"
                      />
                    </Field>
                    <Field label="Health" sub="ALB endpoint">
                      <input
                        value={healthCheck}
                        onChange={(e) => setHealthCheck(e.target.value)}
                        className="w-full bg-transparent border-b border-[var(--border)] py-3 text-sm font-mono outline-none focus:border-white transition-colors text-white"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <Field label="Compute" sub="vCPU Allocation">
                      <select
                        value={cpu}
                        onChange={(e) => setCpu(e.target.value)}
                        className="w-full bg-transparent border-b border-[var(--border)] py-3 text-sm font-mono outline-none focus:border-white transition-colors cursor-pointer appearance-none text-white"
                      >
                        {CPU_OPTIONS.map((o) => (
                          <option
                            key={o.value}
                            value={o.value}
                            className="bg-[#0a0a0a]"
                          >
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Memory" sub="RAM Allocation">
                      <select
                        value={memory}
                        onChange={(e) => setMemory(e.target.value)}
                        className="w-full bg-transparent border-b border-[var(--border)] py-3 text-sm font-mono outline-none focus:border-white transition-colors cursor-pointer appearance-none text-white"
                      >
                        {(MEMORY_OPTIONS[cpu] ?? []).map((o) => (
                          <option
                            key={o.value}
                            value={o.value}
                            className="bg-[#0a0a0a]"
                          >
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <Field label="Secrets" sub="AWS Secrets Manager Integration">
                    <div className="space-y-2 mt-4">
                      {envVars.map((e, i) => (
                        <div
                          key={i}
                          className="flex gap-px bg-[var(--border)] border border-[var(--border)]"
                        >
                          <input
                            type="text"
                            placeholder="KEY"
                            value={e.key}
                            onChange={(ev) =>
                              updateEnvVar(i, "key", ev.target.value)
                            }
                            className="flex-1 h-10 bg-[var(--bg)] px-4 font-mono text-[11px] text-white outline-none focus:bg-[var(--surface)]"
                          />
                          <input
                            type="text"
                            placeholder="VALUE"
                            value={e.value}
                            onChange={(ev) =>
                              updateEnvVar(i, "value", ev.target.value)
                            }
                            className="flex-1 h-10 bg-[var(--bg)] px-4 font-mono text-[11px] text-white outline-none focus:bg-[var(--surface)]"
                          />
                          <button
                            onClick={() => removeEnvVar(i)}
                            className="h-10 w-10 bg-[var(--bg)] hover:bg-white hover:text-black flex items-center justify-center transition-colors font-mono text-xs cursor-pointer"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={addEnvVar}
                        className="w-full h-11 border border-dashed border-[var(--border)] hover:border-white font-mono text-[10px] text-[#666] hover:text-white transition-all uppercase tracking-widest cursor-pointer"
                      >
                        + Add Environment Variable
                      </button>
                    </div>
                  </Field>
                </div>

                <div className="pt-8 border-t border-[var(--border)] space-y-4">
                  <button
                    onClick={handleDeploy}
                    disabled={deploying}
                    className="w-full bg-white text-black h-14 font-bold font-mono text-[12px] uppercase tracking-[0.2em] hover:invert transition-all disabled:opacity-20 cursor-pointer"
                  >
                    {deploying ? "Provisioning..." : "Launch Infrastructure →"}
                  </button>
                  <button
                    onClick={() => setStep(1)}
                    className="w-full text-center font-mono text-[10px] text-[#555] hover:text-white uppercase tracking-widest transition-colors cursor-pointer"
                  >
                    [ Back to Source ]
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="flex-grow bg-[#050505] relative flex flex-col items-center justify-center p-12 lg:p-24 overflow-hidden">
          <div className="absolute inset-0 bg-grid-pattern opacity-[0.03]" />

          <div className="w-full max-w-2xl border border-[var(--border)] bg-[var(--bg)] flex flex-col relative z-10 shadow-[0_0_100px_rgba(0,0,0,1)]">
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between bg-black/40">
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full transition-colors ${selectedRepo ? "bg-white animate-pulse" : "bg-[#222]"}`}
                />
                <span className="font-mono text-[10px] text-[#666] uppercase tracking-[0.2em]">
                  {selectedRepo ? "Manifest_Valid" : "Wait_For_Input"}
                </span>
              </div>
            </div>

            {!selectedRepo ? (
              <div className="flex flex-col items-center justify-center py-32 gap-6 opacity-20">
                <div className="w-12 h-12 border border-[#333] flex items-center justify-center">
                  <img
                    src="https://cdn.simpleicons.org/github/FFFFFF"
                    className="w-5 h-5"
                    alt=""
                  />
                </div>
                <p className="font-mono text-[10px] text-white uppercase tracking-[0.3em]">
                  Awaiting Source Selection
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border)]">
                <div className="p-10 space-y-10">
                  <div>
                    <p className="font-mono text-[10px] text-[#555] uppercase tracking-widest mb-3">
                      Service
                    </p>
                    <h2 className="text-4xl font-medium tracking-tighter text-white leading-none">
                      {selectedRepo.name}
                    </h2>
                    <p className="text-[12px] text-[#777] mt-4 leading-relaxed font-light">
                      {selectedRepo.description ||
                        "No project description provided."}
                    </p>
                  </div>

                  <div className="space-y-5">
                    <MetaRow
                      label="Stack"
                      value={selectedRepo.language || "Unknown"}
                    />
                    <MetaRow
                      label="Access"
                      value={selectedRepo.private ? "Private" : "Public"}
                    />
                    <MetaRow label="Modified" value={updatedAt ?? "—"} />
                  </div>
                </div>

                <div className="p-10 bg-[#080808] flex flex-col justify-between">
                  <div>
                    <p className="font-mono text-[10px] text-[#555] uppercase tracking-widest mb-5">
                      Build_Spec
                    </p>
                    <div className="font-mono text-[11px] leading-loose space-y-1 bg-black/50 border border-white/5 p-6">
                      <p className="text-blue-500/80">{"{"}</p>
                      <p className="pl-4 text-[#555]">
                        target:{" "}
                        <span className="text-[#eee]">
                          "{selectedRepo.name}"
                        </span>
                        ,
                      </p>
                      <p className="pl-4 text-[#555]">
                        branch: <span className="text-[#eee]">"{branch}"</span>,
                      </p>
                      <p className="pl-4 text-[#555]">
                        port: <span className="text-white">{port}</span>,
                      </p>
                      <p className="pl-4 text-[#555]">
                        fargate:{" "}
                        <span className="text-yellow-500/80">
                          "{selectedCpuLabel}"
                        </span>
                        ,
                      </p>
                      <p className="pl-4 text-[#555]">
                        ram:{" "}
                        <span className="text-yellow-500/80">
                          "{selectedMemoryLabel}"
                        </span>
                        ,
                      </p>
                      <p className="pl-4 text-[#555]">
                        handshake: <span className="text-white">"SSL/TLS"</span>
                      </p>
                      <p className="text-blue-500/80">{"}"}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="absolute -bottom-10 right-10 text-[160px] font-bold text-white/[0.05] select-none pointer-events-none tracking-tighter">
            HATCH
          </div>
        </section>
      </main>
    </div>
  );
}

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
    <div
      className={`w-5 h-5 flex items-center justify-center font-mono text-[9px] font-bold border transition-all ${
        done
          ? "bg-white border-white text-black"
          : active
            ? "bg-white border-white text-black"
            : "bg-transparent border-[#333] text-[#444]"
      }`}
    >
      {done ? "✓" : n}
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
    <div className="space-y-2">
      <p className="font-mono text-[10px] text-white uppercase tracking-widest font-bold leading-none">
        {label}
      </p>
      <p className="font-mono text-[9px] text-[#666] uppercase tracking-wider leading-none">
        {sub}
      </p>
      <div className="pt-1">{children}</div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 pb-3">
      <span className="font-mono text-[9px] text-[#555] uppercase tracking-widest font-bold">
        {label}
      </span>
      <span className="font-mono text-[11px] text-[#aaa] font-medium">
        {value}
      </span>
    </div>
  );
}
