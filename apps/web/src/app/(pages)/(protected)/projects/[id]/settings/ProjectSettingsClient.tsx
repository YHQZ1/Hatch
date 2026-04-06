/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Project {
  id: string;
  repo_name: string;
  repo_url: string;
  created_at: string;
}

interface EnvVar {
  key: string;
  value: string;
}

export default function ProjectSettingsClient() {
  const { id } = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // env vars state
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [savingEnv, setSavingEnv] = useState(false);

  // delete state
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    setMounted(true);
    const t = localStorage.getItem("hatch_token");
    if (!t) {
      router.push("/auth");
      return;
    }
    setToken(t);

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${id}`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setProject(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, router]);

  const handleAddEnvVar = () => {
    if (!newKey.trim()) return;
    setEnvVars((prev) => [...prev, { key: newKey.trim(), value: newValue }]);
    setNewKey("");
    setNewValue("");
  };

  const handleRemoveEnvVar = (i: number) => {
    setEnvVars((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleDeleteProject = async () => {
    if (!token || confirmText !== project?.repo_name) return;
    setDeleting(true);

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (res.ok) {
      router.push("/dashboard");
    } else {
      setDeleting(false);
      setShowConfirm(false);
    }
  };

  if (!mounted) return <div className="min-h-screen bg-[var(--bg)]" />;

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] text-[var(--text-main)] flex flex-col selection:bg-white selection:text-black">
      <main className="flex-grow px-8 lg:px-12 py-12 max-w-[860px]">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-widest animate-pulse">
              Loading...
            </span>
          </div>
        ) : !project ? (
          <div className="flex flex-col items-center justify-center h-48 gap-4">
            <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
              Project not found
            </p>
            <Link
              href="/dashboard"
              className="font-mono text-xs text-white underline"
            >
              ← Back to dashboard
            </Link>
          </div>
        ) : (
          <div className="space-y-16">
            {/* ── HEADER ── */}
            <header className="space-y-2">
              <div className="flex items-center gap-2 font-mono text-[10px] text-[#333] uppercase tracking-[0.3em]">
                <Link
                  href="/dashboard"
                  className="hover:text-white transition-colors"
                >
                  Projects
                </Link>
                <span>/</span>
                <Link
                  href={`/projects/${id}`}
                  className="hover:text-white transition-colors"
                >
                  {project.repo_name}
                </Link>
                <span>/</span>
                <span className="text-white">Settings</span>
              </div>
              <h1 className="text-5xl font-bold text-white tracking-tighter uppercase">
                Settings
              </h1>
            </header>

            {/* ── PROJECT INFO ── */}
            <section className="space-y-6">
              <h2 className="font-mono text-[9px] uppercase tracking-[0.4em] text-[#333] border-b border-[var(--border)] pb-3">
                Project Info
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                <InfoField label="Repository" value={project.repo_name} />
                <InfoField
                  label="Project ID"
                  value={project.id.slice(0, 8) + "..."}
                />
                <InfoField
                  label="Source"
                  value={project.repo_url.replace("https://", "")}
                />
                <InfoField
                  label="Created"
                  value={new Date(project.created_at).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric", year: "numeric" },
                  )}
                />
              </div>
            </section>

            {/* ── AUTO DEPLOY ── */}
            <section className="space-y-6">
              <h2 className="font-mono text-[9px] uppercase tracking-[0.4em] text-[#333] border-b border-[var(--border)] pb-3">
                Automations
              </h2>
              <div className="flex items-center justify-between p-6 bg-[var(--surface)] border border-[var(--border)]">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">
                    GitHub Auto-Deploy
                  </p>
                  <p className="font-mono text-[11px] text-[var(--text-muted)]">
                    Automatically deploy on push to the default branch.
                    <span className="text-yellow-500/70 ml-2">Coming soon</span>
                  </p>
                </div>
                <div className="font-mono text-[9px] text-[#333] border border-[var(--border)] px-3 py-1.5 uppercase tracking-widest">
                  Not configured
                </div>
              </div>
            </section>

            {/* ── ENVIRONMENT VARIABLES ── */}
            <section className="space-y-6">
              <h2 className="font-mono text-[9px] uppercase tracking-[0.4em] text-[#333] border-b border-[var(--border)] pb-3">
                Environment Variables
              </h2>
              <p className="font-mono text-[10px] text-[#333] uppercase tracking-wider">
                Variables set here will apply to the next deployment of this
                project.
              </p>

              {/* existing env vars */}
              {envVars.length > 0 && (
                <div className="space-y-px bg-[var(--border)]">
                  {envVars.map((e, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_1fr_auto] gap-px bg-[var(--border)]"
                    >
                      <div className="h-10 bg-[var(--bg)] px-4 flex items-center font-mono text-xs text-white">
                        {e.key}
                      </div>
                      <div className="h-10 bg-[var(--bg)] px-4 flex items-center font-mono text-xs text-[var(--text-muted)]">
                        ••••••••
                      </div>
                      <button
                        onClick={() => handleRemoveEnvVar(i)}
                        className="h-10 w-10 bg-[var(--bg)] hover:bg-red-950 flex items-center justify-center text-[#444] hover:text-red-400 transition-colors font-mono text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* add new env var */}
              <div className="grid grid-cols-[1fr_1fr_auto] gap-px bg-[var(--border)] border border-[var(--border)]">
                <input
                  placeholder="KEY"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddEnvVar()}
                  className="h-11 bg-[var(--bg)] px-4 font-mono text-xs text-white placeholder-[#333] outline-none focus:bg-[var(--surface)]"
                />
                <input
                  placeholder="value"
                  type="text"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddEnvVar()}
                  className="h-11 bg-[var(--bg)] px-4 font-mono text-xs text-white placeholder-[#333] outline-none focus:bg-[var(--surface)]"
                />
                <button
                  onClick={handleAddEnvVar}
                  disabled={!newKey.trim()}
                  className="h-11 px-4 bg-white text-black font-mono text-[9px] uppercase tracking-widest hover:bg-[#e5e5e5] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>

              {envVars.length > 0 && (
                <button
                  onClick={() => {
                    setSavingEnv(true);
                    setTimeout(() => setSavingEnv(false), 1000);
                  }}
                  disabled={savingEnv}
                  className="font-mono text-[9px] text-white border border-[var(--border)] px-4 py-2 hover:bg-[var(--surface)] transition-colors uppercase tracking-widest disabled:opacity-40"
                >
                  {savingEnv ? "Saved ✓" : "Save Variables"}
                </button>
              )}

              <p className="font-mono text-[9px] text-[#333] italic">
                Variables will be injected into the ECS task at runtime on next
                deploy.
              </p>
            </section>

            {/* ── DANGER ZONE ── */}
            <section className="pt-4">
              <div className="border border-[var(--border)] bg-[var(--surface)] p-8 space-y-6">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white uppercase tracking-tight">
                    Destroy Project
                  </p>
                  <p className="font-mono text-[11px] text-[var(--text-muted)] leading-relaxed max-w-xl">
                    Permanently delete this project and all its deployments from
                    the database. Running ECS services must be cleaned up
                    manually from AWS.
                  </p>
                </div>

                {!showConfirm ? (
                  <button
                    onClick={() => setShowConfirm(true)}
                    className="px-6 py-2 border border-[var(--border)] text-[var(--text-muted)] font-mono text-[10px] uppercase tracking-widest hover:border-red-600 hover:text-red-500 transition-all"
                  >
                    Delete Project
                  </button>
                ) : (
                  <div className="space-y-4 border border-red-900/40 bg-red-900/5 p-6">
                    <p className="font-mono text-[10px] text-red-400 uppercase tracking-wider">
                      Type{" "}
                      <span className="text-white">{project.repo_name}</span> to
                      confirm deletion
                    </p>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder={project.repo_name}
                      className="w-full bg-transparent border border-red-900/40 px-4 h-10 font-mono text-xs text-white placeholder-[#333] outline-none focus:border-red-500"
                    />
                    <div className="flex items-center gap-4">
                      <button
                        onClick={handleDeleteProject}
                        disabled={confirmText !== project.repo_name || deleting}
                        className="px-6 py-2 bg-red-600 text-white font-mono text-[10px] uppercase tracking-widest hover:bg-red-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {deleting ? "Deleting..." : "Confirm Delete"}
                      </button>
                      <button
                        onClick={() => {
                          setShowConfirm(false);
                          setConfirmText("");
                        }}
                        className="font-mono text-[10px] text-[#444] hover:text-white transition-colors uppercase tracking-widest"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[9px] text-[#333] uppercase tracking-widest">
        {label}
      </p>
      <p className="text-sm font-medium text-white border-b border-[var(--border)] py-1.5 font-mono">
        {value}
      </p>
    </div>
  );
}
