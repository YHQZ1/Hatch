import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { abilities } from "../overview/overview";
import type { useProjectActions } from "../overview/useProjectActions";
import type { ServiceRow } from "../services/service";
import Section from "./Section";

const STATE: Record<string, string> = {
  suspended: "Suspended",
  suspending: "Suspending…",
  resuming: "Resuming…",
  suspend_failed: "Suspend failed",
  resume_failed: "Resume failed",
  deleting: "Being deleted",
  delete_failed: "Delete failed",
};

/** What the project is doing now, and the one thing to do about it: stop it, or start it again. */
export default function RuntimeSection({
  row,
  actions,
}: {
  row: ServiceRow;
  actions: ReturnType<typeof useProjectActions>;
}) {
  const { project, lastDeployment } = row;
  const can = abilities(project, lastDeployment);
  const busy = actions.busy.has(project.id);
  const status = project.status.toLowerCase();
  const failed = status.endsWith("_failed");
  const text =
    STATE[status] ??
    (row.status.kind === "live" ? "Running" : row.status.kind === "idle" ? "Not deployed yet" : row.status.label.charAt(0).toUpperCase() + row.status.label.slice(1));

  return (
    <Section
      id="runtime"
      title="Runtime"
      description="Stopping a project keeps its settings, deployments and variables. It just stops answering requests until you start it again."
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-muted">Status</p>
          <p className={cn("mt-1 text-sm font-medium", failed && "text-danger", ["suspended"].includes(status) && "text-muted")}>{text}</p>
          {failed && <p className="mt-1 text-xs text-faint">The last attempt did not finish. You can try again.</p>}
        </div>
        {can.resume ? (
          <Button onClick={() => void actions.resume(row)} disabled={busy}>
            {busy ? "Starting…" : "Resume"}
          </Button>
        ) : (
          <Button onClick={() => void actions.suspend(row)} disabled={!can.suspend || busy}>
            {busy ? "Stopping…" : "Suspend"}
          </Button>
        )}
      </div>
    </Section>
  );
}
