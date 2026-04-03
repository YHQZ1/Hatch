/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// --- TYPES ---
interface Repo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string;
  language: string;
  updated_at: string;
}

interface EnvVar {
  key: string;
  value: string;
}

// --- MAIN PAGE ---
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

  // config state
  const [branch, setBranch] = useState("main");
  const [cpu, setCpu] = useState("512");
  const [memory, setMemory] = useState("1024");
  const [port, setPort] = useState("3000");
  const [healthCheck, setHealthCheck] = useState("/");
  const [envVars, setEnvVars] = useState<EnvVar[]>([{ key: "", value: "" }]);

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
  }, [router]);

  const filteredRepos = repos.filter((r) =>
    r.full_name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelectRepo = (repo: Repo) => {
    setSelectedRepo(repo);
    setStep(2);
  };

  const handleDeploy = async () => {
    if (!selectedRepo || !token) return;
    setDeploying(true);

    // first create the project
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

    if (!projectRes.ok) {
      setDeploying(false);
      return;
    }

    const project = await projectRes.json();
    router.push(`/projects/${project.id}`);
  };

  const addEnvVar = () =>
    setEnvVars((prev) => [...prev, { key: "", value: "" }]);
  const removeEnvVar = (i: number) =>
    setEnvVars((prev) => prev.filter((_, idx) => idx !== i));
  const updateEnvVar = (i: number, field: "key" | "value", val: string) => {
    setEnvVars((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, [field]: val } : e)),
    );
  };

  if (!mounted) return <div className="min-h-screen bg-black" />;

  return (
    <div className="min-h-screen w-full bg-[#000] text-white flex flex-col relative overflow-x-hidden selection:bg-white selection:text-black">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.04]" />
      </div>

      {/* Header */}
      <header className="relative z-20 border-b border-[#1f1f1f] bg-black/80 backdrop-blur-md px-8 lg:px-12 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-6 h-6 bg-white flex items-center justify-center transition-transform duration-300 group-hover:scale-90">
              <div className="w-2.5 h-2.5 bg-black" />
            </div>
            <span className="font-bold tracking-tighter text-lg uppercase">
              Hatch
            </span>
          </Link>
          <span className="font-mono text-[10px] text-[#333] uppercase tracking-widest hidden md:block">
            / new project
          </span>
        </div>
        <Link
          href="/dashboard"
          className="font-mono text-[10px] text-[#444] hover:text-white transition-colors uppercase tracking-[0.2em]"
        >
          [ Cancel ]
        </Link>
      </header>

      {/* Step indicator */}
      <div className="relative z-10 border-b border-[#1f1f1f] px-8 lg:px-12 h-10 flex items-center gap-6">
        <StepIndicator
          number={1}
          label="Select Repository"
          active={step === 1}
          done={step === 2}
        />
        <div className="w-8 h-px bg-[#1f1f1f]" />
        <StepIndicator
          number={2}
          label="Configure & Deploy"
          active={step === 2}
          done={false}
        />
      </div>

      {/* Content */}
      <main className="relative z-10 flex-grow px-8 lg:px-12 py-12 max-w-4xl">
        {step === 1 && (
          <StepOne
            repos={filteredRepos}
            loading={reposLoading}
            search={search}
            onSearch={setSearch}
            onSelect={handleSelectRepo}
          />
        )}
        {step === 2 && selectedRepo && (
          <StepTwo
            repo={selectedRepo}
            branch={branch}
            setBranch={setBranch}
            cpu={cpu}
            setCpu={setCpu}
            memory={memory}
            setMemory={setMemory}
            port={port}
            setPort={setPort}
            healthCheck={healthCheck}
            setHealthCheck={setHealthCheck}
            envVars={envVars}
            onAddEnvVar={addEnvVar}
            onRemoveEnvVar={removeEnvVar}
            onUpdateEnvVar={updateEnvVar}
            onBack={() => setStep(1)}
            onDeploy={handleDeploy}
            deploying={deploying}
          />
        )}
      </main>

      {/* Footer bar */}
      <footer className="relative z-10 border-t border-[#1f1f1f] px-8 lg:px-12 h-10 flex items-center justify-between">
        <span className="font-mono text-[9px] text-[#333] uppercase tracking-widest">
          Hatch · Deployment Engine
        </span>
        <span className="font-mono text-[9px] text-[#333] uppercase tracking-widest">
          AWS ECS · ECR · ROUTE53 · ACM
        </span>
      </footer>
    </div>
  );
}

