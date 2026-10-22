import type { Project } from "@/lib/types";
import type { SaveProject } from "./useSaveProject";

/** What every section that edits the project is given. */
export interface SectionProps {
  project: Project;
  save: SaveProject;
  saving: boolean;
  /** Called when a saved change will only reach the project with its next deployment. */
  onAppliesNextDeploy: () => void;
}
