import { Button } from "@/components/ui";
import type { Project } from "@/lib/types";
import Section from "./Section";

/** Deleting the project, kept apart at the bottom. The button opens the same confirmation as the Overview. */
export default function DeleteSection({ project, onDelete }: { project: Project; onDelete: () => void }) {
  const status = project.status.toLowerCase();
  const deleting = status === "deleting";
  const retry = status === "delete_failed";

  return (
    <Section
      id="delete"
      title="Delete project"
      description="Stops the project, removes what Hatch created for it, and deletes it. Its address stops serving. This cannot be undone."
    >
      <div className="flex items-center justify-between gap-4 rounded-hatch border border-danger/30 p-4">
        <div className="min-w-0 text-sm">
          {retry ? (
            <>
              <p className="font-medium text-danger">The last cleanup failed.</p>
              {project.delete_error && <p className="mt-1 text-xs leading-relaxed text-muted">{project.delete_error}</p>}
            </>
          ) : deleting ? (
            <p className="text-muted">This project is being deleted.</p>
          ) : (
            <p className="text-muted">You will be asked to type the project&apos;s name.</p>
          )}
        </div>
        <Button variant="danger" onClick={onDelete} disabled={deleting} className="shrink-0">
          {retry ? "Retry cleanup" : deleting ? "Deleting…" : "Delete project…"}
        </Button>
      </div>
    </Section>
  );
}
