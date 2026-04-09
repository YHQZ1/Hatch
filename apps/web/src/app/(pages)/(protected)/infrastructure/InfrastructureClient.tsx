/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import { PageLoadingState } from "../../../components/LoadingState";

interface Deployment {
  id: string;
  cpu: number;
  memory_mb: number;
  subdomain: string;
  status?: string;
}

const CACHE_KEY = "hatch_infrastructure_cache";
const CACHE_TTL = 3 * 60 * 1000;

export default function InfrastructureClient() {
  const router = useRouter();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem("hatch_token");
    if (!token) {
      router.push("/auth");
      return;
    }

    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const cacheAge = Date.now() - (parsed.timestamp || 0);
        if (cacheAge < CACHE_TTL) {
          setDeployments(parsed.data || []);
          setLoading(false);
        }
      } catch {}
    }

    const fetchData = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/projects`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const projects = await res.json();
        const projectsList = Array.isArray(projects) ? projects : [];

        const dPromises = projectsList.map((p: any) =>
          fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${p.id}/deployments`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          ).then((r) => r.json()),
        );

        const allDeployments = await Promise.all(dPromises);
        const flatDeployments = allDeployments
          .flat()
          .filter((d: any) => d?.status === "live");
        setDeployments(flatDeployments);

        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            data: flatDeployments,
            timestamp: Date.now(),
          }),
        );
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  if (!mounted) return <PageLoadingState />;

  return (
    <div className="w-full min-h-screen bg-black text-white">
      <main className="w-full px-8 lg:px-10 py-8">
        <PageHeader
          title="Infrastructure"
          description="Global edge network and system architecture"
        />

        <div className="space-y-8">
          <section className="relative w-full h-[550px] border border-[#1a1a1a] bg-[#050505] rounded-[2px] overflow-hidden flex items-center justify-center">
            <div className="absolute inset-0 opacity-[0.05] bg-grid-pattern z-10 pointer-events-none" />

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <img
                src="/map.svg"
                alt="Network Map"
                className="w-full h-full object-contain opacity-10 filter invert brightness-[0.1]"
                style={{
                  transform: "scale(5.5) translateX(-6.5%) translateY(5.5%)",
                }}
              />
            </div>

            <div className="relative z-20 translate-x-[60px] translate-y-[-20px]">
              <div className="flex flex-col items-center">
                <div className="relative flex items-center justify-center cursor-pointer group">
                  <div className="absolute w-24 h-24 bg-white/10 rounded-full animate-ping" />
                  <div className="absolute w-12 h-12 bg-white/5 rounded-full border border-white/20 animate-pulse" />
                  <div className="w-4 h-4 bg-white rounded-full shadow-[0_0_30px_white] relative z-10 transition-transform group-hover:scale-125" />
                </div>

                <div className="mt-8 bg-black/90 backdrop-blur-md border border-white/10 px-6 py-3 rounded-[2px] text-center shadow-2xl cursor-default">
                  <p className="text-[12px] font-bold uppercase tracking-[0.25em] text-white mb-1">
                    Mumbai Cluster
                  </p>
                  <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">
                    ap-south-1 • Active
                  </p>
                </div>
              </div>
            </div>

            <div className="absolute bottom-12 left-12 space-y-2 z-30">
              <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-[0.4em] mb-4">
                Core_Fleet_Infrastructure
              </p>
              <h1 className="text-6xl font-medium tracking-tighter uppercase text-white">
                System
              </h1>
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">
                System Architecture
              </h2>
              <span className="text-[9px] font-mono text-zinc-700 uppercase tracking-widest">
                Hatch Control Plane
              </span>
            </div>

            <div className="w-full border border-[#1a1a1a] bg-[#050505] p-8 overflow-x-auto">
              <ArchitectureDiagram />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function ArchitectureDiagram() {
  return (
    <div className="flex flex-col items-center min-w-[1100px] gap-4 p-8 bg-[#050505]">
      {/* Top Row */}
      <div className="grid grid-cols-[180px_1fr_180px_1fr_180px_1fr_180px] w-full items-center h-[100px]">
        <ArchNode
          title="GitHub"
          sub="Source control"
          icon="github"
          color="FFFFFF"
        />
        <FlowArrow direction="right" label="OAuth + Webhook" />
        <div className="flex justify-center">
          <ArchNode
            title="API Gateway"
            sub="Go · Gin"
            icon="go"
            color="00ADD8"
          />
        </div>
        <FlowArrow direction="right" label="BuildJobEvent" />
        <div className="flex justify-center">
          <ArchNode
            title="RabbitMQ"
            sub="Message broker"
            icon="rabbitmq"
            color="FF6600"
          />
        </div>
        <FlowArrow direction="right" label="Telemetry" />
        <ArchNode
          title="Datadog"
          sub="APM · Tracing"
          icon="datadog"
          color="632CA6"
        />
      </div>

      <div className="grid grid-cols-[180px_1fr_180px_1fr_180px_1fr_180px] w-full h-12">
        <div />
        <div />
        <FlowArrow direction="down" label="Read/Write" />
        <div />
        <div />
      </div>

      {/* Middle Content Row */}
      <div className="grid grid-cols-[180px_1fr_372px_1fr_180px_1fr_180px] w-full items-start mb-16">
        {/* DB Column */}
        <div className="flex flex-col gap-3">
          <ArchNode
            title="PostgreSQL"
            sub="RDS · App data"
            icon="postgresql"
            color="4169E1"
            className="h-[90px]"
          />
          <ArchNode
            title="Redis"
            sub="ElastiCache"
            icon="redis"
            color="FF4438"
            className="h-[90px]"
          />
        </div>

        <div />

        {/* Centered API + Metrics Column */}
        <div className="flex flex-col gap-2">
          <ArchNode
            title="API Gateway"
            sub="Stateless Core"
            icon="go"
            color="00ADD8"
            className="h-[90px] w-full"
          />
          <div className="flex gap-2 w-full">
            <ArchNode
              title="Prometheus"
              sub="Metrics"
              icon="prometheus"
              color="E6522C"
              className="h-[90px] flex-1"
            />
            <ArchNode
              title="Grafana"
              sub="Dash"
              icon="grafana"
              color="F46800"
              className="h-[90px] flex-1"
            />
          </div>
        </div>

        <div />

        {/* Builder Column */}
        <div className="flex flex-col w-[180px] gap-2">
          <ArchNode
            title="Builder"
            sub="CI / Docker"
            icon="docker"
            color="2496ED"
            className="h-[90px]"
          />
          <ArchNode
            title="Secrets"
            sub="AWS Manager"
            customIcon={<AwsIcon />}
            className="h-[90px]"
          />
        </div>

        <div />

        {/* Deployer Column */}
        <div className="flex flex-col w-[180px] gap-3">
          <ArchNode
            title="Cloudflare"
            sub="Edge Network"
            icon="cloudflare"
            color="F38020"
            className="h-[90px]"
          />
          <ArchNode
            title="Deployer"
            sub="ECS Orchestrator"
            customIcon={<AwsIcon />}
            className="h-[90px]"
          />
        </div>
      </div>

      {/* Bottom Row */}
      <div className="relative w-full mt-8">
        <div className="absolute inset-x-[-24px] inset-y-[-20px] border border-white/5 bg-white/[0.01] rounded-xl pointer-events-none" />
        <span className="absolute -top-10 left-0 px-2 py-0 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
          Runtime Environment
        </span>
        <div className="grid grid-cols-[180px_1fr_180px_1fr_180px_1fr_180px] w-full items-center relative z-10 h-[120px]">
          <ArchNode
            title="ECR"
            sub="Image Registry"
            customIcon={<AwsIcon />}
            className="h-[120px]"
          />
          <FlowArrow direction="right" />
          <ArchNode
            title="ECS Fargate"
            sub="Compute"
            customIcon={<AwsIcon />}
            className="h-[120px]"
          />
          <FlowArrow direction="right" label="Logs" />
          <ArchNode
            title="CloudWatch"
            sub="Aggregator"
            customIcon={<AwsIcon />}
            className="h-[120px]"
          />
          <FlowArrow direction="right" label="Public" />
          <ArchNode
            title="ALB / Route53"
            sub="Ingress"
            customIcon={<AwsIcon />}
            className="h-[120px]"
          />
        </div>
      </div>
    </div>
  );
}

function ArchNode({
  title,
  sub,
  icon,
  color = "FFFFFF",
  customIcon,
  className = "h-[100px]",
}: {
  title: string;
  sub: string;
  icon?: string;
  color?: string;
  customIcon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`w-[180px] ${className} p-4 border border-[#333] bg-[#050505] flex flex-col items-center justify-center text-center gap-2 relative z-10`}
    >
      {icon && (
        <img
          src={`https://cdn.simpleicons.org/${icon}/${color}`}
          alt=""
          className="w-6 h-6 opacity-90"
        />
      )}
      {customIcon && (
        <div className="w-6 h-6 flex items-center justify-center opacity-90">
          {customIcon}
        </div>
      )}
      <div>
        <div className="text-sm font-medium text-white">{title}</div>
        <div className="font-mono text-[10px] text-[#888] mt-1">{sub}</div>
      </div>
    </div>
  );
}

