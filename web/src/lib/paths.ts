import type { Deployment, Project } from "./types";

/**
 * The addresses of a project's and a deployment's pages, in one place.
 *
 * A project is named in its address by the name it was served under
 * (`/projects/portfolio`), which is fixed once the project exists, so a link
 * never goes stale. The rare project with none falls back to its id. A deployment
 * has a page of its own (`/deployments/430b592c`), named by the first eight
 * characters of its id: it knows its project, so the address need not say.
 */
export const projectRef = (project: Pick<Project, "id" | "subdomain">) => project.subdomain || project.id;

export const projectPath = (project: Pick<Project, "id" | "subdomain">) => `/projects/${encodeURIComponent(projectRef(project))}`;

export const settingsPath = (project: Pick<Project, "id" | "subdomain">) => `${projectPath(project)}/settings`;

/** A deployment's id as it is written in an address. The server also takes the whole id. */
export const deploymentRef = (id: string) => id.slice(0, 8);

export const deploymentPath = (deployment: Pick<Deployment, "id">) => `/deployments/${deploymentRef(deployment.id)}`;

/** The project an address names: by its name, or by its id (older links and projects without a name). */
export function findProject<T extends Pick<Project, "id" | "subdomain">>(projects: readonly T[], ref: string): T | undefined {
  const wanted = ref.trim().toLowerCase();
  if (!wanted) return undefined;
  return (
    projects.find((project) => (project.subdomain ?? "").toLowerCase() === wanted) ??
    projects.find((project) => project.id.toLowerCase() === wanted)
  );
}
