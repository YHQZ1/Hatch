"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageLoadingState } from "../../../components/LoadingState";
import {
  apiFetch,
  deploymentUrl,
  readApiError,
  redirectIfUnauthorized,
} from "@/app/lib/api";

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
  commit_sha?: string | null;
  commit_message?: string | null;
  cpu: number;
  memory_mb: number;
  port: number;
  url: string | null;
  subdomain: string | null;
  created_at: string;
  deployed_at: string | null;
}

interface ActivityEvent {
  id: string;
  type: string;
  message: string;
  created_at: string;
}

interface ServiceInsight {
  project: Project;
  deployments: Deployment[];
  latest?: Deployment;
  liveUrl: string | null;
  health: HealthState;
}

type HealthKind = "healthy" | "active" | "failed" | "idle" | "canceled";

interface HealthState {
  kind: HealthKind;
  label: string;
}

type TimeRange = "24h" | "7d" | "30d";

interface TelemetryPoint {
  label: string;
  requests: number;
  errors: number;
  latency: number;
  cpu: number;
  memory: number;
}

interface TelemetrySummary {
  requests: number;
  errorRate: number;
  latency: number;
  cpu: number;
  memory: number;
}

interface ProjectMetrics {
  source: string;
  available: boolean;
  reason?: string;
  points: TelemetryPoint[];
  summary: TelemetrySummary;
}

interface TelemetryResult {
  points: TelemetryPoint[];
  summary: TelemetrySummary;
  source: "cloudwatch" | "preview";
  reason: string;
}

const CACHE_KEY = "hatch_insights_cache";
const CACHE_TTL = 60 * 1000;
const ACTIVE_STATUSES = new Set(["queued", "building", "deploying"]);
const FAILED_STATUSES = new Set(["failed", "error"]);
const CANCELED_STATUSES = new Set(["canceled", "cancelled"]);
const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: "24H", value: "24h" },
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
];

