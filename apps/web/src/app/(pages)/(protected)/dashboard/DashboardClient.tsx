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
  created_at: string;
}

interface Deployment {
  id: string;
  project_id: string;
  status: string;
  branch: string;
}

export default function DashboardClient() {
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
        const projectsList = Array.isArray(data) ? data : [];
        setProjects(projectsList);

        const deploymentPromises = projectsList.map(async (p: Project) => {
          const dRes = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${p.id}/deployments`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
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

  return (
    <div className="w-full min-h-screen bg-black text-white">
      <main className="w-full">
        <div className="px-6 lg:px-10 py-6">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h1 className="text-4xl font-medium tracking-tight mb-2">
                Services
              </h1>
              <p className="text-zinc-500 text-sm">
                Manage your active cloud workloads and deployments.
              </p>
            </div>
            <Link
              href="/new"
              className="bg-white text-black text-[11px] font-bold px-5 py-2 rounded-[2px] uppercase tracking-tight hover:bg-zinc-200 transition-colors cursor-pointer"
            >
              + New Service
            </Link>
          </div>

          <div
            className={`w-full border border-[#1a1a1a] rounded-[2px] overflow-hidden ${hasProjects || loading ? "bg-[#050505]" : ""}`}
          >
            {(hasProjects || loading) && (
              <div className="grid grid-cols-12 px-6 py-4 border-b border-[#1a1a1a] bg-black text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
                <div className="col-span-4">Service</div>
                <div className="col-span-3">Source</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Created</div>
                <div className="col-span-1 text-right">Actions</div>
              </div>
            )}

            {loading ? (
              <LoadingState />
            ) : !hasProjects ? (
              <EmptyState />
            ) : (
              <div className="divide-y divide-[#1a1a1a]">
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
        </div>
      </main>
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
  const createdAt = new Date(project.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm(`Permanently delete ${project.repo_name}?`)) return;

    const token = localStorage.getItem("hatch_token");
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${project.id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (res.ok) onDelete(project.id);
  };

  const status = lastDeployment?.status || "No Deployments";
  const isLive =
    status.toLowerCase() === "live" || status.toLowerCase() === "ready";

  return (
    <div className="grid grid-cols-12 px-6 py-6 items-center hover:bg-white/[0.01] transition-colors">
      <div className="col-span-4 flex items-center gap-4">
        <div className="w-8 h-8 flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-sm">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="w-4 h-4 text-zinc-400"
          >
            <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
        </div>
        <Link
          href={`/projects/${project.id}`}
          className="text-[14px] font-medium text-zinc-100 hover:text-white transition-colors hover:underline decoration-zinc-700 underline-offset-4 cursor-pointer"
        >
          {project.repo_name}
        </Link>
      </div>

      <div className="col-span-3">
        <div className="flex items-center gap-2">
          <img
            src="https://cdn.simpleicons.org/github/666666"
            alt="GH"
            className="w-3 h-3"
          />
          <span className="text-[12px] text-zinc-500 font-mono truncate max-w-[180px]">
            {project.repo_url.replace("https://github.com/", "")}
          </span>
        </div>
        <div className="text-[10px] text-zinc-700 font-mono mt-0.5 ml-5">
          {lastDeployment?.branch || "main"}
        </div>
      </div>

      <div className="col-span-2">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]" : "bg-zinc-800"}`}
          />
          <span
            className={`text-[11px] uppercase tracking-widest font-bold ${isLive ? "text-zinc-200" : "text-zinc-600"}`}
          >
            {status}
          </span>
        </div>
      </div>

      <div className="col-span-2">
        <span className="text-[11px] text-zinc-600 font-medium uppercase tracking-tighter">
          {createdAt}
        </span>
      </div>

      <div className="col-span-1 text-right">
        <button
          onClick={handleDelete}
          className="text-[9px] text-zinc-600 hover:text-red-500 border border-zinc-900 hover:border-red-900/30 px-2.5 py-1 rounded-[2px] transition-all uppercase font-bold tracking-tighter cursor-pointer"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="divide-y divide-[#1a1a1a]">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="px-6 py-8 animate-pulse grid grid-cols-12 items-center"
        >
          <div className="col-span-4 flex items-center gap-4">
            <div className="w-8 h-8 bg-zinc-900 rounded-sm" />
            <div className="h-4 w-32 bg-zinc-900 rounded-sm" />
          </div>
          <div className="col-span-3 h-3 w-40 bg-zinc-900 rounded-sm" />
          <div className="col-span-2 h-3 w-16 bg-zinc-900 rounded-sm" />
          <div className="col-span-2 h-3 w-20 bg-zinc-900 rounded-sm" />
          <div className="col-span-1 h-6 w-12 bg-zinc-900 rounded-sm ml-auto" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-50 flex flex-col items-center justify-center border-t border-[#1a1a1a]">
      <p className="text-zinc-700 font-mono text-[11px] uppercase tracking-[0.4em] mb-8">
        No Active Services
      </p>
      <Link
        href="/new"
        className="text-xs border border-zinc-800 px-10 py-3 rounded-[2px] uppercase font-bold hover:bg-white hover:text-black transition-all cursor-pointer"
      >
        Deploy Project
      </Link>
    </div>
  );
}