// --- STEP INDICATOR ---
function StepIndicator({
  number,
  label,
  active,
  done,
}: {
  number: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-5 h-5 flex items-center justify-center font-mono text-[9px] font-bold border transition-colors ${
          done
            ? "bg-[#10b981] border-[#10b981] text-black"
            : active
              ? "bg-white border-white text-black"
              : "bg-transparent border-[#333] text-[#333]"
        }`}
      >
        {done ? "✓" : number}
      </div>
      <span
        className={`font-mono text-[9px] uppercase tracking-widest transition-colors ${
          active ? "text-white" : done ? "text-[#10b981]" : "text-[#333]"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

// --- STEP ONE: SELECT REPO ---
function StepOne({
  repos,
  loading,
  search,
  onSearch,
  onSelect,
}: {
  repos: Repo[];
  loading: boolean;
  search: string;
  onSearch: (s: string) => void;
  onSelect: (r: Repo) => void;
}) {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="font-mono text-[10px] text-[#333] uppercase tracking-[0.3em]">
          Step 01
        </p>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tighter leading-none">
          Select Repository
        </h1>
        <p className="text-[#555] text-sm font-light pt-1">
          Choose the GitHub repository you want to deploy.
        </p>
      </div>

      {/* Search */}
      <div className="relative border border-[#1f1f1f] bg-[#050505] focus-within:border-[#444] transition-colors">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-[#333] text-xs">
          /
        </span>
        <input
          type="text"
          placeholder="Search repositories..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full h-12 bg-transparent pl-8 pr-4 text-sm text-white placeholder-[#333] outline-none font-mono"
        />
      </div>

      {/* Repo list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-16 border border-[#1f1f1f] bg-[#050505] animate-pulse"
              style={{ opacity: 1 - i * 0.15 }}
            />
          ))}
        </div>
      ) : repos.length === 0 ? (
        <div className="border border-[#1f1f1f] border-dashed py-16 flex items-center justify-center">
          <p className="font-mono text-[10px] text-[#333] uppercase tracking-widest">
            No repositories found
          </p>
        </div>
      ) : (
        <div className="space-y-px bg-[#1f1f1f]">
          {repos.map((repo) => (
            <RepoRow key={repo.id} repo={repo} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- REPO ROW ---
function RepoRow({
  repo,
  onSelect,
}: {
  repo: Repo;
  onSelect: (r: Repo) => void;
}) {
  const updatedAt = new Date(repo.updated_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <button
      onClick={() => onSelect(repo)}
      className="w-full bg-black hover:bg-[#0a0a0a] border-b border-[#1f1f1f] last:border-0 px-5 py-4 flex items-center justify-between group transition-colors text-left"
    >
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://cdn.simpleicons.org/github/FFFFFF"
          alt=""
          className="w-3.5 h-3.5 opacity-30 group-hover:opacity-60 transition-opacity"
        />
        <div>
          <p className="text-sm font-medium text-white leading-tight">
            {repo.full_name}
          </p>
          {repo.description && (
            <p className="font-mono text-[9px] text-[#444] mt-0.5 truncate max-w-xs">
              {repo.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-6 shrink-0">
        {repo.language && (
          <span className="font-mono text-[9px] text-[#444] uppercase tracking-widest hidden md:block">
            {repo.language}
          </span>
        )}
        {repo.private && (
          <span className="font-mono text-[8px] text-[#444] border border-[#1f1f1f] px-1.5 py-0.5 uppercase tracking-widest">
            Private
          </span>
        )}
        <span className="font-mono text-[9px] text-[#333] hidden md:block">
          {updatedAt}
        </span>
        <span className="font-mono text-[9px] text-[#333] group-hover:text-white transition-colors">
          →
        </span>
      </div>
    </button>
  );
}

// --- STEP TWO: CONFIGURE ---
function StepTwo({
  repo,
  branch,
  setBranch,
  cpu,
  setCpu,
  memory,
  setMemory,
  port,
  setPort,
  healthCheck,
  setHealthCheck,
  envVars,
  onAddEnvVar,
  onRemoveEnvVar,
  onUpdateEnvVar,
  onBack,
  onDeploy,
  deploying,
}: {
  repo: Repo;
  branch: string;
  setBranch: (v: string) => void;
  cpu: string;
  setCpu: (v: string) => void;
  memory: string;
  setMemory: (v: string) => void;
  port: string;
  setPort: (v: string) => void;
  healthCheck: string;
  setHealthCheck: (v: string) => void;
  envVars: EnvVar[];
  onAddEnvVar: () => void;
  onRemoveEnvVar: (i: number) => void;
  onUpdateEnvVar: (i: number, field: "key" | "value", val: string) => void;
  onBack: () => void;
  onDeploy: () => void;
  deploying: boolean;
}) {
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <p className="font-mono text-[10px] text-[#333] uppercase tracking-[0.3em]">
          Step 02
        </p>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tighter leading-none">
          Configure
        </h1>
        <p className="text-[#555] text-sm font-light pt-1">
          Set deployment parameters for{" "}
          <span className="text-white font-mono">{repo.full_name}</span>
        </p>
      </div>

      {/* Selected repo pill */}
      <div className="flex items-center gap-3 border border-[#1f1f1f] bg-[#050505] px-4 py-3 w-fit">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://cdn.simpleicons.org/github/FFFFFF"
          alt=""
          className="w-3.5 h-3.5 opacity-50"
        />
        <span className="font-mono text-xs text-white">{repo.full_name}</span>
        <button
          onClick={onBack}
          className="font-mono text-[9px] text-[#444] hover:text-white transition-colors ml-2 uppercase tracking-widest"
        >
          [ change ]
        </button>
      </div>

      {/* Config sections */}
      <div className="space-y-8">
        {/* Branch */}
        <ConfigSection label="Branch">
          <ConfigInput
            label="Branch name"
            value={branch}
            onChange={setBranch}
            placeholder="main"
          />
        </ConfigSection>

        {/* Resources */}
        <ConfigSection label="Resources">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[#1f1f1f]">
            <ConfigSelect
              label="CPU"
              value={cpu}
              onChange={setCpu}
              options={[
                { label: "0.25 vCPU", value: "256" },
                { label: "0.5 vCPU", value: "512" },
                { label: "1 vCPU", value: "1024" },
                { label: "2 vCPU", value: "2048" },
              ]}
            />
            <ConfigSelect
              label="Memory"
              value={memory}
              onChange={setMemory}
              options={[
                { label: "512 MB", value: "512" },
                { label: "1 GB", value: "1024" },
                { label: "2 GB", value: "2048" },
                { label: "4 GB", value: "4096" },
              ]}
            />
          </div>
        </ConfigSection>

        {/* Networking */}
        <ConfigSection label="Networking">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[#1f1f1f]">
            <ConfigInput
              label="Exposed port"
              value={port}
              onChange={setPort}
              placeholder="3000"
            />
            <ConfigInput
              label="Health check path"
              value={healthCheck}
              onChange={setHealthCheck}
              placeholder="/"
            />
          </div>
        </ConfigSection>

        {/* Environment variables */}
        <ConfigSection label="Environment Variables">
          <div className="space-y-px bg-[#1f1f1f]">
            {envVars.map((env, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr_auto] gap-px bg-[#1f1f1f]"
              >
                <input
                  type="text"
                  placeholder="KEY"
                  value={env.key}
                  onChange={(e) => onUpdateEnvVar(i, "key", e.target.value)}
                  className="h-11 bg-black px-4 font-mono text-xs text-white placeholder-[#333] outline-none focus:bg-[#0a0a0a] transition-colors"
                />
                <input
                  type="text"
                  placeholder="value"
                  value={env.value}
                  onChange={(e) => onUpdateEnvVar(i, "value", e.target.value)}
                  className="h-11 bg-black px-4 font-mono text-xs text-white placeholder-[#333] outline-none focus:bg-[#0a0a0a] transition-colors"
                />
                <button
                  onClick={() => onRemoveEnvVar(i)}
                  className="h-11 w-11 bg-black hover:bg-[#1a0000] flex items-center justify-center font-mono text-[#444] hover:text-red-500 transition-colors text-xs"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={onAddEnvVar}
            className="mt-2 font-mono text-[9px] text-[#444] hover:text-white transition-colors uppercase tracking-widest"
          >
            + Add Variable
          </button>
        </ConfigSection>
      </div>

      {/* Deploy button */}
      <div className="flex items-center gap-4 pt-4 border-t border-[#1f1f1f]">
        <button
          onClick={onBack}
          className="font-mono text-[10px] text-[#444] hover:text-white transition-colors uppercase tracking-[0.2em]"
        >
          ← Back
        </button>
        <button
          onClick={onDeploy}
          disabled={deploying}
          className="flex items-center gap-3 bg-white text-black px-8 py-4 font-mono text-xs font-bold uppercase tracking-widest hover:bg-[#e5e5e5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {deploying ? (
            <>
              <span className="w-2 h-2 bg-black animate-pulse" />
              Initializing...
            </>
          ) : (
            "Deploy →"
          )}
        </button>
      </div>
    </div>
  );
}

// --- CONFIG HELPERS ---
function ConfigSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <p className="font-mono text-[9px] text-[#444] uppercase tracking-[0.3em]">
        {label}
      </p>
      {children}
    </div>
  );
}

function ConfigInput({
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
    <div className="bg-black">
      <div className="px-4 pt-3 pb-0">
        <p className="font-mono text-[8px] text-[#333] uppercase tracking-widest">
          {label}
        </p>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 bg-transparent px-4 text-sm text-white placeholder-[#333] outline-none font-mono"
      />
    </div>
  );
}

function ConfigSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <div className="bg-black">
      <div className="px-4 pt-3 pb-0">
        <p className="font-mono text-[8px] text-[#333] uppercase tracking-widest">
          {label}
        </p>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 bg-transparent px-4 text-sm text-white outline-none font-mono cursor-pointer appearance-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-black">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
