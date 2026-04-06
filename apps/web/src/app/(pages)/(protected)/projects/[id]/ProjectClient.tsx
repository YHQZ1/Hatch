/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

interface Project {
  id: string;
  repo_name: string;
  repo_url: string;
  created_at: string;
}

interface Deployment {
  id: string;
  project_id: string;
  branch: string;
  status: string;
  cpu: number;
  memory_mb: number;
  port: number;
  health_check: string;
  image_uri: string | null;
  subdomain: string | null;
  url: string | null;
  created_at: string;
  deployed_at: string | null;
}

interface LogLine {
  text: string;
  type: "info" | "success" | "error" | "muted";
}

export default function ProjectDetail() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [token, setToken] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [activeDeployment, setActiveDeployment] = useState<Deployment | null>(
    null,
  );
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const scrollToBottom = useCallback(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [logs, scrollToBottom]);

  useEffect(() => {
    setMounted(true);
    const t = localStorage.getItem("hatch_token");
    if (!t) {
      router.push("/auth");
      return;
    }
    setToken(t);

    Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${t}` },
      }).then((r) => r.json()),
      fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/deployments`,
        { headers: { Authorization: `Bearer ${t}` } },
      ).then((r) => r.json()),
    ])
      .then(([proj, deps]) => {
        setProject(proj);
        const depList = Array.isArray(deps) ? deps : [];
        setDeployments(depList);
        if (depList.length > 0) setActiveDeployment(depList[0]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId, router]);

  const connectWebSocket = useCallback((deploymentId: string) => {
    if (wsRef.current) wsRef.current.close();
    const wsUrl = `ws://localhost:8080/ws/deployments/${deploymentId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const line = event.data as string;
      const type =
        line.startsWith("✓") || line.includes("Live at")
          ? "success"
          : line.startsWith("✗") || line.toLowerCase().includes("error")
            ? "error"
            : line.startsWith("[")
              ? "info"
              : "muted";
      setLogs((prev) => [...prev, { text: line, type }]);
    };

    ws.onerror = () => {
      setLogs((prev) => [
        ...prev,
        { text: "WebSocket connection failed", type: "error" },
      ]);
    };

    ws.onclose = () => setDeploying(false);
  }, []);

  const handleDeploy = async () => {
    if (!project || !token || deploying) return;
    setDeploying(true);
    setLogs([]);
    setActiveDeployment(null);

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/deployments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project_id: project.id,
          branch: "main",
          cpu: 512,
          memory_mb: 1024,
          port: 3000,
          health_check_path: "/",
        }),
      },
    );

    if (!res.ok) {
      setDeploying(false);
      return;
    }

    const deployment: Deployment = await res.json();
    setDeployments((prev) => [deployment, ...prev]);
    setActiveDeployment(deployment);
    setLogs([{ text: `Deployment ${deployment.id} queued`, type: "muted" }]);
    connectWebSocket(deployment.id);
  };

  useEffect(() => {
    return () => wsRef.current?.close();
  }, []);

  if (!mounted) return null;

  const latestDeployment = deployments[0] ?? null;
  const repoOwner = project?.repo_url.split("/")[3] ?? "—";

  return (
    <div className="relative z-10 flex flex-col lg:flex-row h-[calc(100vh-80px)] overflow-hidden">
      {loading ? (
        <div className="flex-grow flex items-center justify-center">
          <div className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-[0.3em] animate-pulse">
            Loading...
          </div>
        </div>
      ) : !project ? (
        <div className="flex-grow flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-widest text-white">
              Project not found
            </p>
            <Link
              href="/dashboard"
              className="font-mono text-xs text-white underline"
            >
              ← Back to dashboard
            </Link>
          </div>
        </div>
      ) : (
        <>
          <section className="w-full lg:w-[380px] border-r border-[var(--border)] flex flex-col overflow-hidden shrink-0 bg-[var(--bg)]">
            <div className="px-8 py-6 border-b border-[var(--border)] space-y-4">
              <div className="flex items-center gap-2">
                <Link
                  href="/dashboard"
                  className="font-mono text-[9px] text-[var(--text-muted)] hover:text-white transition-colors uppercase tracking-widest"
                >
                  ← Projects
                </Link>
                <Link
                  href={`/projects/${projectId}/settings`}
                  className="font-mono text-[9px] text-[#333] hover:text-white transition-colors uppercase tracking-widest"
                >
                  Settings →
                </Link>
              </div>
              <div className="flex items-center gap-3">
                <img
                  src="https://cdn.simpleicons.org/github/FFFFFF"
                  alt=""
                  className="w-4 h-4 opacity-40"
                />
                <div>
                  <p className="font-mono text-[8px] text-[var(--text-muted)] uppercase tracking-widest">
                    {repoOwner}
                  </p>
                  <h1 className="text-xl font-medium tracking-tighter text-white">
                    {project.repo_name}
                  </h1>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <StatusBadge
                  status={latestDeployment?.status ?? "no deployments"}
                />
                {latestDeployment?.url && (
                  <a
                    href={`https://${latestDeployment.url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[9px] text-[var(--text-muted)] hover:text-white transition-colors uppercase tracking-widest flex items-center gap-1"
                  >
                    {latestDeployment.subdomain}.hatchcloud.xyz ↗
                  </a>
                )}
              </div>
            </div>

            <div className="px-8 py-5 border-b border-[var(--border)]">
              <button
                onClick={handleDeploy}
                disabled={deploying}
                className="w-full h-12 bg-white text-black font-mono text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-[#e5e5e5] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {deploying ? (
                  <>
                    <span className="w-2 h-2 bg-black animate-pulse" />{" "}
                    Deploying...
                  </>
                ) : (
                  "Deploy →"
                )}
              </button>
            </div>

            <div className="px-8 py-6 border-b border-[var(--border)] space-y-4">
              <p className="font-mono text-[8px] text-[#333] uppercase tracking-[0.3em]">
                Configuration
              </p>
              {latestDeployment ? (
                <div className="space-y-3">
                  <MetaRow label="Branch" value={latestDeployment.branch} />
                  <MetaRow
                    label="CPU"
                    value={`${latestDeployment.cpu} units`}
                  />
                  <MetaRow
                    label="Memory"
                    value={`${latestDeployment.memory_mb} MB`}
                  />
                  <MetaRow label="Port" value={String(latestDeployment.port)} />
                  <MetaRow
                    label="Health Check"
                    value={latestDeployment.health_check}
                  />
                </div>
              ) : (
                <p className="font-mono text-[9px] text-[#333] uppercase tracking-widest">
                  No deployments yet
                </p>
              )}
            </div>

            <div className="flex-grow overflow-y-auto no-scrollbar">
              <div className="px-8 py-4 border-b border-[var(--border)]">
                <p className="font-mono text-[8px] text-[#333] uppercase tracking-[0.3em]">
                  Deployment History ({deployments.length})
                </p>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {deployments.map((dep) => (
                  <button
                    key={dep.id}
                    onClick={() => setActiveDeployment(dep)}
                    className={`w-full px-8 py-4 text-left transition-colors hover:bg-[var(--surface)] ${activeDeployment?.id === dep.id ? "bg-[var(--surface)]" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <StatusBadge status={dep.status} small />
                      <span className="font-mono text-[8px] text-[#333]">
                        {new Date(dep.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="font-mono text-[9px] text-[var(--text-muted)] mt-1">
                      {dep.id.slice(0, 8)}...
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="flex-grow bg-[#050505] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between shrink-0 bg-[var(--bg)]">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 bg-[#1a1a1a]" />
                  <div className="w-2.5 h-2.5 bg-[#1a1a1a]" />
                  <div className="w-2.5 h-2.5 bg-[#1a1a1a]" />
                </div>
                <span className="font-mono text-[9px] text-[var(--text-muted)] uppercase tracking-widest">
                  {activeDeployment
                    ? `Log — ${activeDeployment.id.slice(0, 8)}`
                    : "Log — Awaiting"}
                </span>
              </div>
            </div>
            <div className="flex-grow overflow-y-auto p-6 font-mono text-sm scrollbar-hide">
              {logs.length === 0 && !deploying ? (
                <EmptyTerminal hasDeployments={deployments.length > 0} />
              ) : (
                <div className="space-y-1.5">
                  {logs.map((log, i) => (
                    <LogEntry key={i} log={log} />
                  ))}
                  {deploying && (
                    <div className="flex items-center gap-3 text-[var(--text-muted)]">
                      <span className="text-[#333]">
                        [{new Date().toISOString().split("T")[1].slice(0, 8)}]
                      </span>
                      <span className="w-2 h-4 bg-[var(--text-muted)] animate-blink inline-block" />
                    </div>
                  )}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
            {activeDeployment?.url && (
              <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--bg)] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[var(--success)] rounded-full" />
                  <span className="font-mono text-[9px] text-[var(--success)] uppercase tracking-widest">
                    Live
                  </span>
                </div>
                <a
                  href={`https://${activeDeployment.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-white hover:underline flex items-center gap-2"
                >
                  http://{activeDeployment.subdomain}.hatchcloud.xyz
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                  </svg>
                </a>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const isLive = status === "live";
  const isBuilding =
    status === "building" || status === "deploying" || status === "queued";
  const isFailed = status === "failed";
  return (
    <div
      className={`flex items-center gap-1.5 border px-2 py-1 font-mono uppercase tracking-widest ${small ? "text-[7px]" : "text-[8px]"} ${isLive ? "border-[#10b981]/30 text-[#10b981]" : isBuilding ? "border-yellow-900/40 text-yellow-500" : isFailed ? "border-red-900/40 text-red-500" : "border-[var(--border)] text-[var(--text-muted)]"}`}
    >
      <span
        className={`w-1 h-1 rounded-full ${isLive ? "bg-[#10b981]" : isBuilding ? "bg-yellow-500 animate-pulse" : isFailed ? "bg-red-500" : "bg-[#333]"}`}
      />
      {status}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#111] pb-2">
      <span className="font-mono text-[8px] text-[#333] uppercase tracking-widest">
        {label}
      </span>
      <span className="font-mono text-[10px] text-[var(--text-muted)]">
        {value}
      </span>
    </div>
  );
}

function LogEntry({ log }: { log: LogLine }) {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 8);
  const color =
    log.type === "success"
      ? "text-[#10b981]"
      : log.type === "error"
        ? "text-red-400"
        : log.type === "muted"
          ? "text-[#555]"
          : "text-[var(--text-muted)]";
  return (
    <div className={`flex items-start gap-3 ${color}`}>
      <span className="text-[#333] shrink-0 select-none text-xs">
        [{timestamp}]
      </span>
      <span className="text-xs leading-relaxed">
        {log.type === "success" && (
          <span className="text-[#10b981] mr-1">✓</span>
        )}
        {log.type === "error" && <span className="text-red-400 mr-1">✗</span>}
        {log.text}
      </span>
    </div>
  );
}

function EmptyTerminal({ hasDeployments }: { hasDeployments: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 opacity-30">
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
        {hasDeployments
          ? "Select a deployment to view logs"
          : "Click Deploy to start"}
      </div>
      <div className="font-mono text-[9px] text-[#333] flex items-center gap-2">
        <span className="w-2 h-4 bg-[#333] animate-blink inline-block" />
      </div>
    </div>
  );
}
