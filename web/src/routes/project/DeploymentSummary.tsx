import { Button } from "@/components/ui";
import { deploymentUrl } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Deployment, Project } from "@/lib/types";
import StatusLine from "../deployments/StatusLine";
import { type StateInfo, durationSeconds } from "../deployments/deployments";
import { BranchIcon, CommitIcon } from "../overview/Glyphs";
import { formatCommit, formatRelativeTime } from "../services/service";

/**
 * The deployment being looked at, in one block: how it stands, its commit and
 * branch and age, what it ran with, and, when it failed, what went wrong.
 * Only the status is coloured. Visit and Cancel sit at its right.
 */
export default function DeploymentSummary({
  deployment,
  info,
  project,
  canceling,
  onCancel,
}: {
  deployment: Deployment;
  info: StateInfo;
  project: Project;
  canceling: boolean;
  onCancel: () => void;
}) {
  const commit = formatCommit(deployment);
  const startedAt = new Date(deployment.created_at);
  const address = info.state === "current" ? deploymentUrl(deployment.url) : null;
  const failure =
    info.state === "failed"
      ? [deployment.error_stage?.replaceAll("_", " "), deployment.error_message].filter(Boolean)
      : [];

  return (
    <section className="rounded-hatch border border-line-strong">
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
        <dl className="grid min-w-0 flex-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-[11rem_minmax(0,1fr)_8rem_6rem]">
          <Item label="Status">
            <span className="flex items-center gap-3">
              <StatusLine info={info} startedAt={startedAt} seconds={durationSeconds(deployment)} />
              {info.badge && (
                <span className={cn("text-[13px]", info.badge === "Current" ? "font-medium text-success" : "text-faint")}>
                  {info.badge}
                </span>
              )}
            </span>
          </Item>
          <Item label="Commit">
            <span className="flex min-w-0 items-center gap-2" title={commit.message ?? undefined}>
              <CommitIcon className="h-4 w-4 shrink-0 text-muted" />
              <span className="shrink-0 font-mono text-xs text-muted">{commit.short}</span>
              <span className="truncate">{commit.message ?? "No commit message"}</span>
            </span>
          </Item>
          <Item label="Branch">
            <span className="flex min-w-0 items-center gap-1.5">
              <BranchIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
              <span className="truncate">{deployment.branch}</span>
            </span>
          </Item>
          <Item label="Created">
            <span title={startedAt.toLocaleString()}>{formatRelativeTime(deployment.created_at)}</span>
          </Item>
        </dl>

        {(address || info.state === "building") && (
          <div className="flex shrink-0 gap-2">
            {address && (
              <Button href={address} variant="secondary">
                Visit
              </Button>
            )}
            {info.state === "building" && (
              <Button variant="danger" onClick={onCancel} disabled={canceling}>
                {canceling ? "Canceling…" : "Cancel"}
              </Button>
            )}
          </div>
        )}
      </div>

      {failure.length > 0 && (
        <div className="border-t border-line px-5 py-3 text-sm text-muted">
          {/* The clamp sits on its own element: with padding on it, the next line would show through. */}
          <p className="line-clamp-3" title={failure.join(": ")}>
            <span className="font-medium text-ink">Failed{deployment.error_stage ? ` during ${failure[0]}` : ""}.</span>{" "}
            {deployment.error_stage ? failure.slice(1).join(": ") : failure.join(": ")}
          </p>
        </div>
      )}

      <p className="flex flex-wrap gap-x-6 gap-y-1 border-t border-line px-5 py-3 text-xs text-muted">
        <span>
          Port <span className="text-ink">{deployment.port}</span>
        </span>
        <span>
          Dockerfile <span className="font-mono text-ink">{project.dockerfile_path || "Dockerfile"}</span>
        </span>
        <span>
          Health check <span className="font-mono text-ink">{deployment.health_check || "/"}</span>
        </span>
      </p>
    </section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 min-w-0 text-[13px]">{children}</dd>
    </div>
  );
}
