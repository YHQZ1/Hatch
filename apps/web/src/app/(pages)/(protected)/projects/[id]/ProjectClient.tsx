/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageLoadingState } from "../../../../components/LoadingState";
import {
  apiFetch,
  apiUrl,
  consumeFlashNotice,
  deploymentUrl,
  readApiError,
  redirectIfUnauthorized,
} from "@/app/lib/api";

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

interface ProjectNotice {
  type: "success" | "error" | "info";
  title: string;
  message?: string;
}

const CACHE_KEY_PREFIX = "hatch_project_";
const CACHE_TTL = 2 * 60 * 1000;

export default function ProjectDetail() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [activeDeployment, setActiveDeployment] = useState<Deployment | null>(
    null,
  );
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<ProjectNotice | null>(null);

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
    const flash = consumeFlashNotice();
    if (flash) {
      setNotice(flash as ProjectNotice);
    }

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
          apiFetch(`/api/projects/${projectId}`),
          apiFetch(`/api/projects/${projectId}/deployments`),
        ]);
        if (
          redirectIfUnauthorized(projRes, router) ||
          redirectIfUnauthorized(depsRes, router)
        ) {
          return;
        }
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
        setNotice({
          type: "error",
          title: "Project unavailable",
          message: "We couldn't load the latest project state.",
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [projectId, router]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!activeDeployment) return;
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
      const wsUrl = apiUrl(`/ws/deployments/${currentId}`).replace(
        /^http/,
        "ws",
      );
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send("READY");
      };
      ws.onmessage = (event) => {
        const line = event.data;
        if (line === "READY" || activeIdRef.current !== currentId) return;
        setLogs((prev) => [...prev, parseLogLine(line)]);

        const nextStatus = statusFromLogLine(line);
        if (nextStatus) {
          updateDeploymentStatus(currentId, nextStatus);
        }

        const nextUrl = deploymentUrlFromLogLine(line);
        if (nextUrl) {
          updateDeploymentUrl(currentId, nextUrl);
        }

        if (
          nextStatus &&
          ["live", "failed", "canceled"].includes(nextStatus)
        ) {
          ws.close();
        }
      };
    } else {
      apiFetch(`/api/deployments/${currentId}/logs`)
        .then((r) => r.json())
        .then((history) => {
          if (activeIdRef.current === currentId && Array.isArray(history)) {
            setLogs(history.map(parseLogLine));
          }
        });
    }

    return () => wsRef.current?.close();
  }, [activeDeployment?.id]);

  const parseLogLine = (line: string): LogLine => {
    const lower = line.toLowerCase();
    const isSuccess =
      line.includes("✓") ||
      line.includes("successfully") ||
      lower.includes("deployment live at") ||
      lower.includes("target healthy");
    const isError =
      line.includes("✗") ||
      lower.includes("error") ||
      lower.includes("failed");
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

  const updateDeploymentUrl = (id: string, url: string) => {
    setDeployments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, url } : d)),
    );
    if (activeIdRef.current === id) {
      setActiveDeployment((prev) => (prev ? { ...prev, url } : null));
    }
  };

  const clearProjectCaches = () => {
    localStorage.removeItem(`${CACHE_KEY_PREFIX}${projectId}`);
    localStorage.removeItem("hatch_projects_cache");
    localStorage.removeItem("hatch_insights_cache");
  };

  const handleCopyLogs = async () => {
    if (logs.length === 0 || copied) return;
    try {
      await navigator.clipboard.writeText(logs.map((l) => l.text).join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice({
        type: "error",
        title: "Copy failed",
        message: "Your browser blocked clipboard access.",
      });
    }
  };

  const handleDeploy = async () => {
    if (!project || deploying) return;
    setDeploying(true);
    try {
      const res = await apiFetch("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          branch: activeDeployment?.branch || project.branch || "main",
          port: Number(activeDeployment?.port || project.port || 80),
          health_check: activeDeployment?.health_check || "/",
        }),
      });
      if (redirectIfUnauthorized(res, router)) return;
      if (res.ok) {
        const newDep = await res.json();
        setDeployments((prev) => [newDep, ...prev]);
        setActiveDeployment(newDep);
        setLogs([]);
        clearProjectCaches();
        setNotice({
          type: "success",
          title: "Deployment queued",
          message: "Live logs will stream here as the build starts.",
        });
      } else {
        setNotice({
          type: "error",
          title: "Deploy failed to start",
          message: await readApiError(res, "The deployment could not be queued."),
        });
      }
    } catch {
      setNotice({
        type: "error",
        title: "Deploy request failed",
        message: "We couldn't reach the API to start a deployment.",
      });
    } finally {
      setDeploying(false);
    }
  };

  const handleCancelDeployment = async () => {
    if (!activeDeployment || canceling) return;
    if (!confirm("Cancel this deployment?")) return;

    setCanceling(true);
    try {
      const res = await apiFetch(
        `/api/deployments/${activeDeployment.id}/cancel`,
        { method: "POST" },
      );
      if (redirectIfUnauthorized(res, router)) return;
      if (!res.ok) {
        setNotice({
          type: "error",
          title: "Cancel failed",
          message: await readApiError(
            res,
            "This deployment can no longer be canceled.",
          ),
        });
        return;
      }

      const canceled = await res.json();
      setDeployments((prev) =>
        prev.map((d) => (d.id === canceled.id ? canceled : d)),
      );
      setActiveDeployment(canceled);
      setLogs((prev) => [...prev, parseLogLine("Deployment canceled by user")]);
      wsRef.current?.close();
      clearProjectCaches();
      setNotice({
        type: "success",
        title: "Deployment canceled",
        message: "Provisioning has been stopped for this run.",
      });
    } finally {
      setCanceling(false);
    }
  };

  if (!mounted) return <PageLoadingState />;

  const activeStatus = activeDeployment?.status?.toLowerCase() ?? "";
  const isLive = activeStatus === "live";
  const isBuilding = ["building", "deploying", "queued"].includes(
    activeStatus,
  );
  const isCancelable = ["building", "deploying", "queued"].includes(
    activeStatus,
  );
  const liveUrl = isLive ? deploymentUrl(activeDeployment?.url) : null;

  return (
    <div className="flex h-[calc(100vh-64px)] bg-black text-zinc-400 overflow-hidden">
      <ProjectToast notice={notice} onDismiss={() => setNotice(null)} />
      {/* SIDEBAR */}
      <aside className="w-[320px] border-r border-[#1a1a1a] flex flex-col bg-[#030303] shrink-0">
        {/* Project header */}
        <div className="px-5 pt-2 pb-5 border-b border-[#1a1a1a] space-y-4">
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
            <div className="min-w-0">
              <h1 className="text-[16px] font-semibold text-white tracking-tight truncate leading-tight">
                {loading ? "Loading..." : project?.repo_name}
              </h1>
              <p className="text-[10px] font-mono text-zinc-700 mt-1 truncate">
                {project?.repo_url.replace("https://github.com/", "") ?? ""}
              </p>
            </div>
          </div>
        </div>

        {/* Live URL + status strip */}
        {activeDeployment && (
          <div className="px-5 py-5 border-b border-[#1a1a1a] space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-[0.22em] text-zinc-800 mb-2">
                  Current run
                </p>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotColor(activeDeployment.status)} ${isBuilding ? "animate-pulse" : ""}`}
                  />
                  <span
                    className={`text-[10px] font-bold uppercase tracking-widest ${statusTextColor(activeDeployment.status)}`}
                  >
                    {activeDeployment.status}
                  </span>
                </div>
              </div>
              <span className="font-mono text-[9px] text-zinc-700">
                {activeDeployment.id.slice(0, 8)}
              </span>
            </div>

            {liveUrl && (
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block border border-[#181818] bg-white/[0.015] px-3 py-2.5 group hover:border-zinc-700 transition-colors"
              >
                <span className="block text-[8px] font-bold uppercase tracking-[0.2em] text-zinc-800 mb-1">
                  Live URL
                </span>
                <span className="block text-[11px] font-mono text-zinc-500 group-hover:text-white transition-colors truncate">
                  {liveUrl.replace(/^https?:\/\//, "")}
                </span>
              </a>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <SidebarStat label="Branch" value={activeDeployment.branch} />
              <SidebarStat label="Port" value={String(activeDeployment.port)} />
              <SidebarStat
                label="Dockerfile"
                value={project?.dockerfile_path || "Dockerfile"}
              />
              <SidebarStat
                label="Health"
                value={activeDeployment.health_check || "/"}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 py-4 border-b border-[#1a1a1a] space-y-2.5">
          <p className="text-[8px] font-bold uppercase tracking-[0.22em] text-zinc-800">
            Actions
          </p>
          <button
            onClick={handleDeploy}
            disabled={deploying || canceling}
            className="w-full bg-white text-black text-[9px] font-bold uppercase tracking-[0.15em] py-2.5 rounded-[2px] hover:bg-zinc-200 transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          >
            {deploying ? "Deploying..." : "Deploy Manually"}
          </button>
          {isCancelable && (
            <button
              onClick={handleCancelDeployment}
              disabled={canceling}
              className="w-full border border-[#2a1515] text-[#c56b6b] text-[9px] font-bold uppercase tracking-[0.15em] py-2.5 rounded-[2px] hover:border-[#5a2525] hover:text-[#d88a8a] transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
            >
              {canceling ? "Canceling..." : "Cancel Deployment"}
            </button>
          )}
          <Link
            href={`/projects/${projectId}/settings`}
            className="block w-full border border-[#181818] text-center text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600 py-2.5 rounded-[2px] hover:border-zinc-700 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            Service Settings
          </Link>
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
                const depIsBuilding = [
                  "building",
                  "deploying",
                  "queued",
                ].includes(dep.status.toLowerCase());

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
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotColor(dep.status)} ${depIsBuilding ? "animate-pulse" : ""}`}
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
      </aside>

      {/* MAIN LOG PANEL */}
      <main className="flex-1 flex flex-col bg-black overflow-hidden">
        {/* Log header */}
        <div className="px-7 py-4 border-b border-[#1a1a1a] flex items-center justify-between bg-[#030303] shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-[13px] font-semibold text-zinc-200 tracking-tight">
                Build log
              </h2>
              {activeDeployment && (
                <span
                  className={`text-[9px] font-bold uppercase tracking-[0.18em] ${statusTextColor(activeDeployment.status)}`}
                >
                  {activeDeployment.status}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-4">
              <span className="text-[9px] font-mono text-zinc-800 uppercase tracking-widest">
                {activeDeployment
                  ? `deploy/${activeDeployment.id.slice(0, 8)}`
                  : "No deployment"}
              </span>
              {logs.length > 0 && (
                <span className="text-[9px] font-mono text-zinc-800">
                  {logs.length} lines
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {isBuilding && (
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1 h-1 rounded-full bg-[#b8872f] animate-pulse"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            )}
            <button
              onClick={handleCopyLogs}
              disabled={logs.length === 0}
              className="text-[9px] font-bold text-zinc-700 hover:text-zinc-300 uppercase tracking-[0.15em] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
            >
              {copied ? "Copied" : "Copy logs"}
            </button>
          </div>
        </div>

        {/* Log body */}
        <div className="flex-1 overflow-y-auto px-7 py-6 font-mono bg-black">
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
            <div className="space-y-px">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[68px_minmax(0,1fr)] gap-5 rounded-[2px] px-2 py-1 hover:bg-white/[0.02]"
                >
                  <span className="text-[9px] text-zinc-800 pt-px select-none tabular-nums">
                    {log.timestamp}
                  </span>
                  <p
                    className={`text-[11px] leading-relaxed break-words ${getLogTypeColor(log.type)}`}
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

function ProjectToast({
  notice,
  onDismiss,
}: {
  notice: ProjectNotice | null;
  onDismiss: () => void;
}) {
  if (!notice) return null;

  const color =
    notice.type === "success"
      ? "text-[#74c69d]"
      : notice.type === "error"
        ? "text-[#c56b6b]"
        : "text-zinc-300";

  return (
    <div className="fixed right-5 top-[76px] z-50 w-[320px] border border-[#242424] bg-[#050505] px-4 py-3 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p
            className={`text-[10px] font-bold uppercase tracking-[0.18em] ${color}`}
          >
            {notice.title}
          </p>
          {notice.message && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
              {notice.message}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[13px] leading-none text-zinc-700 hover:text-zinc-300 transition-colors cursor-pointer"
          aria-label="Dismiss notification"
        >
          x
        </button>
      </div>
    </div>
  );
}

function statusFromLogLine(line: string): string | null {
  const lower = line.toLowerCase();

  if (
    lower.includes("deployment live at") ||
    lower.includes("target healthy") ||
    lower.includes("build complete")
  ) {
    return "live";
  }

  if (lower.includes("deployment canceled")) {
    return "canceled";
  }

  if (lower.includes("deployment failed") || lower.includes("error:")) {
    return "failed";
  }

  if (
    lower.includes("handoff to deployer") ||
    lower.includes("triggering deployment orchestration") ||
    lower.includes("registering task definition") ||
    lower.includes("configuring target group") ||
    lower.includes("updating routing rules") ||
    lower.includes("provisioning fargate") ||
    lower.includes("monitoring service stability") ||
    lower.includes("task health")
  ) {
    return "deploying";
  }

  if (
    lower.includes("syncing source") ||
    lower.includes("starting docker build") ||
    lower.includes("authenticating with amazon ecr") ||
    lower.includes("pushing image") ||
    lower.includes("image successfully pushed")
  ) {
    return "building";
  }

  return null;
}

function deploymentUrlFromLogLine(line: string): string | null {
  if (!line.toLowerCase().includes("deployment live at")) return null;
  return line.match(/https?:\/\/[^\s]+/)?.[0] ?? null;
}

function statusDotColor(status: string): string {
  const s = status.toLowerCase();
  if (s === "live") return "bg-[#74c69d]";
  if (["building", "deploying", "queued"].includes(s)) return "bg-[#b8872f]";
  if (s === "failed" || s === "error") return "bg-[#c56b6b]";
  return "bg-zinc-800";
}

function statusTextColor(status: string): string {
  const s = status.toLowerCase();
  if (s === "live") return "text-[#74c69d]";
  if (["building", "deploying", "queued"].includes(s)) return "text-[#b8872f]";
  if (s === "failed" || s === "error") return "text-[#c56b6b]";
  if (s === "canceled") return "text-zinc-500";
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
        className="text-[#74c69d] underline underline-offset-3 decoration-[#74c69d]/30 hover:decoration-[#74c69d] transition-all"
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
      return "text-[#74c69d]";
    case "error":
      return "text-[#c56b6b]";
    case "system":
      return "text-zinc-500 font-bold";
    default:
      return "text-zinc-600";
  }
}