export default function InsightsClient() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [deploymentsByProject, setDeploymentsByProject] = useState<
    Record<string, Deployment[]>
  >({});
  const [metricsByProject, setMetricsByProject] = useState<
    Record<string, ProjectMetrics>
  >({});
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const loadData = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const [projectsRes, activityRes] = await Promise.all([
          apiFetch("/api/projects"),
          apiFetch("/api/activity"),
        ]);

        if (
          redirectIfUnauthorized(projectsRes, router) ||
          redirectIfUnauthorized(activityRes, router)
        ) {
          return;
        }

        if (!projectsRes.ok) {
          throw new Error(
            await readApiError(projectsRes, "Failed to fetch projects"),
          );
        }

        const projectsData = await projectsRes.json();
        const projectsList: Project[] = Array.isArray(projectsData)
          ? projectsData
          : [];

        const deploymentResults = await Promise.all(
          projectsList.map(async (project) => {
            const res = await apiFetch(`/api/projects/${project.id}/deployments`);
            if (redirectIfUnauthorized(res, router) || !res.ok) {
              return { id: project.id, data: [] as Deployment[] };
            }
            const data = await res.json();
            return {
              id: project.id,
              data: Array.isArray(data) ? data : ([] as Deployment[]),
            };
          }),
        );

        const metricResults = await Promise.all(
          projectsList.map(async (project) => {
            const res = await apiFetch(
              `/api/projects/${project.id}/metrics?range=${timeRange}`,
            );
            if (redirectIfUnauthorized(res, router) || !res.ok) {
              return { id: project.id, data: null as ProjectMetrics | null };
            }
            const data = await res.json();
            return {
              id: project.id,
              data: normalizeProjectMetrics(data),
            };
          }),
        );

        const deploymentMap = deploymentResults.reduce(
          (acc, item) => {
            acc[item.id] = item.data;
            return acc;
          },
          {} as Record<string, Deployment[]>,
        );
        const metricsMap = metricResults.reduce(
          (acc, item) => {
            if (item.data) acc[item.id] = item.data;
            return acc;
          },
          {} as Record<string, ProjectMetrics>,
        );

        const activityData = activityRes.ok ? await activityRes.json() : [];
        const activityList: ActivityEvent[] = Array.isArray(activityData)
          ? activityData
          : [];

        setProjects(projectsList);
        setDeploymentsByProject(deploymentMap);
        setMetricsByProject(metricsMap);
        setActivity(activityList);
        setLastSyncedAt(new Date());

        if (
          selectedProjectId !== "all" &&
          !projectsList.some((project) => project.id === selectedProjectId)
        ) {
          setSelectedProjectId("all");
        }

        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            projects: projectsList,
            deploymentsByProject: deploymentMap,
            metricsByProject: metricsMap,
            activity: activityList,
            timeRange,
            timestamp: Date.now(),
          }),
        );
      } catch {
        // Keep cached insight data visible if a background refresh fails.
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router, selectedProjectId, timeRange],
  );

  useEffect(() => {
    setMounted(true);

    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const cacheAge = Date.now() - (parsed.timestamp || 0);
        if (cacheAge < CACHE_TTL && parsed.timeRange === timeRange) {
          setProjects(parsed.projects || []);
          setDeploymentsByProject(parsed.deploymentsByProject || {});
          setMetricsByProject(parsed.metricsByProject || {});
          setActivity(parsed.activity || []);
          setLastSyncedAt(new Date(parsed.timestamp));
          setLoading(false);
          loadData({ background: true });
          return;
        }
      } catch {}
    }

    loadData();
  }, [loadData, timeRange]);

  const services = useMemo<ServiceInsight[]>(() => {
    return projects.map((project) => {
      const deployments = deploymentsByProject[project.id] || [];
      const latest = deployments[0];
      return {
        project,
        deployments,
        latest,
        liveUrl: getServiceUrl(project, latest),
        health: getHealth(latest?.status),
      };
    });
  }, [deploymentsByProject, projects]);

  const allDeployments = useMemo(
    () => services.flatMap((service) => service.deployments),
    [services],
  );

  const overview = useMemo(() => getOverview(services, allDeployments), [
    allDeployments,
    services,
  ]);

  const selectedService = useMemo(
    () =>
      selectedProjectId === "all"
        ? null
        : services.find((service) => service.project.id === selectedProjectId) ||
          null,
    [selectedProjectId, services],
  );

  const telemetry = useMemo<TelemetryResult>(() => {
    if (selectedService) {
      const realMetrics = metricsByProject[selectedService.project.id];
      if (realMetrics?.available && realMetrics.points.length > 0) {
        return {
          points: realMetrics.points,
          summary: realMetrics.summary,
          source: "cloudwatch",
          reason: realMetrics.reason || "",
        };
      }

      return {
        ...buildTelemetry([selectedService], selectedService.deployments, timeRange),
        source: "preview",
        reason: realMetrics?.reason || "",
      };
    }

    const aggregated = aggregateProjectMetrics(services, metricsByProject);
    if (aggregated) {
      return aggregated;
    }

    return {
      ...buildTelemetry(services, allDeployments, timeRange),
      source: "preview",
      reason: "",
    };
  }, [allDeployments, metricsByProject, selectedService, services, timeRange]);

  const activeDeployments = services.some((service) =>
    ACTIVE_STATUSES.has(service.latest?.status?.toLowerCase() || ""),
  );

  useEffect(() => {
    if (!activeDeployments) return;
    const interval = window.setInterval(() => loadData({ background: true }), 8000);
    return () => window.clearInterval(interval);
  }, [activeDeployments, loadData]);

  if (!mounted) return <PageLoadingState />;

  return (
    <div className="w-full min-h-screen bg-black text-white">
      <main className="w-full px-5 sm:px-6 lg:px-10 py-6 lg:py-8">
        <InsightsHeader
          lastSyncedAt={lastSyncedAt}
          refreshing={refreshing}
          onRefresh={() => loadData({ background: true })}
        />

        {loading ? (
          <InsightsSkeleton />
        ) : (
          <div className="space-y-6">
            <ServiceSelector
              services={services}
              selectedProjectId={selectedProjectId}
              onSelect={setSelectedProjectId}
            />

            {selectedService ? (
              <ServiceDashboard
                service={selectedService}
                activity={activity}
                telemetry={telemetry}
                timeRange={timeRange}
                onTimeRangeChange={setTimeRange}
              />
            ) : (
              <OverallDashboard
                overview={overview}
                services={services}
                deployments={allDeployments}
                activity={activity}
                telemetry={telemetry}
                timeRange={timeRange}
                onTimeRangeChange={setTimeRange}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function InsightsHeader({
  lastSyncedAt,
  refreshing,
  onRefresh,
}: {
  lastSyncedAt: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between mb-8">
      <div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-white">
          Insights
        </h1>
        <p className="text-[12px] text-zinc-600 mt-2 tracking-wide max-w-xl">
          Watch traffic, latency, failures, and deployment behaviour across every
          service.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="text-left sm:text-right">
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#333] font-bold">
            {refreshing ? "Refreshing" : "Last synced"}
          </p>
          <p className="text-[11px] text-zinc-600 mt-1">
            {lastSyncedAt ? formatRelativeTime(lastSyncedAt.toISOString()) : "—"}
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="h-9 px-4 border border-[#1a1a1a] rounded-[3px] text-[10px] uppercase tracking-widest font-bold text-zinc-400 hover:text-white hover:border-zinc-600 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {refreshing ? "Syncing" : "Refresh"}
        </button>
      </div>
    </div>
  );
}

function ServiceSelector({
  services,
  selectedProjectId,
  onSelect,
}: {
  services: ServiceInsight[];
  selectedProjectId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="border border-[#1a1a1a] rounded-[6px] bg-[#030303] p-2 overflow-x-auto">
      <div className="flex items-center gap-2 min-w-max">
        <button
          onClick={() => onSelect("all")}
          className={`h-9 px-4 rounded-[3px] text-[10px] uppercase tracking-widest font-bold transition-all cursor-pointer ${
            selectedProjectId === "all"
              ? "bg-white text-black"
              : "text-zinc-500 hover:text-white hover:bg-white/[0.04]"
          }`}
        >
          All Services
        </button>
        {services.map((service) => (
          <button
            key={service.project.id}
            onClick={() => onSelect(service.project.id)}
            className={`h-9 px-4 rounded-[3px] text-[10px] uppercase tracking-widest font-bold transition-all cursor-pointer flex items-center gap-2 ${
              selectedProjectId === service.project.id
                ? "bg-white text-black"
                : "text-zinc-500 hover:text-white hover:bg-white/[0.04]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                healthColors(service.health.kind).dot
              }`}
            />
            {service.project.repo_name}
          </button>
        ))}
      </div>
    </div>
  );
}

function OverallDashboard({
  overview,
  services,
  deployments,
  activity,
  telemetry,
  timeRange,
  onTimeRangeChange,
}: {
  overview: ReturnType<typeof getOverview>;
  services: ServiceInsight[];
  deployments: Deployment[];
  activity: ActivityEvent[];
  telemetry: TelemetryResult;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}) {
  const trend = deploymentTrend(deployments);
  const recentDeployments = [...deployments]
    .sort((a, b) => dateValue(b.created_at) - dateValue(a.created_at))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-px bg-[#1a1a1a] border border-[#1a1a1a] rounded-[6px] overflow-hidden">
        <MetricCard label="Services" value={String(overview.totalServices)} />
        <MetricCard
          label="Healthy"
          value={String(overview.healthy)}
          accent="green"
        />
        <MetricCard
          label="Attention"
          value={String(overview.attention)}
          accent={overview.attention > 0 ? "red" : undefined}
        />
        <MetricCard label="Success Rate" value={`${overview.successRate}%`} />
      </div>

      <TelemetrySection
        title="Runtime Observability"
        scope="All services"
        telemetry={telemetry}
        timeRange={timeRange}
        onTimeRangeChange={onTimeRangeChange}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
        <Panel title="Deployment Behaviour" meta="Last 7 days">
          <BarTrend data={trend} />
        </Panel>

        <Panel title="Fleet Health" meta="Latest deployment per service">
          <div className="space-y-3">
            {services.length > 0 ? (
              services.map((service) => (
                <ServiceHealthRow key={service.project.id} service={service} />
              ))
            ) : (
              <EmptyInline text="No services deployed yet" />
            )}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
        <Panel title="Recent Deployments" meta="Newest first">
          <DeploymentList deployments={recentDeployments} services={services} />
        </Panel>
        <Panel title="Activity Stream" meta="Latest audit entries">
          <ActivityList activity={activity.slice(0, 6)} />
        </Panel>
      </div>
    </div>
  );
}

function ServiceDashboard({
  service,
  activity,
  telemetry,
  timeRange,
  onTimeRangeChange,
}: {
  service: ServiceInsight;
  activity: ActivityEvent[];
  telemetry: TelemetryResult;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}) {
  const deployments = service.deployments;
  const successRate = calculateSuccessRate(deployments);
  const latest = service.latest;
  const trend = deploymentTrend(deployments);
  const relatedActivity = activity
    .filter((event) =>
      event.message.toLowerCase().includes(service.project.repo_name.toLowerCase()),
    )
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="border border-[#1a1a1a] rounded-[6px] bg-[#030303] p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-3">
              <HealthText health={service.health} />
              <span className="text-[10px] text-zinc-700 font-mono">
                {formatRepoSlug(service.project.repo_url)}
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-white truncate">
              {service.project.repo_name}
            </h2>
            <p className="text-[12px] text-zinc-600 mt-2 tracking-wide max-w-xl">
              {latest?.commit_message ||
                "Deployment and health summary for this service."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {service.liveUrl && (
              <a
                href={service.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-4 border border-[#222] rounded-[3px] text-[10px] uppercase tracking-widest font-bold text-zinc-400 hover:text-white hover:border-zinc-500 transition-all cursor-pointer flex items-center"
              >
                Open
              </a>
            )}
            <Link
              href={`/projects/${service.project.id}`}
              className="h-9 px-4 bg-white text-black rounded-[3px] text-[10px] uppercase tracking-widest font-bold hover:bg-zinc-200 transition-colors flex items-center cursor-pointer"
            >
              Details
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-px bg-[#1a1a1a] border border-[#1a1a1a] rounded-[6px] overflow-hidden">
        <MetricCard label="Deployments" value={String(deployments.length)} />
        <MetricCard label="Success Rate" value={`${successRate}%`} />
        <MetricCard
          label="Latest Commit"
          value={latest?.commit_sha ? latest.commit_sha.slice(0, 7) : "—"}
          mono
        />
        <MetricCard label="Branch" value={latest?.branch || service.project.branch} />
      </div>

      <TelemetrySection
        title="Service Observability"
        scope={service.project.repo_name}
        telemetry={telemetry}
        timeRange={timeRange}
        onTimeRangeChange={onTimeRangeChange}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
        <Panel title="Deployment Behaviour" meta="This service">
          <BarTrend data={trend} />
        </Panel>
        <Panel title="Runtime Contract" meta="Configured service settings">
          <div className="grid grid-cols-2 gap-3">
            <MiniInfo label="Port" value={String(latest?.port || service.project.port)} />
            <MiniInfo label="CPU" value={latest ? `${latest.cpu} vCPU` : "—"} />
            <MiniInfo
              label="Memory"
              value={latest ? `${latest.memory_mb} MB` : "—"}
            />
            <MiniInfo
              label="Auto Deploy"
              value={service.project.auto_deploy ? "On" : "Off"}
            />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
        <Panel title="Deployment History" meta="Newest first">
          <DeploymentList deployments={deployments.slice(0, 8)} services={[service]} />
        </Panel>
        <Panel title="Related Activity" meta="Audit entries">
          <ActivityList activity={relatedActivity} />
        </Panel>
      </div>
    </div>
  );
}

function TelemetrySection({
  title,
  scope,
  telemetry,
  timeRange,
  onTimeRangeChange,
}: {
  title: string;
  scope: string;
  telemetry: TelemetryResult;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}) {
  const usingCloudWatch = telemetry.source === "cloudwatch";

  return (
    <section className="border border-[#1a1a1a] rounded-[6px] bg-[#030303] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#111] flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
              {title}
            </h3>
            <span
              className={`text-[9px] uppercase tracking-[0.16em] font-mono ${
                usingCloudWatch ? "text-[#3fba78]" : "text-[#facc15]"
              }`}
            >
              {usingCloudWatch ? "CloudWatch" : "Preview telemetry"}
            </span>
          </div>
          <p className="text-[11px] text-zinc-700 mt-1">
            {scope} ·{" "}
            {usingCloudWatch
              ? "live AWS metrics from ECS and the application load balancer."
              : telemetry.reason ||
                "derived from deployment signals until runtime metrics are connected."}
          </p>
        </div>
        <RangeControl value={timeRange} onChange={onTimeRangeChange} />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-px bg-[#151515]">
        <MetricCard
          label="Requests"
          value={formatCompactNumber(telemetry.summary.requests)}
          mono
        />
        <MetricCard
          label="Error Rate"
          value={`${telemetry.summary.errorRate.toFixed(2)}%`}
          accent={telemetry.summary.errorRate > 2 ? "red" : undefined}
          mono
        />
        <MetricCard
          label="P95 Latency"
          value={`${Math.round(telemetry.summary.latency)}ms`}
          accent={telemetry.summary.latency > 450 ? "amber" : undefined}
          mono
        />
        <MetricCard
          label="CPU"
          value={`${Math.round(telemetry.summary.cpu)}%`}
          accent={telemetry.summary.cpu > 70 ? "amber" : undefined}
          mono
        />
        <MetricCard
          label="Memory"
          value={`${Math.round(telemetry.summary.memory)}%`}
          accent={telemetry.summary.memory > 78 ? "amber" : undefined}
          mono
        />
      </div>

      <div className="p-5 grid grid-cols-1 2xl:grid-cols-2 gap-5">
        <LineChart
          title="Traffic"
          meta="Requests"
          data={telemetry.points}
          metric="requests"
          color="#7dd3fc"
          formatter={formatCompactNumber}
        />
        <LineChart
          title="Latency"
          meta="P95 response time"
          data={telemetry.points}
          metric="latency"
          color="#c084fc"
          formatter={(value) => `${Math.round(value)}ms`}
        />
        <LineChart
          title="Errors"
          meta="Error rate"
          data={telemetry.points}
          metric="errors"
          color="#d05252"
          formatter={(value) => `${value.toFixed(2)}%`}
        />
        <ResourceChart data={telemetry.points} />
      </div>
    </section>
  );
}

function RangeControl({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 border border-[#1a1a1a] bg-black p-1 rounded-[4px] w-fit">
      {TIME_RANGES.map((range) => (
        <button
          key={range.value}
          onClick={() => onChange(range.value)}
          className={`h-7 px-3 rounded-[3px] text-[9px] uppercase tracking-[0.18em] font-bold transition-all cursor-pointer ${
            value === range.value
              ? "bg-white text-black"
              : "text-zinc-600 hover:text-white hover:bg-white/[0.04]"
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}

function LineChart({
  title,
  meta,
  data,
  metric,
  color,
  formatter,
}: {
  title: string;
  meta: string;
  data: TelemetryPoint[];
  metric: keyof Pick<TelemetryPoint, "requests" | "errors" | "latency" | "cpu" | "memory">;
  color: string;
  formatter: (value: number) => string;
}) {
  const values = data.map((point) => Number(point[metric]));
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const latest = values[values.length - 1] || 0;
  const previous = values[values.length - 2] || latest;
  const delta = latest - previous;
  const { linePath, areaPath } = chartPaths(values, min, max);

  return (
    <div className="border border-[#111] bg-[#050505] rounded-[4px] p-4 min-w-0">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-bold">
            {title}
          </p>
          <p className="text-[10px] text-zinc-700 mt-1">{meta}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-xl text-white tracking-tight">
            {formatter(latest)}
          </p>
          <p
            className={`font-mono text-[10px] mt-1 ${
              delta > 0 ? "text-[#3fba78]" : delta < 0 ? "text-[#d05252]" : "text-zinc-700"
            }`}
          >
            {delta === 0 ? "flat" : `${delta > 0 ? "+" : ""}${formatter(delta)}`}
          </p>
        </div>
      </div>

      <svg viewBox="0 0 720 240" className="w-full h-56 overflow-visible">
        <defs>
          <linearGradient id={`fill-${metric}-${title}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.24" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((item) => (
          <line
            key={item}
            x1="42"
            x2="704"
            y1={26 + item * 52}
            y2={26 + item * 52}
            stroke="#151515"
            strokeWidth="1"
          />
        ))}
        <path d={areaPath} fill={`url(#fill-${metric}-${title})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" />
        {data.map((point, index) => {
          if (index !== 0 && index !== data.length - 1 && index % 4 !== 0) {
            return null;
          }
          const x = 42 + (index / Math.max(data.length - 1, 1)) * 662;
          return (
            <text
              key={`${point.label}-${index}`}
              x={x}
              y="226"
              textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
              fill="#3f3f46"
              fontSize="10"
              fontFamily="monospace"
            >
              {point.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function ResourceChart({ data }: { data: TelemetryPoint[] }) {
  return (
    <div className="border border-[#111] bg-[#050505] rounded-[4px] p-4 min-w-0">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-bold">
            Resources
          </p>
          <p className="text-[10px] text-zinc-700 mt-1">CPU and memory pressure</p>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px]">
          <span className="text-[#3fba78]">CPU</span>
          <span className="text-[#facc15]">MEM</span>
        </div>
      </div>
      <svg viewBox="0 0 720 240" className="w-full h-56 overflow-visible">
        {[0, 1, 2, 3].map((item) => (
          <line
            key={item}
            x1="42"
            x2="704"
            y1={26 + item * 52}
            y2={26 + item * 52}
            stroke="#151515"
            strokeWidth="1"
          />
        ))}
        <path
          d={chartPaths(data.map((point) => point.memory), 0, 100).linePath}
          fill="none"
          stroke="#facc15"
          strokeWidth="2.25"
        />
        <path
          d={chartPaths(data.map((point) => point.cpu), 0, 100).linePath}
          fill="none"
          stroke="#3fba78"
          strokeWidth="2.25"
        />
        {data.map((point, index) => {
          if (index !== 0 && index !== data.length - 1 && index % 4 !== 0) {
            return null;
          }
          const x = 42 + (index / Math.max(data.length - 1, 1)) * 662;
          return (
            <text
              key={`${point.label}-${index}`}
              x={x}
              y="226"
              textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
              fill="#3f3f46"
              fontSize="10"
              fontFamily="monospace"
            >
              {point.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: string;
  accent?: "green" | "red" | "amber";
  mono?: boolean;
}) {
  const color =
    accent === "green"
      ? "text-[#3fba78]"
      : accent === "red"
        ? "text-[#d05252]"
        : accent === "amber"
          ? "text-[#facc15]"
          : "text-white";

  return (
    <div className="bg-[#080808] px-5 py-4 min-w-0">
      <p className="text-[9px] uppercase tracking-[0.15em] text-[#444] mb-1.5">
        {label}
      </p>
      <p
        className={`text-2xl font-medium tracking-tight truncate ${color} ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Panel({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[#1a1a1a] rounded-[6px] bg-[#030303] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#111] flex items-center justify-between gap-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
          {title}
        </h3>
        {meta && (
          <span className="text-[9px] uppercase tracking-[0.18em] text-zinc-700 font-mono">
            {meta}
          </span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function BarTrend({ data }: { data: { label: string; total: number; failed: number }[] }) {
  const max = Math.max(...data.map((item) => item.total), 1);

  return (
    <div className="h-56 flex items-end gap-3">
      {data.map((item) => {
        const height = Math.max((item.total / max) * 100, item.total ? 12 : 3);
        const failedHeight = item.total ? (item.failed / item.total) * 100 : 0;
        return (
          <div key={item.label} className="flex-1 h-full flex flex-col justify-end min-w-0">
            <div className="relative h-full flex items-end">
              <div
                className="w-full bg-[#151515] border border-[#202020] rounded-t-[3px] overflow-hidden"
                style={{ height: `${height}%` }}
              >
                <div
                  className="w-full bg-[#5a1d1d]"
                  style={{ height: `${failedHeight}%` }}
                />
              </div>
            </div>
            <div className="text-[9px] text-zinc-700 font-mono mt-3 text-center truncate">
              {item.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ServiceHealthRow({ service }: { service: ServiceInsight }) {
  return (
    <div className="flex items-center justify-between gap-4 border border-[#111] bg-[#050505] rounded-[3px] px-4 py-3">
      <div className="min-w-0">
        <Link
          href={`/projects/${service.project.id}`}
          className="text-[13px] text-zinc-200 hover:text-white transition-colors cursor-pointer truncate block"
        >
          {service.project.repo_name}
        </Link>
        <p className="text-[10px] text-zinc-700 font-mono mt-0.5 truncate">
          {service.latest?.commit_sha?.slice(0, 7) || service.project.branch}
        </p>
      </div>
      <HealthText health={service.health} />
    </div>
  );
}

function DeploymentList({
  deployments,
  services,
}: {
  deployments: Deployment[];
  services: ServiceInsight[];
}) {
  if (deployments.length === 0) {
    return <EmptyInline text="No deployments yet" />;
  }

  return (
    <div className="space-y-3">
      {deployments.map((deployment) => {
        const service = services.find(
          (item) => item.project.id === deployment.project_id,
        );
        const health = getHealth(deployment.status);
        return (
          <div
            key={deployment.id}
            className="border border-[#111] bg-[#050505] rounded-[3px] px-4 py-3"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13px] text-zinc-200 truncate">
                  {service?.project.repo_name || deployment.project_id.slice(0, 8)}
                </p>
                <p className="text-[10px] text-zinc-700 mt-1 truncate">
                  {deployment.commit_message ||
                    deployment.commit_sha?.slice(0, 7) ||
                    deployment.branch}
                </p>
              </div>
              <HealthText health={health} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 font-mono text-[10px] text-zinc-700">
              <span>{deployment.branch}</span>
              <span>{formatRelativeTime(deployment.created_at)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityList({ activity }: { activity: ActivityEvent[] }) {
  if (activity.length === 0) {
    return <EmptyInline text="No activity for this view" />;
  }

  return (
    <div className="space-y-3">
      {activity.map((event) => (
        <div
          key={event.id}
          className="border border-[#111] bg-[#050505] rounded-[3px] px-4 py-3"
        >
          <p className="text-[13px] text-zinc-300 leading-relaxed">
            {event.message}
          </p>
          <div className="mt-3 flex items-center justify-between gap-4 font-mono text-[10px] text-zinc-700">
            <span>{event.type}</span>
            <span>{formatRelativeTime(event.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#111] bg-[#050505] rounded-[3px] px-4 py-3 min-w-0">
      <p className="text-[9px] uppercase tracking-[0.18em] text-[#444] font-bold mb-1.5">
        {label}
      </p>
      <p className="text-[13px] text-zinc-300 truncate">{value}</p>
    </div>
  );
}

function HealthText({ health }: { health: HealthState }) {
  const colors = healthColors(health.kind);
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
      <span className={`text-[10px] uppercase tracking-widest font-bold ${colors.text}`}>
        {health.label}
      </span>
    </div>
  );
}

function EmptyInline({ text }: { text: string }) {
  return (
    <div className="min-h-36 flex items-center justify-center text-center">
      <p className="text-[10px] text-zinc-700 font-mono uppercase tracking-[0.25em]">
        {text}
      </p>
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-14 border border-[#1a1a1a] rounded-[6px] bg-[#030303] animate-pulse" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-px bg-[#1a1a1a] border border-[#1a1a1a] rounded-[6px] overflow-hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="bg-[#080808] px-5 py-4">
            <div className="h-2 w-20 bg-zinc-900 rounded-full mb-3 animate-pulse" />
            <div className="h-7 w-14 bg-zinc-900 rounded-full animate-pulse" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="h-80 border border-[#1a1a1a] rounded-[6px] bg-[#030303] animate-pulse" />
        <div className="h-80 border border-[#1a1a1a] rounded-[6px] bg-[#030303] animate-pulse" />
      </div>
    </div>
  );
}

function normalizeProjectMetrics(data: unknown): ProjectMetrics {
  const raw = data as Partial<ProjectMetrics> | null;
  const points = Array.isArray(raw?.points)
    ? raw.points.map((point) => ({
        label: String(point.label || ""),
        requests: Number(point.requests || 0),
        errors: Number(point.errors || 0),
        latency: Number(point.latency || 0),
        cpu: Number(point.cpu || 0),
        memory: Number(point.memory || 0),
      }))
    : [];

  return {
    source: String(raw?.source || "cloudwatch"),
    available: Boolean(raw?.available) && points.length > 0,
    reason: raw?.reason,
    points,
    summary: normalizeMetricSummary(raw?.summary, points),
  };
}

function normalizeMetricSummary(
  summary: Partial<TelemetrySummary> | undefined,
  points: TelemetryPoint[],
): TelemetrySummary {
  if (summary) {
    return {
      requests: Number(summary.requests || 0),
      errorRate: Number(summary.errorRate || 0),
      latency: Number(summary.latency || 0),
      cpu: Number(summary.cpu || 0),
      memory: Number(summary.memory || 0),
    };
  }
  return summarizeTelemetryPoints(points);
}

function aggregateProjectMetrics(
  services: ServiceInsight[],
  metricsByProject: Record<string, ProjectMetrics>,
): TelemetryResult | null {
  const realMetrics = services
    .map((service) => metricsByProject[service.project.id])
    .filter((metrics): metrics is ProjectMetrics =>
      Boolean(metrics?.available && metrics.points.length > 0),
    );

  if (realMetrics.length === 0) {
    return null;
  }

  const longest = Math.max(...realMetrics.map((metrics) => metrics.points.length));
  const points = Array.from({ length: longest }).map((_, index) => {
    const items = realMetrics
      .map((metrics) => metrics.points[index])
      .filter((point): point is TelemetryPoint => Boolean(point));
    const requests = items.reduce((sum, point) => sum + point.requests, 0);
    return {
      label: items[0]?.label || "",
      requests,
      errors: average(items.map((point) => point.errors)),
      latency: average(items.map((point) => point.latency)),
      cpu: average(items.map((point) => point.cpu)),
      memory: average(items.map((point) => point.memory)),
    };
  });

  return {
    points,
    summary: summarizeTelemetryPoints(points),
    source: "cloudwatch",
    reason: "",
  };
}

function summarizeTelemetryPoints(points: TelemetryPoint[]): TelemetrySummary {
  if (points.length === 0) {
    return { requests: 0, errorRate: 0, latency: 0, cpu: 0, memory: 0 };
  }

  return {
    requests: points.reduce((sum, point) => sum + point.requests, 0),
    errorRate: average(points.map((point) => point.errors)),
    latency: average(points.map((point) => point.latency)),
    cpu: average(points.map((point) => point.cpu)),
    memory: average(points.map((point) => point.memory)),
  };
}

function buildTelemetry(
  services: ServiceInsight[],
  deployments: Deployment[],
  range: TimeRange,
): { points: TelemetryPoint[]; summary: TelemetrySummary } {
  const buckets = range === "24h" ? 24 : range === "7d" ? 14 : 30;
  const labelEvery = range === "24h" ? 6 : range === "7d" ? 2 : 5;
  const serviceWeight = Math.max(services.length, 1);
  const liveWeight = Math.max(
    services.filter((service) => service.health.kind === "healthy").length,
    1,
  );
  const failedWeight = deployments.filter((deployment) =>
    FAILED_STATUSES.has(deployment.status.toLowerCase()),
  ).length;
  const activeWeight = services.filter((service) => service.health.kind === "active")
    .length;
  const seed =
    services.reduce((sum, service) => sum + hashCode(service.project.id), 0) +
    deployments.reduce((sum, deployment) => sum + hashCode(deployment.id), 0);

  const points = Array.from({ length: buckets }).map((_, index) => {
    const wave = Math.sin((index + seed % 11) / 2.7);
    const secondWave = Math.cos((index + seed % 7) / 4.1);
    const deploymentBoost = deployments.filter((deployment) =>
      isDeploymentInBucket(deployment, index, buckets, range),
    ).length;
    const baseRequests = 160 * serviceWeight + 95 * liveWeight;
    const requests = Math.max(
      12,
      Math.round(baseRequests + wave * 52 + secondWave * 28 + deploymentBoost * 180),
    );
    const errors = clamp(
      0.18 + failedWeight * 0.42 + activeWeight * 0.16 + Math.max(wave, 0) * 0.34,
      0.05,
      8.5,
    );
    const latency = Math.round(
      clamp(112 + serviceWeight * 18 + deploymentBoost * 28 + secondWave * 34, 64, 820),
    );
    const cpu = Math.round(
      clamp(22 + serviceWeight * 5 + activeWeight * 10 + wave * 12 + deploymentBoost * 8, 8, 96),
    );
    const memory = Math.round(
      clamp(36 + serviceWeight * 4 + secondWave * 9 + deploymentBoost * 5, 18, 94),
    );

    return {
      label: telemetryLabel(index, buckets, range, labelEvery),
      requests,
      errors,
      latency,
      cpu,
      memory,
    };
  });

  const totals = points.reduce(
    (acc, point) => {
      acc.requests += point.requests;
      acc.errorRate += point.errors;
      acc.latency += point.latency;
      acc.cpu += point.cpu;
      acc.memory += point.memory;
      return acc;
    },
    { requests: 0, errorRate: 0, latency: 0, cpu: 0, memory: 0 },
  );

  return {
    points,
    summary: {
      requests: totals.requests,
      errorRate: totals.errorRate / points.length,
      latency: totals.latency / points.length,
      cpu: totals.cpu / points.length,
      memory: totals.memory / points.length,
    },
  };
}

function isDeploymentInBucket(
  deployment: Deployment,
  index: number,
  buckets: number,
  range: TimeRange,
) {
  const now = new Date();
  const created = new Date(deployment.created_at);
  if (Number.isNaN(created.getTime())) return false;

  if (range === "24h") {
    const diffHours = Math.floor((now.getTime() - created.getTime()) / 3600000);
    return diffHours >= 0 && buckets - 1 - diffHours === index;
  }

  const diffDays = Math.floor((now.getTime() - created.getTime()) / 86400000);
  if (range === "7d") {
    return diffDays >= 0 && buckets - 1 - Math.floor(diffDays * 2) === index;
  }
  return diffDays >= 0 && buckets - 1 - diffDays === index;
}

function telemetryLabel(
  index: number,
  buckets: number,
  range: TimeRange,
  labelEvery: number,
) {
  if (index !== 0 && index !== buckets - 1 && index % labelEvery !== 0) {
    return "";
  }

  const date = new Date();
  if (range === "24h") {
    date.setHours(date.getHours() - (buckets - 1 - index));
    return date.toLocaleTimeString("en-US", { hour: "numeric" });
  }

  if (range === "7d") {
    date.setDate(date.getDate() - Math.floor((buckets - 1 - index) / 2));
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }

  date.setDate(date.getDate() - (buckets - 1 - index));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function chartPaths(values: number[], min: number, max: number) {
  const chartLeft = 42;
  const chartTop = 18;
  const chartWidth = 662;
  const chartHeight = 184;
  const safeMax = max === min ? max + 1 : max;

  const points = values.map((value, index) => {
    const x = chartLeft + (index / Math.max(values.length - 1, 1)) * chartWidth;
    const y =
      chartTop +
      chartHeight -
      ((value - min) / Math.max(safeMax - min, 1)) * chartHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point}`)
    .join(" ");
  const areaPath = `${linePath} L${chartLeft + chartWidth},${chartTop + chartHeight} L${chartLeft},${chartTop + chartHeight} Z`;

  return { linePath, areaPath };
}

function getOverview(services: ServiceInsight[], deployments: Deployment[]) {
  const healthy = services.filter((service) => service.health.kind === "healthy")
    .length;
  const attention = services.filter((service) =>
    ["failed", "active"].includes(service.health.kind),
  ).length;

  return {
    totalServices: services.length,
    healthy,
    attention,
    successRate: calculateSuccessRate(deployments),
  };
}

function calculateSuccessRate(deployments: Deployment[]) {
  const finished = deployments.filter((deployment) =>
    ["live", "failed", "error", "canceled", "cancelled"].includes(
      deployment.status.toLowerCase(),
    ),
  );
  if (finished.length === 0) return 100;
  const live = finished.filter(
    (deployment) => deployment.status.toLowerCase() === "live",
  ).length;
  return Math.round((live / finished.length) * 100);
}

function deploymentTrend(deployments: Deployment[]) {
  const now = new Date();
  return Array.from({ length: 7 }).map((_, index) => {
    const day = new Date(now);
    day.setDate(now.getDate() - (6 - index));
    const dayKey = day.toISOString().slice(0, 10);
    const items = deployments.filter(
      (deployment) => deployment.created_at.slice(0, 10) === dayKey,
    );
    return {
      label: day.toLocaleDateString("en-US", { weekday: "short" }),
      total: items.length,
      failed: items.filter((deployment) =>
        FAILED_STATUSES.has(deployment.status.toLowerCase()),
      ).length,
    };
  });
}

function getHealth(status?: string | null): HealthState {
  const raw = (status || "none").toLowerCase();
  if (raw === "live") return { kind: "healthy", label: "Healthy" };
  if (ACTIVE_STATUSES.has(raw)) return { kind: "active", label: "Active" };
  if (FAILED_STATUSES.has(raw)) return { kind: "failed", label: "Failed" };
  if (CANCELED_STATUSES.has(raw)) return { kind: "canceled", label: "Canceled" };
  return { kind: "idle", label: "Idle" };
}

function healthColors(kind: HealthKind) {
  const map = {
    healthy: { dot: "bg-[#2f9d63]", text: "text-[#3fba78]" },
    active: { dot: "bg-[#facc15] animate-pulse", text: "text-[#facc15]" },
    failed: { dot: "bg-[#b83a3a]", text: "text-[#d05252]" },
    canceled: { dot: "bg-zinc-500", text: "text-zinc-500" },
    idle: { dot: "bg-zinc-800", text: "text-zinc-700" },
  } satisfies Record<HealthKind, { dot: string; text: string }>;
  return map[kind];
}

function getServiceUrl(project: Project, deployment?: Deployment) {
  const candidate =
    deployment?.url || deployment?.subdomain || project.subdomain || null;
  return deploymentUrl(candidate);
}

function formatRepoSlug(url: string) {
  return url
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/\.git$/, "");
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (Number.isNaN(date.getTime())) return "—";
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dateValue(dateStr: string) {
  const value = new Date(dateStr).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function hashCode(value: string) {
  return value.split("").reduce((hash, char) => {
    return (hash * 31 + char.charCodeAt(0)) % 100000;
  }, 7);
}
