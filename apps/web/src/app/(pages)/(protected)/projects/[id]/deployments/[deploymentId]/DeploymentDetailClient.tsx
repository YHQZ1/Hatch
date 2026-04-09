/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageLoadingState } from "../../../../../../components/LoadingState";

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

const CACHE_KEY_PREFIX = "hatch_deployment_";
const CACHE_TTL = 5 * 60 * 1000;
const PIPELINE_STEPS = ["Queued", "Building", "Deploying", "Live"];

function getPipelineIndex(status: string): number {
  const s = status.toLowerCase();
  if (s === "queued") return 0;
  if (s === "building") return 1;
  if (s === "deploying") return 2;
  if (s === "live") return 3;
  return -1;
}

export default function DeploymentDetailClient() {
  const { id, deploymentId } = useParams();
  const router = useRouter();
  const [data, setData] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem("hatch_token");
    if (!token) {
      router.push("/auth");
      return;
    }

    const cacheKey = `${CACHE_KEY_PREFIX}${deploymentId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - (parsed.timestamp || 0) < CACHE_TTL) {
          setData(parsed.data);
          setLoading(false);
        }
      } catch {}
    }

    fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/deployments/${deploymentId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )
      .then((r) => r.json())
      .then((json) => {
        setData(json);
        localStorage.setItem(
          cacheKey,
          JSON.stringify({ data: json, timestamp: Date.now() }),
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [deploymentId, router]);

  if (!mounted || loading) return <PageLoadingState />;

  const isLive = data?.status === "live";
  const isBuilding = ["building", "deploying", "queued"].includes(
    data?.status?.toLowerCase() ?? "",
  );
  const isFailed = data?.status === "failed" || data?.status === "error";
  const pipelineIdx = getPipelineIndex(data?.status ?? "");

  const duration =
    data?.created_at && data?.deployed_at
      ? Math.round(
          (new Date(data.deployed_at).getTime() -
            new Date(data.created_at).getTime()) /
            1000,
        )
      : null;

  const liveUrl =
    isLive && data?.url
      ? `https://${data.url.replace(/^https?:\/\//, "")}`
      : null;

  const statusColor = isLive
    ? "text-white"
    : isFailed
      ? "text-[#7f1d1d]"
      : isBuilding
        ? "text-[#ca8a04]"
        : "text-zinc-600";

  const statusDot = isLive
    ? "bg-[#4ade80]"
    : isFailed
      ? "bg-[#7f1d1d]"
      : isBuilding
        ? "bg-[#ca8a04] animate-pulse"
        : "bg-zinc-700";

  return (
    <div className="w-full h-screen bg-black text-white flex flex-col overflow-hidden">
      <header className="shrink-0 border-b border-[#1a1a1a] px-8 py-4 flex items-center bg-black">
        <Link
          href={`/projects/${id}`}
          className="text-[14px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
        >
          <span className="text-[15px] mr-0.5">←</span>
          Go back
        </Link>
      </header>

      <main
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: "none" }}
      >
        <div className="border-b border-[#1a1a1a] bg-[#030303]">
          <div className="px-8 lg:px-10 pt-8 pb-6 flex items-start justify-between gap-8">
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`}
                />
                <h1 className="text-[22px] font-bold tracking-tight font-mono text-white leading-none">
                  {String(deploymentId).slice(0, 8)}
                  <span className="text-zinc-800 text-[16px]">
                    ···{String(deploymentId).slice(-4)}
                  </span>
                </h1>
                <span
                  className={`text-[11px] font-bold uppercase tracking-widest ${statusColor}`}
                >
                  {data?.status}
                </span>
              </div>
              <p className="text-[10px] font-mono text-zinc-700 ml-5">
                {data?.created_at
                  ? new Date(data.created_at).toLocaleString()
                  : "—"}
                {duration !== null && (
                  <span className="ml-3 text-zinc-800">
                    ·{" "}
                    {duration < 60
                      ? `${duration}s`
                      : `${Math.floor(duration / 60)}m ${duration % 60}s`}
                  </span>
                )}
              </p>
            </div>

            {liveUrl && (
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 group flex-shrink-0"
              >
                <span className="text-[12px] font-mono text-zinc-600 group-hover:text-zinc-300 transition-colors">
                  {liveUrl.replace(/^https?:\/\//, "")}
                </span>
                <span className="text-zinc-800 group-hover:text-zinc-500 transition-colors text-[10px]">
                  ↗
                </span>
              </a>
            )}
          </div>

          <div className="px-8 lg:px-10 pb-8">
            <div className="grid grid-cols-4 border border-[#1a1a1a] rounded-[3px] overflow-hidden divide-x divide-[#1a1a1a]">
              {PIPELINE_STEPS.map((step, idx) => {
                const done = !isFailed && pipelineIdx >= idx;
                const isCurrent = pipelineIdx === idx;
                const failed = isFailed && idx === Math.max(pipelineIdx, 0);

                return (
                  <div
                    key={step}
                    className={`px-6 py-5 flex flex-col gap-3 ${done ? "bg-[#070707]" : "bg-[#040404]"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[8px] uppercase tracking-[0.25em] font-bold ${
                          failed
                            ? "text-[#7f1d1d]"
                            : done
                              ? "text-zinc-700"
                              : "text-[#2a2a2a]"
                        }`}
                      >
                        step {String(idx + 1).padStart(2, "0")}
                      </span>
                      <div
                        className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 ${
                          failed
                            ? "bg-[#7f1d1d]/20 text-[#7f1d1d] border border-[#7f1d1d]/40"
                            : done
                              ? "bg-zinc-900 text-white border border-zinc-700"
                              : "bg-transparent text-[#2a2a2a] border border-[#1f1f1f]"
                        } ${isCurrent && isBuilding ? "animate-pulse" : ""}`}
                      >
                        {failed ? "✗" : done ? "✓" : "·"}
                      </div>
                    </div>

                    <p
                      className={`text-[15px] font-semibold tracking-tight leading-none ${
                        failed
                          ? "text-[#7f1d1d]"
                          : done
                            ? "text-white"
                            : "text-[#2a2a2a]"
                      }`}
                    >
                      {step}
                    </p>

                    <p className="text-[9px] font-mono text-zinc-800">
                      {idx === 0 && data?.created_at
                        ? new Date(data.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })
                        : idx === 3 && data?.deployed_at
                          ? new Date(data.deployed_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })
                          : done
                            ? "completed"
                            : "pending"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-8 lg:px-10 py-8 space-y-px">
          <div className="grid grid-cols-3 border border-[#1a1a1a] rounded-t-[3px] overflow-hidden divide-x divide-[#1a1a1a]">
            <div className="bg-[#050505] p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600 mb-5">
                Runtime
              </p>
              <div className="space-y-4">
                <Kv label="CPU" value={`${data?.cpu ?? "—"} vCPU`} />
                <Kv label="Memory" value={`${data?.memory_mb ?? "—"} MB`} />
                <Kv label="Port" value={String(data?.port ?? "—")} />
                <Kv label="Health check" value={data?.health_check || "/"} />
              </div>
            </div>

            <div className="bg-[#050505] p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600 mb-5">
                Source
              </p>
              <div className="space-y-4">
                <Kv label="Branch" value={data?.branch || "—"} />
                <Kv
                  label="Queued"
                  value={
                    data?.created_at
                      ? new Date(data.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"
                  }
                />
                <Kv
                  label="Deployed"
                  value={
                    data?.deployed_at
                      ? new Date(data.deployed_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"
                  }
                />
                <Kv
                  label="Duration"
                  value={
                    duration !== null
                      ? duration < 60
                        ? `${duration}s`
                        : `${Math.floor(duration / 60)}m ${duration % 60}s`
                      : "—"
                  }
                />
              </div>
            </div>

            <div className="bg-[#050505] p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600 mb-5">
                Network
              </p>
              <div className="space-y-4">
                <Kv label="Subdomain" value={data?.subdomain || "—"} />
                <Kv
                  label="URL"
                  value={
                    data?.url ? (
                      <a
                        href={data.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-400 hover:text-white hover:underline text-[10px] font-mono transition-colors"
                      >
                        {data.url.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />
                <Kv
                  label="Status"
                  value={data?.status ?? "—"}
                  accent={isLive ? "live" : isFailed ? "failed" : "neutral"}
                />
              </div>
            </div>
          </div>

          <div className="border border-[#1a1a1a] border-t-0 bg-[#030303] rounded-b-[3px] flex items-stretch divide-x divide-[#1a1a1a]">
            <div className="px-6 py-4 flex items-center flex-shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600 whitespace-nowrap">
                Container Image
              </p>
            </div>
            <div className="px-6 py-4 flex-1 min-w-0 flex items-center">
              <code className="text-[10px] font-mono text-zinc-500 break-all leading-relaxed">
                {data?.image_uri || "No image URI recorded"}
              </code>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Kv({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | React.ReactNode;
  accent?: "live" | "failed" | "neutral";
}) {
  const valueColor =
    accent === "live"
      ? "text-zinc-300"
      : accent === "failed"
        ? "text-[#7f1d1d]"
        : "text-zinc-500";
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-700 flex-shrink-0">
        {label}
      </span>
      <span
        className={`text-[10px] font-mono truncate text-right max-w-[60%] ${valueColor}`}
      >
        {value}
      </span>
    </div>
  );
}
