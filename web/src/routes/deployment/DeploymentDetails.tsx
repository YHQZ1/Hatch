import { Link } from "react-router";
import { cn } from "@/lib/cn";
import { deploymentPath } from "@/lib/paths";
import type { Deployment, Project } from "@/lib/types";
import { durationSeconds, formatDuration } from "../deployments/deployments";
import CopyUrlButton from "../overview/CopyUrlButton";
import { ArrowLeftIcon } from "../overview/Glyphs";
import { commitUrl, endedAt, hasCloudResources, shortArn, shortId } from "./deployment";

/**
 * The facts about one deployment that the summary above the log does not
 * already give: its id, when it started and ended, the commit on GitHub, what
 * its image is, and, on a cloud target, the resources it made. Beneath, links
 * to the deployments either side of it.
 */
export default function DeploymentDetails({
  deployment,
  project,
  newer,
  older,
}: {
  deployment: Deployment;
  project: Project;
  newer: Deployment | null;
  older: Deployment | null;
}) {
  const ended = endedAt(deployment);
  const seconds = durationSeconds(deployment);
  const commit = commitUrl(project.repo_url, deployment.commit_sha);
  const went = deployment.status.toLowerCase() === "live";

  return (
    <section aria-label="Details" className="min-w-0">
      <div className="mb-3 flex min-h-9 items-center">
        <h2 className="text-[1rem] font-semibold tracking-tight">Details</h2>
      </div>

      <dl className="divide-y divide-line rounded-hatch border border-line-strong text-sm">
        <Row label="Deployment">
          <span className="flex min-w-0 items-center gap-1">
            <span title={deployment.id} className="truncate font-mono text-xs">
              {shortId(deployment.id)}
            </span>
            <CopyUrlButton url={deployment.id} />
          </span>
        </Row>
        <Row label="Started">
          <time dateTime={deployment.created_at}>{stamp(deployment.created_at)}</time>
        </Row>
        <Row label={deployment.failed_at && !deployment.deployed_at ? "Failed" : "Finished"}>
          {ended ? <time dateTime={ended}>{stamp(ended)}</time> : <span className="text-muted">Not yet</span>}
        </Row>
        <Row label="Took">
          {seconds === null ? <span className="text-muted">—</span> : formatDuration(seconds)}
        </Row>
        {deployment.commit_sha && (
          <Row label="Commit">
            {commit ? (
              <a
                href={commit}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs transition-colors hover:underline"
              >
                {deployment.commit_sha.slice(0, 7)} on GitHub
              </a>
            ) : (
              <span className="font-mono text-xs">{deployment.commit_sha.slice(0, 7)}</span>
            )}
          </Row>
        )}
        {/* Only a release that went live ever had an image worth keeping. */}
        {went && (
          <Row label="Image">
            {deployment.image_uri ? (
              <span title={deployment.image_uri} className="truncate font-mono text-xs">
                {deployment.image_uri}
              </span>
            ) : (
              <span className="text-muted">Removed, so it cannot be rolled back to</span>
            )}
          </Row>
        )}
        {hasCloudResources(deployment) && (
          <>
            <Row label="Service">{deployment.ecs_service_name ?? "—"}</Row>
            <Row label="Target group">{shortArn(deployment.target_group_arn)}</Row>
            <Row label="Task">{shortArn(deployment.ecs_task_arn)}</Row>
          </>
        )}
      </dl>

      {(newer || older) && (
        <nav aria-label="Other deployments" className="mt-4 flex items-center justify-between gap-4 text-sm">
          {older ? (
            <Link
              to={deploymentPath(older)}
              className="inline-flex items-center gap-1.5 text-muted transition-colors hover:text-ink"
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" />
              Older
            </Link>
          ) : (
            <span />
          )}
          {newer && (
            <Link
              to={deploymentPath(newer)}
              className="inline-flex items-center gap-1.5 text-muted transition-colors hover:text-ink"
            >
              Newer
              <ArrowLeftIcon className={cn("h-3.5 w-3.5 rotate-180")} />
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="flex min-w-0 justify-end text-right">{children}</dd>
    </div>
  );
}

/** A moment as the reader's clock shows it, to the second: a deployment is a matter of seconds. */
function stamp(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
