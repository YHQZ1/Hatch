import { queryOptions } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { dockerfilePathIn } from "./newProject";

const NO_PORTS: number[] = [];

/**
 * Whether the repository has a Dockerfile in the folder, and the ports it
 * exposes. Any answer other than 200 means no Dockerfile.
 */
export const dockerfileQuery = (repoFullName: string | undefined, folder: string) =>
  queryOptions({
    queryKey: ["github", "dockerfile", repoFullName, folder],
    enabled: Boolean(repoFullName),
    retry: false,
    queryFn: async () => {
      const response = await apiFetch(
        `/api/github/repos/${repoFullName}/dockerfile?path=${encodeURIComponent(dockerfilePathIn(folder))}`,
      );
      if (response.status === 401) throw new ApiError("Unauthorized", 401);
      if (response.status !== 200) return { found: false, ports: NO_PORTS };

      const data = await response.json();
      const ports: number[] = Array.isArray(data.ports)
        ? data.ports.filter((value: unknown) => typeof value === "number" && Number.isInteger(value))
        : NO_PORTS;
      return { found: true, ports };
    },
  });
