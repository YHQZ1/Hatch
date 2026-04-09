/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageLoadingState } from "../../../../components/LoadingState";

interface Project {
  id: string;
  repo_name: string;
  repo_url: string;
  branch: string;
  port: number;
  dockerfile_path: string;
  subdomain: string | null;
  auto_deploy: boolean;
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
  type: "info" | "success" | "error" | "muted" | "system";
  timestamp: string;
}

const CACHE_KEY_PREFIX = "hatch_project_";
const CACHE_TTL = 2 * 60 * 1000;

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
  }, [logs.length, scrollToBottom]);

  useEffect(() => {
    setMounted(true);
    const t = localStorage.getItem("hatch_token");
    if (!t) {
      router.push("/auth");
      return;
    }
    setToken(t);

    const cacheKey = `${CACHE_KEY_PREFIX}${projectId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - (parsed.timestamp || 0) < CACHE_TTL) {
          setProject(parsed.project);
          setDeployments(parsed.deployments || []);
          if (parsed.deployments?.length > 0)
            setActiveDeployment(parsed.deployments[0]);
          setLoading(false);
        }
      } catch {}
    }

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
        const depList: Deployment[] = Array.isArray(deps) ? deps : [];
        setProject(proj);
        setDeployments(depList);
        if (depList.length > 0) setActiveDeployment(depList[0]);
        localStorage.setItem(
          cacheKey,
          JSON.stringify({
            project: proj,
            deployments: depList,
            timestamp: Date.now(),
          }),
        );
      } catch {
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [projectId, router]);

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
        if (line.includes("Build complete") || line.includes("Live at")) {
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
    if (activeIdRef.current === id)
      setActiveDeployment((prev) => (prev ? { ...prev, status } : null));
  };

  const handleDeploy = async () => {
    if (!project || !token || deploying) return;
    setDeploying(true);
    try {
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
            branch: activeDeployment?.branch || project.branch || "main",
            cpu: Number(activeDeployment?.cpu || 256),
            memory_mb: Number(activeDeployment?.memory_mb || 512),
            port: Number(activeDeployment?.port || project.port || 80),
            health_check: activeDeployment?.health_check || "/",
            env_vars: {},
          }),
        },
      );
      if (res.ok) {
        const newDep = await res.json();
        setDeployments((prev) => [newDep, ...prev]);
        setActiveDeployment(newDep);
        setLogs([]);
        localStorage.removeItem("hatch_projects_cache");
      }
    } catch {
    } finally {
      setDeploying(false);
    }
  };

  if (!mounted) return <PageLoadingState />;

  const isLive = activeDeployment?.status === "live";
  const isBuilding = ["building", "deploying", "queued"].includes(
    activeDeployment?.status?.toLowerCase() ?? "",
  );
  const liveUrl =
    isLive && activeDeployment?.url
      ? `https://${activeDeployment.url.replace(/^https?:\/\//, "")}`
      : null;

  return (
    <div className="flex h-[calc(100vh-64px)] bg-black text-zinc-400 overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-72 border-r border-[#1a1a1a] flex flex-col bg-[#030303] shrink-0">
        {/* Project header */}
        <div className="px-5 pt-2 pb-4 border-b border-[#1a1a1a] space-y-3">
          <Link
            href="/console"
            className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-zinc-700 hover:text-zinc-400 transition-colors font-bold group"
          >
            <span className="group-hover:-translate-x-0.5 transition-transform inline-block">
              ←
            </span>
            Back to Console
          </Link>
          <div>
            <h1 className="text-[14px] font-semibold text-white tracking-tight truncate leading-tight">
              {loading ? "Loading..." : project?.repo_name}
            </h1>
            <p className="text-[10px] font-mono text-zinc-700 mt-0.5 truncate">
              {project?.repo_url.replace("https://github.com/", "") ?? ""}
            </p>
          </div>
        </div>

        {/* Live URL + status strip */}
        {activeDeployment && (
          <div className="px-5 py-4 border-b border-[#1a1a1a] space-y-3">
            <div className="flex items-center gap-2">
              <div
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isLive ? "bg-[#4ade80]" : isBuilding ? "bg-[#ca8a04] animate-pulse" : "bg-zinc-800"}`}
              />
              <span
                className={`text-[10px] font-bold uppercase tracking-widest ${statusTextColor(activeDeployment.status)}`}
              >
                {activeDeployment.status}
              </span>
              {isBuilding && (
                <span className="text-[9px] font-mono text-[#ca8a04] animate-pulse ml-auto">
                  live stream
                </span>
              )}
            </div>

            {liveUrl && (
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 group hover:border-zinc-700 transition-colors"
              >
                <span className="text-[12px] font-mono text-zinc-500 group-hover:text-white transition-colors truncate">
                  {liveUrl.replace(/^https?:\/\//, "")}
                </span>
              </a>
            )}

            <div className="grid grid-cols-2 gap-3 mt-4">
              <SidebarStat label="CPU" value={`${activeDeployment.cpu} vCPU`} />
              <SidebarStat
                label="Memory"
                value={`${activeDeployment.memory_mb} MB`}
              />
              <SidebarStat label="Branch" value={activeDeployment.branch} />
              <SidebarStat label="Port" value={String(activeDeployment.port)} />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 py-3 border-b border-[#1a1a1a] space-y-2">
          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="w-full bg-white text-black text-[9px] font-bold uppercase tracking-[0.15em] py-2.5 rounded-[2px] hover:bg-zinc-200 transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          >
            {deploying ? "Deploying..." : "Deploy Manually"}
          </button>
          {project?.auto_deploy && (
            <p className="text-[8px] text-zinc-800 uppercase tracking-widest text-center font-mono">
              auto-deploy enabled
            </p>
          )}
        </div>

        {/* Deployment history */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-3 flex items-center justify-between">
            <span className="text-[9px] font-bold font-mono text-zinc-800 uppercase tracking-[0.25em]">
              History
            </span>
            <span className="text-[9px] font-mono text-zinc-800">
              {deployments.length}
            </span>
          </div>
          <div>
            {loading ? (
              <div className="px-5 space-y-3 py-2">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="space-y-1.5"
                    style={{ opacity: 1 - i * 0.25 }}
                  >
                    <div className="h-2 w-16 bg-zinc-900 rounded-full animate-pulse" />
                    <div className="h-2 w-28 bg-zinc-900/60 rounded-full animate-pulse" />
                  </div>
                ))}
              </div>
            ) : deployments.length === 0 ? (
              <p className="px-5 text-[10px] text-zinc-800 font-mono py-3">
                No deployments yet
              </p>
            ) : (
              deployments.map((dep, idx) => {
                const isActive = activeDeployment?.id === dep.id;
                const depIsLive = dep.status === "live";
                const depIsBuilding = [
                  "building",
                  "deploying",
                  "queued",
                ].includes(dep.status.toLowerCase());
                const depIsFailed =
                  dep.status === "failed" || dep.status === "error";

                return (
                  <button
                    key={dep.id}
                    onClick={() => setActiveDeployment(dep)}
                    className={`w-full text-left px-5 py-3 border-b border-[#111] transition-colors relative ${isActive ? "bg-white/[0.03]" : "hover:bg-white/[0.015]"}`}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-white" />
                    )}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${depIsLive ? "bg-[#4ade80]" : depIsBuilding ? "bg-[#ca8a04] animate-pulse" : depIsFailed ? "bg-[#7f1d1d]" : "bg-zinc-800"}`}
                        />
                        <span
                          className={`text-[9px] font-bold uppercase tracking-widest ${statusTextColor(dep.status)}`}
                        >
                          {dep.status}
                        </span>
                        {idx === 0 && (
                          <span className="text-[7px] uppercase tracking-widest text-zinc-800 border border-zinc-900 px-1 py-px rounded-sm">
                            latest
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[9px] text-zinc-700">
                        {formatRelativeTime(dep.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pl-3">
                      <span className="font-mono text-[9px] text-zinc-700">
                        {dep.id.slice(0, 8)}
                      </span>
                      <Link
                        href={`/projects/${projectId}/deployments/${dep.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[8px] uppercase tracking-widest text-zinc-700 hover:text-white transition-colors"
                      >
                        Details →
                      </Link>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[#1a1a1a]">
          <Link
            href={`/projects/${projectId}/settings`}
            className="flex items-center gap-3 px-5 py-3.5 text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-700 hover:text-zinc-300 hover:bg-white/[0.02] transition-all"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Settings
          </Link>
        </div>
      </aside>

      {/* MAIN LOG PANEL */}
      <main className="flex-1 flex flex-col bg-black overflow-hidden">
        {/* Log header */}
        <div className="px-6 py-3 border-b border-[#1a1a1a] flex items-center justify-between bg-[#030303] shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-[9px] font-mono text-zinc-800 uppercase tracking-widest">
              {activeDeployment
                ? `deploy/${activeDeployment.id.slice(0, 8)}`
                : "No deployment"}
            </span>
            {isBuilding && (
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1 h-1 rounded-full bg-[#ca8a04] animate-pulse"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            )}
            {logs.length > 0 && (
              <span className="text-[9px] font-mono text-zinc-800">
                {logs.length} lines
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setLogs([])}
              className="text-[9px] font-bold text-zinc-700 hover:text-zinc-300 uppercase tracking-[0.15em] transition-colors cursor-pointer"
            >
              Clear
            </button>
            <button
              onClick={() =>
                navigator.clipboard.writeText(
                  logs.map((l) => l.text).join("\n"),
                )
              }
              className="text-[9px] font-bold text-zinc-700 hover:text-zinc-300 uppercase tracking-[0.15em] transition-colors cursor-pointer"
            >
              Copy
            </button>
          </div>
        </div>

        {/* Log body */}
        <div className="flex-1 overflow-y-auto px-8 py-6 font-mono bg-black">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-800">
                {isBuilding ? "Waiting for output..." : "No log output"}
              </p>
              {!isBuilding && activeDeployment && (
                <p className="text-[9px] font-mono text-zinc-800">
                  Logs may not be available for older deployments
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-5 py-0.5">
                  <span className="w-14 shrink-0 text-[9px] text-zinc-800 pt-px select-none tabular-nums">
                    {log.timestamp}
                  </span>
                  <p
                    className={`text-[11px] leading-relaxed break-all ${getLogTypeColor(log.type)}`}
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
    </div>
  );
}

function SidebarStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[8px] uppercase tracking-[0.18em] text-zinc-800 mb-0.5 font-bold">
        {label}
      </p>
      <p className="text-[10px] font-mono text-zinc-500">{value}</p>
    </div>
  );
}

function statusTextColor(status: string): string {
  const s = status.toLowerCase();
  if (s === "live") return "text-[#4ade80]";
  if (["building", "deploying", "queued"].includes(s)) return "text-[#ca8a04]";
  if (s === "failed" || s === "error") return "text-[#7f1d1d]";
  return "text-zinc-700";
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function renderLogText(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    part.match(urlRegex) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#4ade80] underline underline-offset-3 decoration-[#4ade80]/30 hover:decoration-[#4ade80] transition-all"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function getLogTypeColor(type: string): string {
  switch (type) {
    case "success":
      return "text-[#4ade80]";
    case "error":
      return "text-[#7f1d1d]";
    case "system":
      return "text-zinc-500 font-bold";
    default:
      return "text-zinc-600";
  }
}
