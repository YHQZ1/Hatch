/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Tab = "general" | "build" | "compute" | "vars" | "danger";

export default function ProjectSettingsClient() {
  const { id } = useParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [rootDirectory, setRootDirectory] = useState("./");
  const [cpu, setCpu] = useState("512");
  const [memory, setMemory] = useState("1024");

  useEffect(() => {
    setMounted(true);
    const t = localStorage.getItem("hatch_token");
    if (!t) {
      router.push("/auth");
      return;
    }

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${id}`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setProject(data);
        setProjectName(data.repo_name);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (!mounted) return null;

  return (
    <div className="flex h-[calc(100vh-64px)] bg-black text-zinc-400 overflow-hidden font-sans selection:bg-white selection:text-black">
      {/* SIDEBAR: NAV & CONTEXT (Matching ProjectDetail) */}
      <aside className="w-80 border-r border-white/5 flex flex-col bg-[#020202] shrink-0">
        <div className="p-6 border-b border-white/5 space-y-6">
          <Link
            href={`/projects/${id}`}
            className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 hover:text-white transition-colors flex items-center gap-2 group font-bold"
          >
            <span className="transition-transform group-hover:-translate-x-1">
              ←
            </span>{" "}
            Back to Deployment Console
          </Link>
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-white tracking-tighter truncate">
              {project?.repo_name ?? "Loading..."}
            </h1>
            <p className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
              Configuration_Mode
            </p>
          </div>
        </div>

        {/* Setting Categories */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="px-6 py-4 text-[9px] font-bold font-mono text-zinc-800 uppercase tracking-[0.3em]">
            Categories
          </div>
          <div className="divide-y divide-white/[0.02]">
            <NavTab
              active={activeTab === "general"}
              label="General Registry"
              onClick={() => setActiveTab("general")}
            />
            <NavTab
              active={activeTab === "build"}
              label="Build Pipeline"
              onClick={() => setActiveTab("build")}
            />
            <NavTab
              active={activeTab === "compute"}
              label="Resource Scaling"
              onClick={() => setActiveTab("compute")}
            />
            <NavTab
              active={activeTab === "vars"}
              label="Runtime Variables"
              onClick={() => setActiveTab("vars")}
            />
          </div>
        </div>

        {/* Footer-aligned Danger Zone */}
        <div className="p-4 border-t border-white/5 bg-[#050505]">
          <button
            onClick={() => setActiveTab("danger")}
            className={`w-full flex items-center gap-3 px-4 py-3 text-[10px] font-bold uppercase tracking-widest transition-all rounded-sm group cursor-pointer 
              ${activeTab === "danger" ? "bg-white text-black" : "text-zinc-600 hover:text-red-500 hover:bg-white/5"}`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Destroy Service
          </button>
        </div>
      </aside>

      {/* MAIN CONFIGURATION PANEL */}
      <main className="flex-1 flex flex-col bg-black relative">
        <div className="px-8 py-4 border-b border-white/5 flex items-center justify-between bg-[#050505] z-10 shrink-0">
          <div className="flex items-center gap-4"></div>
          <div className="flex gap-8">
            <button className="text-[10px] font-bold text-zinc-500 hover:text-white uppercase tracking-widest transition-colors cursor-pointer">
              Discard Changes
            </button>
            <button className="text-[10px] font-bold text-white hover:underline uppercase tracking-widest transition-colors cursor-pointer">
              Apply Changes
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-12 lg:p-20 bg-black scrollbar-hide">
          <div className="max-w-4xl space-y-24 animate-in fade-in duration-500">
            {activeTab === "general" && (
              <div className="space-y-16">
                <header className="space-y-3">
                  <span className="text-[9px] font-mono text-zinc-700 uppercase tracking-[0.5em]">
                    Service_Identity
                  </span>
                  <h2 className="text-4xl font-bold tracking-tight uppercase">
                    General Registry
                  </h2>
                </header>
                <div className="grid grid-cols-1 gap-12">
                  <ConfigField
                    label="Project Name"
                    value={projectName}
                    onChange={setProjectName}
                  />
                  <div className="grid grid-cols-2 gap-12">
                    <StaticField
                      label="Registry ID"
                      value={project?.id.slice(0, 20)}
                    />
                    <StaticField
                      label="Created At"
                      value={new Date(project?.created_at).toLocaleDateString()}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "build" && (
              <div className="space-y-16">
                <header className="space-y-3">
                  <span className="text-[9px] font-mono text-zinc-700 uppercase tracking-[0.5em]">
                    Build_Context
                  </span>
                  <h2 className="text-4xl font-bold tracking-tight uppercase">
                    Pipeline Logic
                  </h2>
                </header>
                <ConfigField
                  label="Root Directory"
                  value={rootDirectory}
                  onChange={setRootDirectory}
                  placeholder="./"
                />
              </div>
            )}

            {activeTab === "compute" && (
              <div className="space-y-16">
                <header className="space-y-3">
                  <span className="text-[9px] font-mono text-zinc-700 uppercase tracking-[0.5em]">
                    Hardware_Allocation
                  </span>
                  <h2 className="text-4xl font-bold tracking-tight uppercase">
                    Resource Scaling
                  </h2>
                </header>
                <div className="grid grid-cols-2 gap-12">
                  <SelectField
                    label="vCPU Units"
                    value={cpu}
                    onChange={setCpu}
                    options={[
                      { l: "0.25 vCPU", v: "256" },
                      { l: "0.5 vCPU", v: "512" },
                    ]}
                  />
                  <SelectField
                    label="Memory Limit"
                    value={memory}
                    onChange={setMemory}
                    options={[
                      { l: "512 MB", v: "512" },
                      { l: "1 GB", v: "1024" },
                    ]}
                  />
                </div>
              </div>
            )}

            {activeTab === "vars" && (
              <div className="space-y-16">
                <header className="space-y-3">
                  <span className="text-[9px] font-mono text-zinc-700 uppercase tracking-[0.5em]">
                    Secure_Secrets
                  </span>
                  <h2 className="text-4xl font-bold tracking-tight uppercase">
                    Runtime Variables
                  </h2>
                </header>
                <div className="border border-white/5 divide-y divide-white/5 bg-[#050505]">
                  {[1, 2].map((i) => (
                    <div key={i} className="flex justify-between p-6">
                      <span className="font-mono text-xs text-zinc-500 font-bold">
                        VARIABLE_{i}
                      </span>
                      <span className="font-mono text-xs text-zinc-800 tracking-widest">
                        ••••••••••••••••
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "danger" && (
              <div className="space-y-16">
                <header className="space-y-3">
                  <span className="text-[9px] font-mono text-zinc-700 uppercase tracking-[0.5em]">
                    Terminal_Action
                  </span>
                  <h2 className="text-4xl font-bold tracking-tight uppercase text-red-600">
                    Danger Zone
                  </h2>
                </header>
                <div className="p-10 border border-zinc-900 bg-white/[0.01] space-y-8">
                  <p className="text-sm font-bold text-zinc-400">
                    Permanently remove this service from the registry. This
                    action is final.
                  </p>
                  <button className="w-full bg-white text-black py-4 font-bold uppercase tracking-[0.2em] text-[10px] hover:invert transition-all">
                    Initialize Deletion Sequence
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #111;
        }
      `}</style>
    </div>
  );
}

