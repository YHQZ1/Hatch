/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Tab = "general" | "build" | "compute" | "vars" | "danger";

interface EnvVar {
  key: string;
  value: string;
  visible: boolean;
}

export default function ProjectSettingsClient() {
  const { id } = useParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  // General
  const [projectName, setProjectName] = useState("");

  // Build
  const [branch, setBranch] = useState("main");
  const [dockerfilePath, setDockerfilePath] = useState("./Dockerfile");

  // Compute
  const [cpu, setCpu] = useState("256");
  const [memory, setMemory] = useState("512");
  const [port, setPort] = useState("80");
  const [healthCheck, setHealthCheck] = useState("/");

  // Env vars
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const [token, setToken] = useState<string | null>(null);

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
        setProjectName(data.repo_name ?? "");
        setBranch(data.branch ?? "main");
        setDockerfilePath(data.dockerfile_path ?? "./Dockerfile");
        setPort(String(data.port ?? 80));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    if (!token || saving) return;
    setSaving(true);
    // Currently the API only supports delete & read for projects.
    // Save is a no-op stub — extend when PATCH /api/projects/:id is available.
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDelete = async () => {
    if (!token || deleteConfirm !== project?.repo_name) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) router.push("/console");
    } catch (err) {
      console.error("Delete failed", err);
    } finally {
      setDeleting(false);
    }
  };

  const addEnvVar = () => {
    if (!newKey.trim()) return;
    setEnvVars((prev) => [
      ...prev,
      { key: newKey.trim(), value: newValue, visible: false },
    ]);
    setNewKey("");
    setNewValue("");
  };

  const removeEnvVar = (i: number) =>
    setEnvVars((prev) => prev.filter((_, idx) => idx !== i));

  const toggleVisible = (i: number) =>
    setEnvVars((prev) =>
      prev.map((v, idx) => (idx === i ? { ...v, visible: !v.visible } : v)),
    );

  if (!mounted) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "general", label: "General" },
    { key: "build", label: "Build" },
    { key: "compute", label: "Compute" },
    { key: "vars", label: "Variables" },
    { key: "danger", label: "Danger" },
  ];

  return (
    <div
      className="flex h-[calc(100vh-64px)] bg-black overflow-hidden"
      style={{ fontFamily: "'GeistMono', 'Menlo', 'Courier New', monospace" }}
    >
      {/* ── SIDEBAR ── */}
      <aside className="w-64 border-r border-[#141414] flex flex-col bg-black shrink-0">
        <div className="px-4 py-4 border-b border-[#141414]">
          <Link
            href={`/projects/${id}`}
            className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-[#2a2a2a] hover:text-[#555] transition-colors font-bold mb-4 group"
          >
            <span className="group-hover:-translate-x-0.5 transition-transform inline-block">
              ←
            </span>
            Deployment
          </Link>
          <h1 className="text-[13px] font-bold text-[#aaa] tracking-tight truncate">
            {loading ? (
              <span className="text-[#222]">loading…</span>
            ) : (
              project?.repo_name
            )}
          </h1>
          <p className="text-[10px] text-[#333] mt-0.5">Settings</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2">
          {tabs.map(({ key, label }) => {
            const isActive = activeTab === key;
            const isDanger = key === "danger";
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.15em] transition-colors relative border-l border-transparent ${
                  isActive
                    ? isDanger
                      ? "text-[#555] border-l-[#333] bg-[#0d0d0d]"
                      : "text-[#999] border-l-[#333] bg-[#0d0d0d]"
                    : isDanger
                      ? "text-[#2a2a2a] hover:text-[#444] hover:bg-[#080808]"
                      : "text-[#2a2a2a] hover:text-[#555] hover:bg-[#080808]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {/* Project meta */}
        {project && (
          <div className="px-4 py-4 border-t border-[#141414] space-y-2">
            <MetaRow label="ID" value={project.id.slice(0, 16)} />
            <MetaRow
              label="Created"
              value={new Date(project.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            />
            <MetaRow
              label="Auto-deploy"
              value={project.auto_deploy ? "on" : "off"}
            />
          </div>
        )}
      </aside>

      {/* ── MAIN PANEL ── */}
      <main className="flex-1 flex flex-col bg-[#050505] overflow-hidden">
        {/* Topbar */}
        <div className="px-6 py-2.5 border-b border-[#141414] flex items-center justify-between bg-black shrink-0">
          <span className="text-[9px] uppercase tracking-[0.2em] text-[#2a2a2a] font-bold">
            {tabs.find((t) => t.key === activeTab)?.label}
          </span>
          {activeTab !== "danger" && (
            <div className="flex items-center gap-5">
              <button
                onClick={() => {
                  if (project) {
                    setProjectName(project.repo_name);
                    setBranch(project.branch ?? "main");
                    setDockerfilePath(
                      project.dockerfile_path ?? "./Dockerfile",
                    );
                    setPort(String(project.port ?? 80));
                    setHealthCheck("/");
                  }
                }}
                className="text-[9px] font-bold text-[#2a2a2a] hover:text-[#555] uppercase tracking-[0.15em] transition-colors cursor-pointer"
              >
                discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-[9px] font-bold uppercase tracking-[0.15em] transition-colors cursor-pointer disabled:opacity-40 text-[#555] hover:text-[#999]"
              >
                {saving ? "saving…" : saved ? "✓ saved" : "save changes"}
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-10 py-10">
          <div className="max-w-xl">
            {/* ── GENERAL ── */}
            {activeTab === "general" && (
              <Section title="General">
                <Field label="Service Name">
                  <Input value={projectName} onChange={setProjectName} />
                </Field>
                <Field label="Repository URL">
                  <StaticValue value={project?.repo_url ?? "—"} />
                </Field>
                <div className="grid grid-cols-2 gap-6">
                  <Field label="Project ID">
                    <StaticValue value={project?.id?.slice(0, 16) ?? "—"} />
                  </Field>
                  <Field label="Created">
                    <StaticValue
                      value={
                        project
                          ? new Date(project.created_at).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )
                          : "—"
                      }
                    />
                  </Field>
                </div>
              </Section>
            )}

            {/* ── BUILD ── */}
            {activeTab === "build" && (
              <Section title="Build">
                <Field label="Branch">
                  <Input
                    value={branch}
                    onChange={setBranch}
                    placeholder="main"
                  />
                </Field>
                <Field label="Dockerfile Path">
                  <Input
                    value={dockerfilePath}
                    onChange={setDockerfilePath}
                    placeholder="./Dockerfile"
                  />
                </Field>
                <Field label="Exposed Port">
                  <Input
                    value={port}
                    onChange={setPort}
                    placeholder="80"
                    type="number"
                  />
                </Field>
                <Field label="Health Check Path">
                  <Input
                    value={healthCheck}
                    onChange={setHealthCheck}
                    placeholder="/"
                  />
                </Field>
              </Section>
            )}

            {/* ── COMPUTE ── */}
            {activeTab === "compute" && (
              <Section title="Compute">
                <Field label="vCPU">
                  <SelectInput
                    value={cpu}
                    onChange={setCpu}
                    options={[
                      { label: "0.25 vCPU (256)", value: "256" },
                      { label: "0.5 vCPU (512)", value: "512" },
                      { label: "1 vCPU (1024)", value: "1024" },
                    ]}
                  />
                </Field>
                <Field label="Memory">
                  <SelectInput
                    value={memory}
                    onChange={setMemory}
                    options={[
                      { label: "512 MB", value: "512" },
                      { label: "1 GB (1024)", value: "1024" },
                      { label: "2 GB (2048)", value: "2048" },
                    ]}
                  />
                </Field>
                {/* Summary */}
                <div className="mt-2 p-4 border border-[#141414] bg-black">
                  <p className="text-[9px] uppercase tracking-[0.15em] text-[#222] mb-3 font-bold">
                    Allocation Summary
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <MiniStat
                      label="vCPU"
                      value={Number(cpu) / 1024 + ""}
                      unit="units"
                    />
                    <MiniStat
                      label="Memory"
                      value={
                        Number(memory) >= 1024
                          ? String(Number(memory) / 1024)
                          : memory
                      }
                      unit={Number(memory) >= 1024 ? "GB" : "MB"}
                    />
                    <MiniStat label="Port" value={port} unit="tcp" />
                  </div>
                </div>
              </Section>
            )}

            {/* ── VARS ── */}
            {activeTab === "vars" && (
              <Section title="Environment Variables">
                {/* Existing rows */}
                {envVars.length > 0 && (
                  <div className="border border-[#141414] divide-y divide-[#0d0d0d] mb-6">
                    {envVars.map((v, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-4 py-3 group"
                      >
                        <span className="w-36 text-[10px] font-bold text-[#555] font-mono truncate">
                          {v.key}
                        </span>
                        <span className="flex-1 text-[10px] font-mono text-[#333] truncate">
                          {v.visible ? v.value : "••••••••••••"}
                        </span>
                        <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => toggleVisible(i)}
                            className="text-[9px] text-[#2a2a2a] hover:text-[#555] uppercase tracking-widest font-bold cursor-pointer"
                          >
                            {v.visible ? "hide" : "show"}
                          </button>
                          <button
                            onClick={() => removeEnvVar(i)}
                            className="text-[9px] text-[#2a2a2a] hover:text-[#555] uppercase tracking-widest font-bold cursor-pointer"
                          >
                            remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new */}
                <div className="border border-[#141414] p-4 space-y-3">
                  <p className="text-[9px] uppercase tracking-[0.15em] text-[#222] font-bold">
                    Add Variable
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[8px] uppercase tracking-[0.15em] text-[#222] mb-1.5 font-bold">
                        Key
                      </p>
                      <input
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        placeholder="VARIABLE_NAME"
                        className="w-full bg-black border border-[#1a1a1a] px-3 py-2 text-[11px] font-mono text-[#555] placeholder-[#222] outline-none focus:border-[#333] transition-colors"
                        onKeyDown={(e) => e.key === "Enter" && addEnvVar()}
                      />
                    </div>
                    <div>
                      <p className="text-[8px] uppercase tracking-[0.15em] text-[#222] mb-1.5 font-bold">
                        Value
                      </p>
                      <input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="value"
                        type="password"
                        className="w-full bg-black border border-[#1a1a1a] px-3 py-2 text-[11px] font-mono text-[#555] placeholder-[#222] outline-none focus:border-[#333] transition-colors"
                        onKeyDown={(e) => e.key === "Enter" && addEnvVar()}
                      />
                    </div>
                  </div>
                  <button
                    onClick={addEnvVar}
                    disabled={!newKey.trim()}
                    className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#333] hover:text-[#666] disabled:opacity-30 cursor-pointer transition-colors"
                  >
                    + add
                  </button>
                </div>

                {envVars.length === 0 && (
                  <p className="text-[9px] text-[#1e1e1e] font-mono mt-4">
                    No variables defined.
                  </p>
                )}
              </Section>
            )}

            {/* ── DANGER ── */}
            {activeTab === "danger" && (
              <Section title="Danger Zone">
                <div className="border border-[#1a1a1a] p-6 space-y-6">
                  <div>
                    <p className="text-[11px] text-[#444] mb-1 font-bold">
                      Delete this service
                    </p>
                    <p className="text-[10px] text-[#2a2a2a] leading-relaxed">
                      Permanently removes the service, all deployments, and
                      destroys the ECS infrastructure. This cannot be undone.
                    </p>
                  </div>

                  <div>
                    <p className="text-[9px] uppercase tracking-[0.15em] text-[#222] mb-2 font-bold">
                      Type{" "}
                      <span className="text-[#444]">{project?.repo_name}</span>{" "}
                      to confirm
                    </p>
                    <input
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder={project?.repo_name}
                      className="w-full bg-black border border-[#1a1a1a] px-3 py-2.5 text-[11px] font-mono text-[#555] placeholder-[#1e1e1e] outline-none focus:border-[#333] transition-colors"
                    />
                  </div>

                  <button
                    onClick={handleDelete}
                    disabled={deleteConfirm !== project?.repo_name || deleting}
                    className="w-full py-2.5 border border-[#1a1a1a] text-[9px] font-bold uppercase tracking-[0.15em] text-[#2a2a2a] hover:border-[#333] hover:text-[#555] disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-all"
                  >
                    {deleting ? "deleting…" : "delete service"}
                  </button>
                </div>
              </Section>
            )}
          </div>
        </div>
      </main>

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}

/* ── COMPONENTS ── */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#2a2a2a] pb-3 border-b border-[#141414]">
        {title}
      </p>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-[#222]">
        {label}
      </p>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-black border border-[#1a1a1a] px-3 py-2.5 text-[12px] font-mono text-[#666] placeholder-[#1e1e1e] outline-none focus:border-[#333] hover:border-[#222] transition-colors"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-black border border-[#1a1a1a] px-3 py-2.5 text-[12px] font-mono text-[#666] outline-none focus:border-[#333] hover:border-[#222] transition-colors appearance-none cursor-pointer"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-black text-[#666]">
          {o.label}
        </option>
      ))}
    </select>
  );
}

function StaticValue({ value }: { value: string }) {
  return (
    <p className="px-3 py-2.5 border border-[#0d0d0d] text-[12px] font-mono text-[#333] bg-[#030303] truncate">
      {value}
    </p>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[8px] uppercase tracking-[0.15em] text-[#1e1e1e] font-bold">
        {label}
      </span>
      <span className="text-[9px] font-mono text-[#2a2a2a]">{value}</span>
    </div>
  );
}

function MiniStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div>
      <p className="text-[8px] uppercase tracking-[0.12em] text-[#1e1e1e] mb-1 font-bold">
        {label}
      </p>
      <p className="text-[13px] font-bold text-[#444]">{value}</p>
      <p className="text-[8px] text-[#222] mt-0.5">{unit}</p>
    </div>
  );
}
