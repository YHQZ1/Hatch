/* eslint-disable @typescript-eslint/no-unused-vars */
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
  type: "info" | "success" | "error" | "muted" | "system";
  timestamp: string;
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
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [logs.length]);

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

        setLogs((prev) => [...prev, parseLogLine(line)]);

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
    const isSuccess =
      line.includes("✓") ||
      line.includes("successfully") ||
      line.includes("Live at");
    const isError =
      line.includes("✗") ||
      line.toLowerCase().includes("error") ||
      line.toLowerCase().includes("failed");
    const isSystem = line.startsWith("[") || line.includes("STEP");

    return {
      text: line,
      type: isSuccess
        ? "success"
        : isError
          ? "error"
          : isSystem
            ? "system"
            : "muted",
      timestamp: new Date().toLocaleTimeString([], {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
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

  if (!mounted) return null;

  return (
    <div className="flex h-[calc(100vh-64px)] bg-black text-zinc-400 overflow-hidden font-sans selection:bg-white selection:text-black">
      {/* SIDEBAR */}
      <aside className="w-80 border-r border-white/5 flex flex-col bg-[#020202] shrink-0">
        {/* Top Header */}
        <div className="p-6 border-b border-white/5 space-y-6">
          <Link
            href="/console"
            className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 hover:text-white transition-colors flex items-center gap-2 group"
          >
            <span className="transition-transform group-hover:-translate-x-1 font-bold">
              ←
            </span>{" "}
            GO back to registry
          </Link>
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-white tracking-tighter truncate">
              {project?.repo_name}
            </h1>
            <p className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest truncate">
              {project?.repo_url.split("github.com/")[1] ?? "Repository"}
            </p>
          </div>

          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="w-full bg-white text-black text-[10px] font-bold uppercase tracking-widest py-3 hover:bg-zinc-200 transition-all disabled:opacity-20 cursor-pointer"
          >
            {deploying ? "Deploying" : "Redeploy"}
          </button>
        </div>

        {/* History Scroll Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="px-6 py-4 text-[9px] font-bold font-mono text-zinc-800 uppercase tracking-[0.3em]">
            Event History
          </div>
          <div className="divide-y divide-white/[0.02]">
            {deployments.map((dep) => (
              <Link
                key={dep.id}
                // This is the magic part: it pushes the new URL to the browser
                href={`/projects/${projectId}/deployments/${dep.id}`}
                className={`block w-full px-6 py-5 text-left transition-all cursor-pointer ${
                  activeDeployment?.id === dep.id
                    ? "bg-white/[0.03] border-l-2 border-white"
                    : "hover:bg-white/[0.01] border-l-2 border-transparent"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-[9px] font-bold uppercase tracking-widest ${getStatusColor(dep.status)}`}
                  >
                    {dep.status}
                  </span>
                  <span className="font-mono text-[9px] text-zinc-700 font-bold">
                    {new Date(dep.created_at).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <p className="font-mono text-[10px] text-zinc-500 truncate">
                    SHA: {dep.id.slice(0, 8)}
                  </p>
                  <span className="text-[8px] font-bold text-zinc-800 uppercase tracking-tighter">
                    View Logs →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Bottom Settings Anchor */}
        <div className="p-4 border-t border-white/5 bg-[#050505]">
          <Link
            href={`/projects/${projectId}/settings`}
            className="flex items-center gap-3 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white hover:bg-white/5 transition-all rounded-sm group cursor-pointer"
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
              className="text-zinc-600 group-hover:text-white transition-colors"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Service Settings
          </Link>
        </div>
      </aside>

      {/* TERMINAL */}
      <main className="flex-1 flex flex-col bg-black relative">
        <div className="px-8 py-4 border-b border-white/5 flex items-center justify-between bg-[#050505] z-10 shrink-0">
          <div className="flex items-center gap-4">
            <div
              className={`w-1.5 h-1.5 rounded-full ${activeDeployment?.status === "live" ? "bg-zinc-400" : "bg-zinc-800 animate-pulse"}`}
            />
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600 font-bold">
              Deployment: {activeDeployment?.id.slice(0, 8) ?? "INITIALIZING"}
            </span>
          </div>
          <div className="flex gap-8">
            <button
              onClick={() => setLogs([])}
              className="text-[10px] font-bold text-zinc-500 hover:text-white uppercase tracking-widest transition-colors cursor-pointer"
            >
              Clear Logs
            </button>
            <button
              onClick={() =>
                navigator.clipboard.writeText(
                  logs.map((l) => l.text).join("\n"),
                )
              }
              className="text-[10px] font-bold text-zinc-500 hover:text-white uppercase tracking-widest transition-colors cursor-pointer"
            >
              Copy Output
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-10 font-mono scroll-smooth bg-black scrollbar-hide">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-10">
              <p className="text-[10px] font-bold uppercase tracking-[0.5em]">
                No Output Detected
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-6 group">
                  <span className="w-16 shrink-0 text-zinc-800 text-[10px] pt-1 select-none font-bold">
                    {log.timestamp}
                  </span>
                  <p
                    className={`text-[13px] leading-relaxed break-all ${getLogTypeColor(log.type)}`}
                  >
                    {renderLogText(log.text)}
                  </p>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
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

/* HELPERS */

function renderLogText(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white font-bold underline underline-offset-4 decoration-zinc-800 hover:decoration-white transition-all cursor-pointer"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

function getStatusColor(status: string) {
  const s = status.toLowerCase();
  if (s === "live") return "text-white";
  if (["building", "deploying", "queued"].includes(s))
    return "text-zinc-600 animate-pulse";
  if (s === "failed") return "text-zinc-800";
  return "text-zinc-700";
}

function getLogTypeColor(type: string) {
  switch (type) {
    case "success":
      return "text-zinc-200 font-bold";
    case "error":
      return "text-zinc-600 italic";
    case "system":
      return "text-zinc-500 font-bold";
    default:
      return "text-zinc-700";
  }
}
