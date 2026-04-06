/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

interface Project {
  id: string;
  repo_name: string;
  repo_url: string;
  created_at: string;
  port: number;
  dockerfile_path: string;
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
  const activeIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [logs.length, scrollToBottom]);

  useEffect(() => {
    setMounted(true);
    const t = localStorage.getItem("hatch_token");
    if (!t) {
      router.push("/auth");
      return;
    }
    setToken(t);

    const loadData = async () => {
      try {
        const [projRes, depsRes] = await Promise.all([
          fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}`,
            {
              headers: { Authorization: `Bearer ${t}` },
            },
          ),
          fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/deployments`,
            {
              headers: { Authorization: `Bearer ${t}` },
            },
          ),
        ]);

        const proj = await projRes.json();
        const deps = await depsRes.json();

        setProject(proj);
        const depList = Array.isArray(deps) ? deps : [];
        setDeployments(depList);

        if (depList.length > 0 && !activeDeployment) {
          setActiveDeployment(depList[0]);
        }
      } catch (err) {
        console.error("failed to load project data", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [projectId]);

  useEffect(() => {
    if (!activeDeployment || !token) return;

    const currentId = activeDeployment.id;
    activeIdRef.current = currentId;

    setLogs([]);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const s = activeDeployment.status.toLowerCase();
    const isActive = ["building", "deploying", "queued"].includes(s);

    if (isActive) {
      const wsUrl = `${process.env.NEXT_PUBLIC_API_URL?.replace("http", "ws")}/ws/deployments/${currentId}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => ws.send("READY");
      ws.onmessage = (event) => {
        const line = event.data;
        if (line === "READY" || activeIdRef.current !== currentId) return;

        setLogs((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].text === line)
            return prev;
          return [...prev, parseLogLine(line)];
        });

        if (line.includes("✓ Build complete") || line.includes("Live at")) {
          updateDeploymentStatus(currentId, "live");
        }
      };
    } else {
      fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/deployments/${currentId}/logs`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      )
        .then((r) => r.json())
        .then((history) => {
          if (activeIdRef.current === currentId && Array.isArray(history)) {
            setLogs(history.map(parseLogLine));
          }
        });
    }

    return () => wsRef.current?.close();
  }, [activeDeployment?.id, token]);

  const parseLogLine = (line: string): LogLine => {
    const isSuccess = line.startsWith("✓") || line.includes("Live at");
    const isError =
      line.startsWith("✗") || line.toLowerCase().includes("error");
    const isInfo = line.startsWith("[");

    return {
      text: line,
      type: isSuccess
        ? "success"
        : isError
          ? "error"
          : isInfo
            ? "info"
            : "muted",
    };
  };

  const updateDeploymentStatus = (id: string, status: string) => {
    setDeployments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status } : d)),
    );
    if (activeIdRef.current === id) {
      setActiveDeployment((prev) => (prev ? { ...prev, status } : null));
    }
  };

  const handleDeploy = async () => {
    if (!project || !token || deploying) return;
    setDeploying(true);

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
          port: project.port,
          health_check_path: "/",
        }),
      },
    );

    if (res.ok) {
      const newDep = await res.json();
      setDeployments((prev) => [newDep, ...prev]);
      setActiveDeployment(newDep);
    }
    setDeploying(false);
  };

  const copyLogs = () => {
    navigator.clipboard.writeText(logs.map((l) => l.text).join("\n"));
  };

  if (!mounted) return null;

  return (
    <div className="relative z-10 flex flex-col lg:flex-row h-[calc(100vh-80px)] overflow-hidden bg-black text-white">
      {loading ? (
        <div className="flex-grow flex items-center justify-center font-mono text-[10px] uppercase tracking-widest animate-pulse">
          Loading...
        </div>
      ) : (
        <>
          <aside className="w-full lg:w-[380px] border-r border-zinc-900 flex flex-col shrink-0 bg-[#050505]">
            <div className="px-8 py-6 border-b border-zinc-900 space-y-4">
              <Link
                href="/dashboard"
                className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
              >
                ← Projects
              </Link>
              <div>
                <p className="font-mono text-[8px] text-zinc-600 uppercase tracking-widest">
                  {project?.repo_url.split("/")[3] ?? "—"}
                </p>
                <h1 className="text-xl font-medium tracking-tighter">
                  {project?.repo_name}
                </h1>
              </div>
              <StatusBadge status={deployments[0]?.status ?? "none"} />
            </div>

            <div className="px-8 py-5 border-b border-zinc-900">
              <button
                onClick={handleDeploy}
                disabled={deploying}
                className="w-full h-12 bg-white text-black font-mono text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all disabled:opacity-40"
              >
                {deploying ? "Deploying..." : "Deploy →"}
              </button>
            </div>

            <div className="flex-grow overflow-y-auto no-scrollbar">
              <div className="px-8 py-4 border-b border-zinc-900 font-mono text-[8px] text-zinc-600 uppercase tracking-widest">
                History
              </div>
              <div className="divide-y divide-zinc-900">
                {deployments.map((dep) => (
                  <button
                    key={dep.id}
                    onClick={() => setActiveDeployment(dep)}
                    className={`w-full px-8 py-4 text-left transition-colors hover:bg-zinc-900/50 ${activeDeployment?.id === dep.id ? "bg-zinc-900" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <StatusBadge status={dep.status} small />
                      <span className="font-mono text-[8px] text-zinc-600">
                        {new Date(dep.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="font-mono text-[9px] text-zinc-500 mt-1">
                      {dep.id.slice(0, 8)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <main className="flex-grow flex flex-col overflow-hidden bg-[#050505]">
            <div className="px-6 py-4 border-b border-zinc-900 flex items-center justify-between bg-black">
              <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest">
                {activeDeployment
                  ? `Log — ${activeDeployment.id.slice(0, 8)}`
                  : "Log — Awaiting"}
              </span>
              {logs.length > 0 && (
                <button
                  onClick={copyLogs}
                  className="font-mono text-[9px] text-zinc-500 hover:text-white uppercase tracking-widest border border-zinc-800 px-3 py-1 rounded-sm transition-colors"
                >
                  Copy Logs
                </button>
              )}
            </div>

            <div className="flex-grow overflow-y-auto p-6 font-mono text-sm scrollbar-hide">
              {logs.length === 0 ? (
                <div className="h-full flex items-center justify-center opacity-30 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  Select deployment to view logs
                </div>
              ) : (
                <div className="space-y-1.5">
                  {logs.map((log, i) => (
                    <LogEntry key={`${activeDeployment?.id}-${i}`} log={log} />
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>

            {activeDeployment?.url && activeDeployment.status === "live" && (
              <div className="px-6 py-4 border-t border-zinc-900 bg-black flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-emerald-400 font-mono text-[9px] uppercase tracking-widest">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />{" "}
                  Live
                </div>
                <a
                  href={`http://${activeDeployment.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-white hover:underline"
                >
                  {activeDeployment.url} ↗
                </a>
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const s = status.toLowerCase();
  const isLive = s === "live";
  const isPending = ["building", "deploying", "queued"].includes(s);
  const colorClass = isLive
    ? "border-emerald-900/30 text-emerald-400"
    : isPending
      ? "border-yellow-900/40 text-yellow-500"
      : "border-zinc-800 text-zinc-500";
  const dotClass = isLive
    ? "bg-emerald-400"
    : isPending
      ? "bg-yellow-500 animate-pulse"
      : "bg-zinc-700";

  return (
    <div
      className={`flex items-center gap-1.5 border px-2 py-1 font-mono uppercase tracking-widest ${small ? "text-[7px]" : "text-[8px]"} ${colorClass}`}
    >
      <span className={`w-1 h-1 rounded-full ${dotClass}`} />
      {status}
    </div>
  );
}

function LogEntry({ log }: { log: LogLine }) {
  const color =
    log.type === "success"
      ? "text-emerald-400"
      : log.type === "error"
        ? "text-red-400"
        : "text-zinc-400";
  return (
    <div
      className={`flex items-start gap-3 ${color} font-mono text-[12px] leading-relaxed`}
    >
      <span className="text-zinc-800 shrink-0 select-none">
        [{new Date().toISOString().split("T")[1].slice(0, 8)}]
      </span>
      <span>{log.text}</span>
    </div>
  );
}