/* UI COMPONENTS */

function NavTab({ active, label, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-6 py-5 text-left transition-all cursor-pointer border-l-2 text-[10px] font-bold uppercase tracking-widest
        ${active ? "bg-white/[0.03] border-white text-white" : "hover:bg-white/[0.01] border-transparent text-zinc-600"}`}
    >
      {label}
    </button>
  );
}

function ConfigField({ label, value, onChange, placeholder }: any) {
  return (
    <div className="space-y-4">
      <label className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest font-bold">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent border-b border-zinc-900 py-4 text-2xl font-bold text-zinc-300 outline-none focus:border-white transition-all"
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: any) {
  return (
    <div className="space-y-4">
      <label className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest font-bold">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent border-b border-zinc-900 py-4 text-2xl font-bold text-zinc-300 outline-none cursor-pointer appearance-none"
      >
        {options.map((o: any) => (
          <option key={o.v} value={o.v} className="bg-black text-sm">
            {o.l}
          </option>
        ))}
      </select>
    </div>
  );
}

function StaticField({ label, value }: any) {
  return (
    <div className="space-y-4">
      <label className="text-[10px] font-mono text-zinc-800 uppercase tracking-widest font-bold">
        {label}
      </label>
      <p className="text-xl font-mono text-zinc-600 font-bold">{value}</p>
    </div>
  );
}
