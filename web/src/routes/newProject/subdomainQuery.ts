import { queryOptions } from "@tanstack/react-query";
import { apiJson } from "@/lib/api";

/** What the server says about an address, in words for the page. */
export function addressReason(reason: string | undefined): string {
  if (reason === "subdomain already in use") return "That address is already taken.";
  if (reason === "subdomain is reserved") return "That address is reserved.";
  return "That address can't be used.";
}

/**
 * Whether an address is free. Addresses are unique across every account, so
 * only the server knows. Never kept: an address frees up when a project is
 * deleted, and this must not say "taken" from an old answer.
 */
export const subdomainQuery = (subdomain: string) =>
  queryOptions({
    queryKey: ["subdomain", subdomain],
    enabled: subdomain !== "",
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
    queryFn: () =>
      apiJson<{ available: boolean; reason?: string }>(`/api/subdomains/${encodeURIComponent(subdomain)}`),
  });
