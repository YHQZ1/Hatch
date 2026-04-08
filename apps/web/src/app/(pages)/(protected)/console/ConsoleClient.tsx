/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Project {
  id: string;
  repo_name: string;
  repo_url: string;
  branch: string;
  subdomain: string | null;
  port: number;
  auto_deploy: boolean;
  created_at: string;
}

interface Deployment {
  id: string;
  project_id: string;
  status: string;
  branch: string;
  cpu: number;
  memory_mb: number;
  port: number;
  url: string | null;
  subdomain: string | null;
  created_at: string;
  deployed_at: string | null;
}

export default function ConsoleClient() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [deployments, setDeployments] = useState<Record<string, Deployment[]>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem("hatch_token");
    if (!token) {
      router.push("/auth");
      return;
    }

    const fetchData = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/projects`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const data = await res.json();
        const projectsList: Project[] = Array.isArray(data) ? data : [];
        setProjects(projectsList);

        const deploymentPromises = projectsList.map(async (p) => {
          const dRes = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${p.id}/deployments`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const dData = await dRes.json();
          return { id: p.id, data: Array.isArray(dData) ? dData : [] };
        });

        const allDeployments = await Promise.all(deploymentPromises);
        const deploymentMap = allDeployments.reduce(
          (acc, curr) => {
            acc[curr.id] = curr.data;
            return acc;
          },
          {} as Record<string, Deployment[]>,
        );

        setDeployments(deploymentMap);
        setLoading(false);
      } catch (err) {
        console.error("Fetch failed", err);
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  if (!mounted) return null;

  const hasProjects = projects.length > 0;

  const liveCount = Object.values(deployments)
    .map((d) => d[0])
    .filter((d) => d?.status === "live").length;

  const failedCount = Object.values(deployments)
    .map((d) => d[0])
    .filter((d) => d?.status === "failed").length;

  const buildingCount = Object.values(deployments)
    .map((d) => d[0])
    .filter(
      (d) => d?.status === "building" || d?.status === "deploying",
    ).length;

  return (
    <div className="w-full min-h-screen bg-black text-white">
      <main className="w-full px-8 lg:px-10 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-medium tracking-tight text-white">
              Services
            </h1>
            <p className="text-[11px] text-zinc-600 mt-1 tracking-wide">
              Manage cloud workloads and deployments
            </p>
          </div>
          <Link
            href="/new"
            className="bg-white text-black text-[10px] font-bold px-4 py-2 rounded-[3px] uppercase tracking-widest hover:bg-zinc-200 transition-colors"
          >
            + New Service
          </Link>
        </div>

        {/* Stats Row */}
        {!loading && hasProjects && (
          <div className="grid grid-cols-4 gap-px bg-[#1a1a1a] border border-[#1a1a1a] rounded-[3px] mb-6 overflow-hidden">
            <StatCard
              label="Total Services"
              value={projects.length.toString()}
            />
            <StatCard label="Live" value={liveCount.toString()} accent="live" />
            <StatCard
              label="Building"
              value={buildingCount.toString()}
              accent="building"
            />
            <StatCard
              label="Failed"
              value={failedCount.toString()}
              accent="failed"
            />
          </div>
        )}

        {/* Table */}
        <div className="w-full border border-[#1a1a1a] rounded-[3px] overflow-hidden">
          {(hasProjects || loading) && (
            <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_0.7fr_0.7fr_80px] px-5 bg-[#050505] border-b border-[#1a1a1a]">
              {[
                "Service",
                "Repository",
                "Status",
                "Resources",
                "Branch",
                "Last Updated",
                "",
              ].map((h, i) => (
                <div
                  key={h + i}
                  className={`py-3 text-[9px] uppercase tracking-[0.18em] text-[#3a3a3a] font-bold ${i === 6 ? "text-right" : ""}`}
                >
                  {h}
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <LoadingState />
          ) : !hasProjects ? (
            <EmptyState />
          ) : (
            <div>
              {projects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  lastDeployment={deployments[project.id]?.[0]}
                  onDelete={(id) =>
                    setProjects((prev) => prev.filter((p) => p.id !== id))
                  }
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "live" | "building" | "failed";
}) {
  const valueColor =
    accent === "live"
      ? "text-[#4ade80]"
      : accent === "building"
        ? "text-[#ca8a04]"
        : accent === "failed"
          ? "text-[#7f1d1d]"
          : "text-white";

  return (
    <div className="bg-[#080808] px-5 py-4">
      <p className="text-[9px] uppercase tracking-[0.15em] text-[#444] mb-1.5">
        {label}
      </p>
      <p className={`text-2xl font-medium tracking-tight ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}

function ProjectRow({
  project,
  lastDeployment,
  onDelete,
}: {
  project: Project;
  lastDeployment?: Deployment;
  onDelete: (id: string) => void;
}) {
  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Permanently delete ${project.repo_name}?`)) return;
    const token = localStorage.getItem("hatch_token");
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${project.id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) onDelete(project.id);
  };

  const status = lastDeployment?.status ?? "none";
  const isLive = status === "live";
  const isBuilding = status === "building" || status === "deploying";
  const isFailed = status === "failed" || status === "error";

  // deployment.url is set by UpdateDeploymentLive after ECS deploy completes
  const rawUrl =
    lastDeployment?.url || `${project.repo_name.toLowerCase()}.hatchcloud.xyz`;
  const liveUrl = isLive
    ? `https://${rawUrl.replace(/^https?:\/\//, "")}`
    : null;

  // deployed_at when live, fallback to deployment created_at, fallback to project created_at
  const timestampRaw =
    lastDeployment?.deployed_at ??
    lastDeployment?.created_at ??
    project.created_at;
  const updatedAt = formatRelativeTime(timestampRaw);

  const branch = lastDeployment?.branch ?? project.branch;
  const repoSlug = project.repo_url.replace("https://github.com/", "");

  const pulseBg = isLive
    ? "bg-[#4ade80] shadow-[0_0_6px_rgba(74,222,128,0.35)]"
    : isBuilding
      ? "bg-[#ca8a04] animate-pulse"
      : isFailed
        ? "bg-[#7f1d1d]"
        : "bg-zinc-800";

  const statusColor = isLive
    ? "text-[#4ade80]"
    : isBuilding
      ? "text-[#ca8a04]"
      : isFailed
        ? "text-[#7f1d1d]"
        : "text-zinc-700";

  const displayStatus = status === "none" ? "No deploys" : status;

  return (
    <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_0.7fr_0.7fr_80px] px-5 py-4 border-b border-[#111] items-center hover:bg-white/[0.015] transition-colors group last:border-b-0">
      {/* Service name + live URL */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-7 h-7 flex items-center justify-center bg-[#0d0d0d] border border-[#222] rounded-[3px] flex-shrink-0">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="w-3.5 h-3.5 text-zinc-600"
          >
            <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
        </div>
        <div className="min-w-0">
          <Link
            href={`/projects/${project.id}`}
            className="text-[13px] font-medium text-zinc-200 hover:text-white hover:underline decoration-zinc-700 underline-offset-3 block truncate"
          >
            {project.repo_name}
          </Link>
          {liveUrl ? (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-zinc-600 font-mono hover:text-white transition-colors truncate block"
            >
              {liveUrl.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            <span className="text-[10px] text-zinc-800 font-mono">
              {project.id.slice(0, 8)}
            </span>
          )}
        </div>
      </div>

      {/* Repository */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <img
            src="https://cdn.simpleicons.org/github/555555"
            alt="GitHub"
            className="w-3 h-3 flex-shrink-0"
          />
          <a
            href={project.repo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-zinc-500 font-mono truncate hover:text-zinc-300 transition-colors"
          >
            {repoSlug}
          </a>
        </div>
        {project.auto_deploy && (
          <p className="text-[9px] text-zinc-700 uppercase tracking-widest mt-0.5 ml-[18px]">
            auto-deploy on
          </p>
        )}
      </div>

      {/* Status */}
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pulseBg}`} />
        <span
          className={`text-[10px] uppercase tracking-widest font-bold ${statusColor}`}
        >
          {displayStatus}
        </span>
      </div>

      {/* Resources: cpu / memory / port */}
      <div className="min-w-0">
        {lastDeployment ? (
          <>
            <span className="text-[11px] text-zinc-500 font-mono">
              {lastDeployment.cpu} vCPU · {lastDeployment.memory_mb} MB
            </span>
            <p className="text-[10px] text-zinc-700 font-mono mt-0.5">
              port {lastDeployment.port}
            </p>
          </>
        ) : (
          <span className="text-[11px] text-zinc-800">—</span>
        )}
      </div>

      {/* Branch */}
      <div>
        <span className="text-[11px] text-zinc-600 font-mono truncate block">
          {branch}
        </span>
      </div>

      {/* Last Updated */}
      <div>
        <span className="text-[11px] text-zinc-600">{updatedAt}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={handleDelete}
          className="text-[9px] text-zinc-700 hover:text-red-700 border border-zinc-900 hover:border-red-900/40 px-2 py-1 rounded-[2px] transition-all uppercase font-bold tracking-tight cursor-pointer opacity-0 group-hover:opacity-100"
        >
          Del
        </button>
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function LoadingState() {
  return (
    <div>
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[2fr_1.5fr_1fr_1fr_0.7fr_0.7fr_80px] px-5 py-4 border-b border-[#111] items-center last:border-b-0"
          style={{ opacity: 1 - i * 0.2 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-zinc-900 rounded-[3px] animate-pulse" />
            <div className="space-y-1.5">
              <div className="h-2.5 w-28 bg-zinc-900 rounded-full animate-pulse" />
              <div className="h-2 w-20 bg-zinc-900/50 rounded-full animate-pulse" />
            </div>
          </div>
          <div className="h-2 w-36 bg-zinc-900/70 rounded-full animate-pulse" />
          <div className="h-2 w-14 bg-zinc-900/70 rounded-full animate-pulse" />
          <div className="h-2 w-24 bg-zinc-900/50 rounded-full animate-pulse" />
          <div className="h-2 w-12 bg-zinc-900/50 rounded-full animate-pulse" />
          <div className="h-2 w-12 bg-zinc-900/50 rounded-full animate-pulse" />
          <div className="h-5 w-12 bg-zinc-900/70 rounded-[2px] animate-pulse ml-auto" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 border-t border-[#1a1a1a]">
      <div className="w-10 h-10 border border-[#222] rounded-[3px] flex items-center justify-center mb-6">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          className="w-5 h-5 text-zinc-700"
        >
          <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      </div>
      <p className="text-[10px] text-zinc-700 font-mono uppercase tracking-[0.35em] mb-6">
        No active services
      </p>
      <Link
        href="/new"
        className="text-[10px] border border-zinc-800 px-8 py-2.5 rounded-[3px] uppercase font-bold tracking-widest hover:bg-white hover:text-black transition-all"
      >
        Deploy your first service
      </Link>
    </div>
  );
}
