import { useQuery } from "@tanstack/react-query";
import { NO_PROJECTS, projectsQuery } from "@/lib/queries";
import { findProject } from "./paths";

/**
 * The project an address names (see `paths.ts`), found in the list of the user's
 * projects, which most pages already have. `resolving` is true until the list
 * can say: while it loads, and while it is fetched again and may not hold the
 * project yet (just after one is created, say).
 */
export function useProjectByRef(ref: string) {
  // Always asked again when a page opens: a project made a moment ago, in another
  // tab, is in the server's list but not yet in a cached one. A project that is
  // already cached shows at once; only a miss waits for the answer.
  const list = useQuery({ ...projectsQuery(), refetchOnMount: "always" });
  const project = findProject(list.data ?? NO_PROJECTS, ref) ?? null;
  return { project, resolving: list.isPending || (project === null && list.isFetching) };
}