function FlowArrow({
  direction = "right",
  label,
}: {
  direction?: "right" | "down";
  label?: string;
}) {
  if (direction === "right") {
    return (
      <div className="relative w-full h-full flex items-center justify-center self-stretch z-0">
        {label && (
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full -mt-1 bg-[#050505] px-2 py-0.5 font-mono text-[9px] text-[#888] border border-[#222] rounded whitespace-nowrap z-10">
            {label}
          </span>
        )}
        <svg
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full h-[2px]"
          preserveAspectRatio="none"
        >
          <line
            x1="0"
            y1="1"
            x2="100%"
            y2="1"
            stroke="#555"
            strokeWidth="2"
            strokeDasharray="4 4"
            className="animate-flow"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center self-stretch z-0">
      {label && (
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#050505] px-2 py-0.5 font-mono text-[9px] text-[#888] border border-[#222] rounded whitespace-nowrap z-10">
          {label}
        </span>
      )}
      <svg
        className="absolute inset-y-0 left-1/2 -translate-x-1/2 h-full w-[2px]"
        preserveAspectRatio="none"
      >
        <line
          x1="1"
          y1="0"
          x2="1"
          y2="100%"
          stroke="#555"
          strokeWidth="2"
          strokeDasharray="4 4"
          className="animate-flow"
        />
      </svg>
    </div>
  );
}

function AwsIcon() {
  return <img src="/aws.svg" alt="AWS" width={24} height={24} />;
}
