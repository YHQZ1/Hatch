import { useState } from "react";
import { Modal } from "@/components/ui";
import type { Project } from "@/lib/types";

/** Asks the user to type the project's name before it is deleted. */
export default function DeleteServiceModal({
  project,
  open,
  deleting,
  onClose,
  onConfirm,
}: {
  project: Project;
  open: boolean;
  deleting: boolean;
  onClose: () => void;
  onConfirm: (e: React.MouseEvent) => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const canDelete = confirmation === project.repo_name;

  const handleClose = () => {
    setConfirmation("");
    onClose();
  };

  const handleConfirm = (event: React.MouseEvent) => {
    setConfirmation("");
    onConfirm(event);
  };

  return (
    <Modal
      open={open}
      title={`Delete ${project.repo_name}?`}
      description="Hatch will stop this project, remove what it created, and then delete it."
      onClose={deleting ? () => {} : handleClose}
    >
      <div className="border-y border-line py-3">
        <p className="truncate font-mono text-xs text-muted">{project.repo_url}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Its address stops serving, and its deployments and variables are removed.
          This cannot be undone.
        </p>
      </div>
      <label className="mt-4 block">
        <span className="block text-sm leading-6 text-muted">
          Type <span className="font-mono text-ink">{project.repo_name}</span> to
          confirm.
        </span>
        <input
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={deleting}
          autoFocus
          className="mt-2 h-10 w-full rounded-hatch border border-line-strong bg-transparent px-3 font-mono text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
          placeholder={project.repo_name}
        />
      </label>
      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleClose}
          disabled={deleting}
          className="h-9 px-3 text-sm text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={deleting || !canDelete}
          className="h-9 rounded-hatch border border-danger/40 bg-danger/10 px-4 text-sm font-medium text-danger transition-colors hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {deleting ? "Deleting" : "Delete project"}
        </button>
      </div>
    </Modal>
  );
}
