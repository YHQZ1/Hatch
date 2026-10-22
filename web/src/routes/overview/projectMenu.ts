import { deploymentPath, projectPath, settingsPath } from "@/lib/paths";
import type { ServiceRow } from "../services/service";
import type { MenuItem } from "./ActionsMenu";
import { abilities } from "./overview";
import type { useProjectActions } from "./useProjectActions";

type Actions = ReturnType<typeof useProjectActions>;

/** The "..." menu of a project: what it can be asked to do in its current state. */
export function projectMenuItems(
  row: ServiceRow,
  actions: Actions,
  /** When given, the menu ends with a way to delete the project. */
  onDelete?: (row: ServiceRow) => void,
): MenuItem[] {
  const { project, lastDeployment, liveUrl, status } = row;
  const can = abilities(project, lastDeployment);
  const logs = lastDeployment ? deploymentPath(lastDeployment) : projectPath(project);

  const items: MenuItem[] = [
    // Things you do to the running project.
    { label: "Visit", href: liveUrl ?? undefined, disabled: !liveUrl || status.kind === "suspended", group: 0 },
    { label: "Copy URL", onSelect: () => void actions.copyUrl(row), disabled: !liveUrl || status.kind === "suspended", group: 0 },
    { label: "Redeploy", onSelect: () => void actions.redeploy(row), disabled: !can.redeploy, group: 0 },
    can.resume
      ? { label: "Resume", onSelect: () => void actions.resume(row), group: 0 }
      : { label: "Suspend", onSelect: () => void actions.suspend(row), disabled: !can.suspend, group: 0 },
    // Places to go.
    { label: "View logs", href: logs, group: 1 },
    { label: "Project settings", href: settingsPath(project), group: 1 },
  ];
  if (onDelete) {
    items.push({
      label: project.status === "delete_failed" ? "Retry cleanup" : "Delete project…",
      onSelect: () => onDelete(row),
      disabled: project.status === "deleting",
      danger: true,
      // Alone at the bottom, away from the rest.
      group: 2,
    });
  }
  return items;
}
