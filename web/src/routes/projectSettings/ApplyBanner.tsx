import { Button } from "@/components/ui";

/**
 * Shown after saving something a deployment reads when it starts, so the next
 * step is one click away instead of a trip back to the project.
 */
export default function ApplyBanner({
  deploying,
  canDeploy,
  onDeploy,
  onDismiss,
}: {
  deploying: boolean;
  canDeploy: boolean;
  onDeploy: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-hatch border border-line-strong px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm">
        <span className="font-medium">Saved.</span>{" "}
        <span className="text-muted">The running project keeps its old settings until you deploy again.</span>
      </p>
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" onClick={onDismiss} disabled={deploying}>
          Dismiss
        </Button>
        <Button variant="primary" onClick={onDeploy} disabled={deploying || !canDeploy}>
          {deploying ? "Deploying…" : "Deploy now"}
        </Button>
      </div>
    </div>
  );
}
