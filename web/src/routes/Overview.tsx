import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AppShell, Button, PageTitle } from "@/components/ui";
import { cn } from "@/lib/cn";
import { githubReposQuery } from "@/lib/queries";
import { formatRelativeTime } from "./services/service";
import { useServiceRows } from "./services/useServiceRows";
import AwsPlaceholders from "./overview/PlaceholderCards";
import RecentActivity from "./overview/RecentActivity";
import ServiceCard from "./overview/ServiceCard";
import SetupChecklist, {
  SetupChecklistSkeleton,
  type SetupStep,
} from "./overview/SetupChecklist";
import StatStrip from "./services/StatStrip";

/** How many service cards the Overview shows before pointing at the full list. */
const SHOWN_SERVICES = 6;

/**
 * Set once the checklist has been seen complete. It lets a reload with nothing
 * cached skip the checklist placeholder, so a finished account does not see a
 * box appear and vanish.
 */
const SETUP_DONE_KEY = "hatch_setup_done";

function readSetupDone(): boolean {
  try {
    return localStorage.getItem(SETUP_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSetupDone(done: boolean) {
  try {
    if (done) localStorage.setItem(SETUP_DONE_KEY, "1");
    else localStorage.removeItem(SETUP_DONE_KEY);
  } catch {
    // The hint is only an optimisation.
  }
}

/** Home: what is running, what needs attention, and what happened lately. */
export default function OverviewPage() {
  const { rows, stats, loading, expectServices } = useServiceRows();
  const repos = useQuery(githubReposQuery());

  const steps: SetupStep[] = [
    {
      id: "signin",
      title: "Sign in with GitHub",
      detail: "",
      done: true,
      action: { label: "", href: "/overview" },
    },
    {
      id: "app",
      title: "Install the Hatch App",
      detail: "Choose which repositories Hatch can read. It never gets write access.",
      done: repos.data?.installed === true,
      action: { label: "Install on GitHub", href: "/auth/install", external: true },
    },
    {
      id: "deploy",
      title: "Deploy your first service",
      detail: "Pick a repository with a Dockerfile and Hatch builds and runs it.",
      done: rows.length > 0,
      action: { label: "New service", href: "/new" },
    },
  ];
  // Both answers are needed to know whether setup is finished. Until then the
  // checklist's space is held (unless it was finished last time), so nothing
  // jumps when the answer arrives.
  const setupKnown = !loading && !repos.isPending;
  const setupFinished = steps.every((step) => step.done);
  const [wasFinished] = useState(readSetupDone);
  const showSetup = setupKnown && !setupFinished;
  const showSetupSkeleton = !setupKnown && !wasFinished;

  useEffect(() => {
    if (setupKnown) writeSetupDone(setupFinished);
  }, [setupKnown, setupFinished]);

  const needsAttention = rows.filter((row) => row.status.kind === "failed");
  const shown = rows.slice(0, SHOWN_SERVICES);

  return (
    <AppShell>
      <PageTitle
        title="Overview"
        description="What is running, what needs attention, and what happened lately."
        className="mb-8"
      />

      <StatStrip
        stats={stats}
        loading={loading}
        expectServices={expectServices}
        failedLabel="Needs attention"
      />

      <AwsPlaceholders />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* First in the markup so the checklist leads on a phone; it sits to the right on a wide screen. */}
        <aside
          className={cn(
            "flex flex-col gap-6 xl:order-last",
            !showSetup && !showSetupSkeleton && "hidden xl:flex",
          )}
        >
          {showSetup && <SetupChecklist steps={steps} />}
          {showSetupSkeleton && <SetupChecklistSkeleton />}
          <div className="hidden xl:block">
            <RecentActivity />
          </div>
        </aside>

        <div className="min-w-0 space-y-10">
          {needsAttention.length > 0 && (
            <section>
              <SectionHeading title="Needs attention" />
              <ul className="rounded-hatch border border-danger/40 bg-danger/5">
                {needsAttention.map((row) => (
                  <li key={row.project.id} className="border-b border-danger/20 last:border-b-0">
                    <Link
                      to={`/projects/${row.project.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-danger/5"
                    >
                      <span className="min-w-0 truncate text-sm">
                        <span className="font-medium">{row.project.repo_name}</span>
                        <span className="text-muted"> · {row.status.label}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
                        {formatRelativeTime(row.updatedAtRaw)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <SectionHeading
              title="Services"
              link={
                rows.length > 0
                  ? {
                      label: rows.length > SHOWN_SERVICES ? `View all ${rows.length}` : "Manage",
                      href: "/services",
                    }
                  : undefined
              }
            />
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-44 animate-pulse rounded-hatch border border-line bg-panel" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-start gap-4 rounded-hatch border border-dashed border-line-strong px-6 py-12">
                <p className="text-xl font-semibold tracking-tight">No services yet</p>
                <p className="max-w-md leading-relaxed text-muted">
                  Pick a GitHub repository that has a Dockerfile. Hatch creates the service, queues
                  the first deploy and gives it a URL.
                </p>
                <Button href="/new" variant="primary" className="h-10">
                  Deploy your first service
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {shown.map((row) => (
                  <ServiceCard key={row.project.id} row={row} />
                ))}
              </div>
            )}
          </section>

          <div className="xl:hidden">
            <RecentActivity />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SectionHeading({
  title,
  link,
}: {
  title: string;
  link?: { label: string; href: string };
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {link && (
        <Link to={link.href} className="text-sm text-muted transition-colors hover:text-ink">
          {link.label}
        </Link>
      )}
    </div>
  );
}
