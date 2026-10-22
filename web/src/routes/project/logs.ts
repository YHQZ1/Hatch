export interface LogLine {
  text: string;
  type: "success" | "error" | "system" | "muted";
}

/** What a line of a build or deploy log is, so it can be coloured. */
export function parseLogLine(line: string): LogLine {
  const lower = line.toLowerCase();
  const isSuccess =
    line.includes("✓") ||
    line.includes("successfully") ||
    lower.includes("deployment live at") ||
    lower.includes("target healthy");
  const isError = line.includes("✗") || lower.includes("error") || lower.includes("failed");
  const isSystem = line.startsWith("[") || line.includes("STEP");
  return {
    text: line,
    type: isSuccess ? "success" : isError ? "error" : isSystem ? "system" : "muted",
  };
}

/**
 * The stage a log line announces, so the page can show it before the API
 * has caught up; the API stays the source of truth.
 */
export function statusFromLogLine(line: string): string | null {
  const lower = line.toLowerCase();

  if (
    lower.includes("deployment live at") ||
    lower.includes("target healthy") ||
    lower.includes("build complete")
  ) {
    return "live";
  }
  if (lower.includes("deployment canceled")) return "canceled";
  if (lower.includes("deployment failed") || lower.includes("error:")) return "failed";

  if (
    lower.includes("handoff to deployer") ||
    lower.includes("triggering deployment orchestration") ||
    lower.includes("registering task definition") ||
    lower.includes("configuring target group") ||
    lower.includes("updating routing rules") ||
    lower.includes("provisioning fargate") ||
    lower.includes("monitoring service stability") ||
    lower.includes("task health")
  ) {
    return "deploying";
  }

  if (
    lower.includes("syncing source") ||
    lower.includes("starting docker build") ||
    lower.includes("authenticating with amazon ecr") ||
    lower.includes("pushing image") ||
    lower.includes("image successfully pushed")
  ) {
    return "building";
  }

  return null;
}

/** Statuses after which a deployment's log no longer grows. */
export const TERMINAL_STATUSES = new Set(["live", "failed", "canceled"]);
