import { useQuery } from "@tanstack/react-query";
import { connectionsQuery } from "./queries";

/**
 * Whether the user has connected an AWS account: the parts of the UI that depend
 * on it (the top bar's chip, the Overview's AWS panel) read it from here. While
 * the connections are still loading it says so, so nothing claims "not
 * connected" before it knows.
 */
export function useAwsConnection(): { connected: boolean; loading: boolean } {
  const result = useQuery(connectionsQuery());
  return {
    connected: result.data?.some((connection) => connection.status === "connected") ?? false,
    loading: result.isPending,
  };
}
