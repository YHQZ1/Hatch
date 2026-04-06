/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function DeploymentDetailClient() {
  const { id, deploymentId } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("hatch_token");
    if (!token) {
      router.push("/auth");
      return;
    }

    fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/deployments/${deploymentId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [deploymentId]);

  if (loading) return null;

  return (
    <div className="min-h-screen bg-black text-zinc-400 font-sans p-8 lg:p-16 selection:bg-white selection:text-black">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Navigation Breadcrumb */}
        <nav className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
          <Link
            href={`/projects/${id}`}
            className="hover:text-white transition-colors"
          >
            Service
          </Link>
          <span>/</span>
          <span className="text-zinc-400">
            Deployment {String(deploymentId).slice(0, 8)}
          </span>
        </nav>

        {/* Status & ID Header */}
        <div className="flex items-end justify-between border-b border-white/5 pb-8">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-white tracking-tighter uppercase">
              Deployment Detail
            </h1>
            <p className="text-xs font-mono text-zinc-600">{deploymentId}</p>
          </div>
          <div className="flex items-center gap-3 px-3 py-1 border border-white/10 rounded-sm">
            <div
              className={`w-1.5 h-1.5 rounded-full ${data?.status === "live" ? "bg-emerald-500" : "bg-zinc-600"}`}
            />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white">
              {data?.status || "Archived"}
            </span>
          </div>
        </div>

        {/* Metadata Grid (Render-esque) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-20 gap-y-10">
          <MetaItem
            label="Created At"
            value={new Date(data?.created_at).toLocaleString()}
          />
          <MetaItem label="Deployed By" value="System_Trigger" />
          <MetaItem label="Branch" value={data?.branch || "main"} />
          <MetaItem label="Root Directory" value="./" />
          <MetaItem
            label="Compute"
            value={`${data?.cpu} vCPU / ${data?.memory_mb} MB RAM`}
          />
          <MetaItem
            label="Health Check"
            value={data?.health_check_path || "/"}
          />
          <MetaItem label="Internal Port" value={data?.port} />
          <MetaItem label="Region" value="ap-south-1" />
        </div>

        {/* Image/Artifact Section */}
        <div className="pt-10 space-y-4">
          <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em]">
            Container Artifact
          </p>
          <div className="bg-[#050505] border border-white/5 p-4 rounded-sm">
            <code className="text-xs text-zinc-400 break-all">
              {data?.image_uri || "hatch-registry.cloud/deployments/null"}
            </code>
          </div>
        </div>

        <footer className="pt-20 text-[9px] font-mono text-zinc-800 uppercase tracking-[0.4em]">
          Hatch Infrastructure Registry // Record Immutable
        </footer>
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center border-b border-white/[0.03] py-3">
      <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
        {label}
      </span>
      <span className="text-sm font-medium text-zinc-300 tracking-tight">
        {value}
      </span>
    </div>
  );
}
