import { Link, useNavigate } from "react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageLoadingState } from "@/components/LoadingState";
import {
  apiFetch,
  deploymentUrl,
  readApiError,
  redirectIfUnauthorized,
} from "@/lib/api";
import {
  AppShell,
  Button,
  PageTitle,
  StatusText,
} from "@/components/ui";

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
  timestamp?: string;
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
  source: "cloudwatch";
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
const CHART_LEFT = 54;
const CHART_RIGHT = 18;
const CHART_TOP = 18;
const CHART_BOTTOM = 244;
const CHART_WIDTH = 760 - CHART_LEFT - CHART_RIGHT;

export default function InsightsClient() {
  const navigate = useNavigate();
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
          redirectIfUnauthorized(projectsRes, navigate) ||
          redirectIfUnauthorized(activityRes, navigate)
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
            if (redirectIfUnauthorized(res, navigate) || !res.ok) {
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
            if (redirectIfUnauthorized(res, navigate) || !res.ok) {
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
    [navigate, selectedProjectId, timeRange],
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
      } catch {
        // A corrupt cache entry is ignored.
      }
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
        points: [],
        summary: summarizeTelemetryPoints([]),
        source: "cloudwatch",
        reason:
          realMetrics?.reason ||
          "No CloudWatch metrics are available for this service yet.",
      };
    }

    const aggregated = aggregateProjectMetrics(services, metricsByProject);
    if (aggregated) {
      return aggregated;
    }

    return {
      points: [],
      summary: summarizeTelemetryPoints([]),
      source: "cloudwatch",
      reason:
        services.length === 0
          ? "Create and deploy a service to start collecting runtime metrics."
          : "No CloudWatch metrics are available for the selected window.",
    };
  }, [metricsByProject, selectedService, services]);

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
    <AppShell>
      <InsightsHeader
        lastSyncedAt={lastSyncedAt}
        refreshing={refreshing}
        onRefresh={() => loadData({ background: true })}
      />

      {loading ? (
        <InsightsSkeleton />
      ) : (
        <div className="space-y-7">
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
    </AppShell>
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
    <PageTitle
      title="Insights"
      description="CloudWatch-backed runtime metrics for traffic, latency, errors, CPU, and memory."
      actions={
        <>
          <div className="mr-1 min-w-24 text-left sm:text-right">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-700 font-bold">
              {refreshing ? "Refreshing" : "Last synced"}
            </p>
            <p className="mt-1 text-[11px] text-zinc-600">
              {lastSyncedAt
                ? formatRelativeTime(lastSyncedAt.toISOString())
                : "—"}
            </p>
          </div>
          <Button onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "Syncing" : "Refresh"}
          </Button>
        </>
      }
    />
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
    <div className="overflow-x-auto border-b border-white/[0.08] pb-5">
      <div className="flex min-w-max items-center gap-2">
        <button
          onClick={() => onSelect("all")}
          className={`h-9 px-3.5 rounded-md text-[10px] uppercase tracking-[0.16em] font-semibold transition-all cursor-pointer ${
            selectedProjectId === "all"
              ? "bg-white text-black"
              : "text-zinc-500 hover:text-white hover:bg-white/[0.045]"
          }`}
        >
          All Services
        </button>
        {services.map((service) => (
          <button
            key={service.project.id}
            onClick={() => onSelect(service.project.id)}
            className={`h-9 px-3.5 rounded-md text-[10px] uppercase tracking-[0.16em] font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              selectedProjectId === service.project.id
                ? "bg-white text-black"
                : "text-zinc-500 hover:text-white hover:bg-white/[0.045]"
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
  const recentDeployments = [...deployments]
    .sort((a, b) => dateValue(b.created_at) - dateValue(a.created_at))
    .slice(0, 6);

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-b border-white/[0.08] pb-7 sm:flex sm:items-end sm:gap-12">
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
        title="Runtime"
        scope="All services"
        telemetry={telemetry}
        timeRange={timeRange}
        onTimeRangeChange={onTimeRangeChange}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-7">
        <Panel title="Deployment Outcomes" meta="Current history">
          <DeploymentOutcomes deployments={deployments} />
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

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-7">
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
  const relatedActivity = activity
    .filter((event) =>
      event.message.toLowerCase().includes(service.project.repo_name.toLowerCase()),
    )
    .slice(0, 6);

  return (
    <div className="space-y-7">
      <div className="border-b border-white/[0.08] pb-7">
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
                className="h-9 px-3.5 border border-white/[0.11] rounded-md text-[11px] uppercase tracking-[0.14em] font-semibold text-zinc-300 hover:text-white hover:border-white/25 hover:bg-white/[0.045] transition-all cursor-pointer flex items-center"
              >
                Open
              </a>
            )}
            <Link
              to={`/projects/${service.project.id}`}
              className="h-9 px-3.5 bg-white text-black rounded-md text-[11px] uppercase tracking-[0.14em] font-semibold hover:bg-zinc-200 transition-colors flex items-center cursor-pointer"
            >
              Details
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-b border-white/[0.08] pb-7 sm:flex sm:items-end sm:gap-12">
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
        title="Runtime"
        scope={service.project.repo_name}
        telemetry={telemetry}
        timeRange={timeRange}
        onTimeRangeChange={onTimeRangeChange}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-7">
        <Panel title="Deployment Outcomes" meta="This service">
          <DeploymentOutcomes deployments={deployments} />
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

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-7">
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
  const hasMetrics = telemetry.points.length > 0;
  const timeZone = getBrowserTimeZone();

  return (
    <section className="border-y border-white/[0.08]">
      <div className="py-4 border-b border-white/[0.08] flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">
              {title}
            </h3>
            <StatusText tone={hasMetrics ? "success" : "muted"}>
              CloudWatch
            </StatusText>
          </div>
          <p className="text-[11px] text-zinc-700 mt-1">
            {scope} ·{" "}
            {hasMetrics
              ? `live CloudWatch metrics, shown in ${timeZone}.`
              : telemetry.reason}
          </p>
        </div>
        <RangeControl value={timeRange} onChange={onTimeRangeChange} />
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-b border-white/[0.08] py-5 sm:grid-cols-3 xl:grid-cols-5">
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

      <div className="grid grid-cols-1 gap-7 py-7 2xl:grid-cols-2">
        <LineChart
          title="Traffic"
          meta="Requests"
          data={telemetry.points}
          metric="requests"
          color="#6ea8fe"
          formatter={formatCompactNumber}
          timeRange={timeRange}
          emptyReason={telemetry.reason}
        />
        <LineChart
          title="Latency"
          meta="P95 response time"
          data={telemetry.points}
          metric="latency"
          color="#9ca3af"
          formatter={(value) => `${Math.round(value)}ms`}
          timeRange={timeRange}
          emptyReason={telemetry.reason}
        />
        <LineChart
          title="Errors"
          meta="Error rate"
          data={telemetry.points}
          metric="errors"
          color="#d05252"
          formatter={(value) => `${value.toFixed(2)}%`}
          timeRange={timeRange}
          emptyReason={telemetry.reason}
        />
        <ResourceChart
          data={telemetry.points}
          timeRange={timeRange}
          emptyReason={telemetry.reason}
        />
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
    <div className="inline-flex items-center gap-1 rounded-md border border-white/[0.11] bg-transparent p-1 w-fit">
      {TIME_RANGES.map((range) => (
        <button
          key={range.value}
          onClick={() => onChange(range.value)}
          className={`h-7 px-3 rounded text-[9px] uppercase tracking-[0.18em] font-semibold transition-all cursor-pointer ${
            value === range.value
              ? "bg-white text-black"
              : "text-zinc-600 hover:text-white hover:bg-white/[0.045]"
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
  timeRange,
  emptyReason,
}: {
  title: string;
  meta: string;
  data: TelemetryPoint[];
  metric: keyof Pick<TelemetryPoint, "requests" | "errors" | "latency" | "cpu" | "memory">;
  color: string;
  formatter: (value: number) => string;
  timeRange: TimeRange;
  emptyReason?: string;
}) {
  const values = data.map((point) => Number(point[metric]));
  const hasData = values.length > 0;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const latest = values[values.length - 1] || 0;
  const previous = values[values.length - 2] || latest;
  const delta = latest - previous;
  const yTicks = chartTicks(min, max, formatter);
  const xTicks = axisTickIndexes(data.length);
  const { linePath, areaPath } = chartPaths(values, yTicks.min, yTicks.max);

  return (
    <div className="min-w-0 border-t border-white/[0.08] pt-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">
            {title}
          </p>
          <p className="text-[10px] text-zinc-700 mt-1">{meta}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-xl text-white tracking-tight">
            {hasData ? formatter(latest) : "—"}
          </p>
          <p
            className={`font-mono text-[10px] mt-1 ${
              delta > 0 ? "text-[#3fba78]" : delta < 0 ? "text-[#d05252]" : "text-zinc-700"
            }`}
          >
            {hasData
              ? delta === 0
                ? "flat"
                : `${delta > 0 ? "+" : ""}${formatter(delta)}`
              : "no data"}
          </p>
        </div>
      </div>

      {!hasData ? (
        <EmptyChart reason={emptyReason} />
      ) : (
        <svg viewBox="0 0 760 280" className="w-full h-64 overflow-visible">
          <defs>
            <linearGradient
              id={`fill-${metric}-${title}`}
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop offset="0%" stopColor={color} stopOpacity="0.14" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <ChartGrid
            xTicks={xTicks}
            xTotal={data.length}
            yTicks={yTicks.values}
            yMin={yTicks.min}
            yMax={yTicks.max}
          />
          <path d={areaPath} fill={`url(#fill-${metric}-${title})`} />
          <path d={linePath} fill="none" stroke={color} strokeWidth="1.45" />
          {yTicks.values.map((tick) => {
            const y = chartY(tick, yTicks.min, yTicks.max);
            return (
              <text
                key={`y-${tick}`}
                x="42"
                y={y + 4}
                textAnchor="end"
                fill="#3f3f46"
                fontSize="10"
                fontFamily="monospace"
              >
                {yTicks.format(tick)}
              </text>
            );
          })}
          {xTicks.map((index) => {
            const point = data[index];
            const x = chartX(index, data.length);
            return (
              <text
                key={`${point.label}-${index}`}
                x={x}
                y="262"
                textAnchor={
                  index === 0
                    ? "start"
                    : index === data.length - 1
                      ? "end"
                      : "middle"
                }
                fill="#3f3f46"
                fontSize="10"
                fontFamily="monospace"
              >
                {formatPointTime(point, timeRange)}
              </text>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function ResourceChart({
  data,
  timeRange,
  emptyReason,
}: {
  data: TelemetryPoint[];
  timeRange: TimeRange;
  emptyReason?: string;
}) {
  const xTicks = axisTickIndexes(data.length);
  return (
    <div className="min-w-0 border-t border-white/[0.08] pt-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">
            Resources
          </p>
          <p className="text-[10px] text-zinc-700 mt-1">CPU and memory pressure</p>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px]">
          <span className="text-[#6ea8fe]">CPU</span>
          <span className="text-zinc-500">MEM</span>
        </div>
      </div>
      {data.length === 0 ? (
        <EmptyChart reason={emptyReason} />
      ) : (
        <svg viewBox="0 0 760 280" className="w-full h-64 overflow-visible">
          <ChartGrid
            xTicks={xTicks}
            xTotal={data.length}
            yTicks={[0, 25, 50, 75, 100]}
            yMin={0}
            yMax={100}
          />
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = chartY(tick, 0, 100);
            return (
              <text
                key={`resource-y-${tick}`}
                x="42"
                y={y + 4}
                textAnchor="end"
                fill="#3f3f46"
                fontSize="10"
                fontFamily="monospace"
              >
                {tick}%
              </text>
            );
          })}
          <path
            d={chartPaths(data.map((point) => point.memory), 0, 100).linePath}
            fill="none"
            stroke="#71717a"
            strokeWidth="1.45"
          />
          <path
            d={chartPaths(data.map((point) => point.cpu), 0, 100).linePath}
            fill="none"
            stroke="#6ea8fe"
            strokeWidth="1.45"
          />
          {xTicks.map((index) => {
            const point = data[index];
            const x = chartX(index, data.length);
            return (
              <text
                key={`${point.label}-${index}`}
                x={x}
                y="262"
                textAnchor={
                  index === 0
                    ? "start"
                    : index === data.length - 1
                      ? "end"
                      : "middle"
                }
                fill="#3f3f46"
                fontSize="10"
                fontFamily="monospace"
              >
                {formatPointTime(point, timeRange)}
              </text>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function EmptyChart({ reason }: { reason?: string }) {
  return (
    <div className="relative flex h-64 items-center justify-center overflow-hidden">
      <div className="absolute inset-0">
        {Array.from({ length: 7 }).map((_, item) => (
          <div
            key={item}
            className="absolute left-0 right-0 border-t border-white/[0.055]"
            style={{ top: `${10 + item * 13}%` }}
          />
        ))}
        {Array.from({ length: 9 }).map((_, item) => (
          <div
            key={`v-${item}`}
            className="absolute bottom-8 top-4 border-l border-white/[0.035]"
            style={{ left: `${8 + item * 11}%` }}
          />
        ))}
      </div>
      <p className="relative max-w-xs text-center text-[11px] leading-5 text-zinc-700">
        {reason || "No metrics in this time range."}
      </p>
    </div>
  );
}

function ChartGrid({
  xTicks,
  xTotal,
  yTicks,
  yMin,
  yMax,
}: {
  xTicks: number[];
  xTotal: number;
  yTicks: number[];
  yMin: number;
  yMax: number;
}) {
  return (
    <>
      {yTicks.map((tick) => (
        <line
          key={`horizontal-${tick}`}
          x1={CHART_LEFT}
          x2={760 - CHART_RIGHT}
          y1={chartY(tick, yMin, yMax)}
          y2={chartY(tick, yMin, yMax)}
          stroke="#1d1d1f"
          strokeWidth="0.8"
        />
      ))}
      {xTicks.map((index) => (
        <line
          key={`vertical-${index}`}
          x1={chartX(index, xTotal)}
          x2={chartX(index, xTotal)}
          y1={CHART_TOP}
          y2={CHART_BOTTOM}
          stroke="#151517"
          strokeWidth="0.65"
        />
      ))}
      <line
        x1={CHART_LEFT}
        x2={760 - CHART_RIGHT}
        y1={CHART_BOTTOM}
        y2={CHART_BOTTOM}
        stroke="#2a2a2d"
        strokeWidth="0.8"
      />
    </>
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
      ? "text-[#5cc98f]"
      : accent === "red"
        ? "text-[#d86666]"
        : accent === "amber"
          ? "text-[#d8ad4f]"
          : "text-white";

  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600">
        {label}
      </p>
      <p
        className={`text-xl font-medium tracking-tight truncate ${color} ${
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
    <section className="border-y border-white/[0.08]">
      <div className="py-4 border-b border-white/[0.08] flex items-center justify-between gap-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">
          {title}
        </h3>
        {meta && (
          <span className="text-[9px] uppercase tracking-[0.18em] text-zinc-700 font-mono">
            {meta}
          </span>
        )}
      </div>
      <div className="py-5">{children}</div>
    </section>
  );
}

function DeploymentOutcomes({ deployments }: { deployments: Deployment[] }) {
  const outcomes = deploymentOutcomes(deployments);
  const latest = [...deployments].sort(
    (a, b) => dateValue(b.created_at) - dateValue(a.created_at),
  )[0];

  if (deployments.length === 0) {
    return <EmptyInline text="No deployments yet" />;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
        <MetricCard label="Live" value={String(outcomes.live)} accent="green" />
        <MetricCard
          label="Active"
          value={String(outcomes.active)}
          accent={outcomes.active > 0 ? "amber" : undefined}
        />
        <MetricCard
          label="Failed"
          value={String(outcomes.failed)}
          accent={outcomes.failed > 0 ? "red" : undefined}
        />
        <MetricCard label="Canceled" value={String(outcomes.canceled)} />
      </div>
      <div className="border-t border-white/[0.055] pt-4">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-700">
          Latest deployment
        </p>
        {latest ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-300">
                {latest.commit_message ||
                  latest.commit_sha?.slice(0, 7) ||
                  latest.id.slice(0, 8)}
              </p>
              <p className="mt-1 font-mono text-[10px] text-zinc-700">
                {formatRelativeTime(latest.created_at)} · {latest.branch}
              </p>
            </div>
            <HealthText health={getHealth(latest.status)} />
          </div>
        ) : (
          <p className="text-sm text-zinc-700">No deployment history.</p>
        )}
      </div>
    </div>
  );
}

function ServiceHealthRow({ service }: { service: ServiceInsight }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.055] py-3 last:border-b-0">
      <div className="min-w-0">
        <Link
          to={`/projects/${service.project.id}`}
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
            className="border-b border-white/[0.055] py-3 last:border-b-0"
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
          className="border-b border-white/[0.055] py-3 last:border-b-0"
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
    <div className="min-w-0 border-b border-white/[0.055] py-3">
      <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-700 font-bold mb-1.5">
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
        timestamp: typeof point.timestamp === "string" ? point.timestamp : undefined,
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

function chartPaths(values: number[], min: number, max: number) {
  const safeMax = max === min ? max + 1 : max;
  const coordinates = values.map((value, index) => {
    return `${chartX(index, values.length).toFixed(2)},${chartY(value, min, safeMax).toFixed(2)}`;
  });
  const linePath = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"}${point}`)
    .join(" ");
  const areaPath = `${linePath} L${CHART_LEFT + CHART_WIDTH},${CHART_BOTTOM} L${CHART_LEFT},${CHART_BOTTOM} Z`;

  return { linePath, areaPath };
}

function chartX(index: number, total: number) {
  return CHART_LEFT + (index / Math.max(total - 1, 1)) * CHART_WIDTH;
}

function chartY(value: number, min: number, max: number) {
  const safeMax = max === min ? max + 1 : max;
  const ratio = (value - min) / Math.max(safeMax - min, 1);
  return CHART_BOTTOM - ratio * (CHART_BOTTOM - CHART_TOP);
}

function chartTicks(
  min: number,
  max: number,
  formatter: (value: number) => string,
) {
  const safeMin = Math.min(0, min);
  const safeMax = max <= safeMin ? safeMin + 1 : max;
  const step = (safeMax - safeMin) / 4;
  const values = Array.from({ length: 5 }).map((_, index) =>
    Number((safeMin + step * index).toFixed(2)),
  );

  return {
    min: safeMin,
    max: safeMax,
    values,
    format: formatter,
  };
}

function axisTickIndexes(total: number) {
  if (total <= 0) return [];
  if (total <= 6) return Array.from({ length: total }).map((_, index) => index);

  const desired = total > 24 ? 7 : 6;
  const indexes = new Set<number>();
  const step = (total - 1) / Math.max(desired - 1, 1);
  for (let index = 0; index < desired; index += 1) {
    indexes.add(Math.round(index * step));
  }
  indexes.add(0);
  indexes.add(total - 1);
  return Array.from(indexes).sort((a, b) => a - b);
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

function deploymentOutcomes(deployments: Deployment[]) {
  return deployments.reduce(
    (acc, deployment) => {
      const status = deployment.status.toLowerCase();
      if (status === "live") acc.live += 1;
      else if (ACTIVE_STATUSES.has(status)) acc.active += 1;
      else if (FAILED_STATUSES.has(status)) acc.failed += 1;
      else if (CANCELED_STATUSES.has(status)) acc.canceled += 1;
      return acc;
    },
    { live: 0, active: 0, failed: 0, canceled: 0 },
  );
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

function formatPointTime(point: TelemetryPoint, range: TimeRange) {
  if (!point.timestamp) return point.label || "—";
  const date = new Date(point.timestamp);
  if (Number.isNaN(date.getTime())) return point.label || "—";

  if (range === "24h") {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
