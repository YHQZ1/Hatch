import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiJson, websocketUrl } from "@/lib/api";
import { ACTIVE_DEPLOYMENT_STATUSES, projectDeploymentsQuery } from "@/lib/queries";
import type { Deployment } from "@/lib/types";
import { type LogLine, TERMINAL_STATUSES, parseLogLine, statusFromLogLine } from "./logs";

const EMPTY_LOGS: LogLine[] = [];

/**
 * The log of one deployment of a project. While it is in progress the lines
 * stream in and the stage they announce is shown at once; otherwise the saved
 * log is loaded once. Only the deployment viewed matters here, not its later
 * status changes, so its status is read from the query cache when this starts.
 */
export function useDeploymentLogs(projectId: string, deploymentId: string | null) {
  const queryClient = useQueryClient();
  const [logsById, setLogsById] = useState<Record<string, LogLine[]>>({});
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!deploymentId) return;
    const deploymentsKey = projectDeploymentsQuery(projectId).queryKey;
    const status = queryClient
      .getQueryData<Deployment[]>(deploymentsKey)
      ?.find((deployment) => deployment.id === deploymentId)
      ?.status.toLowerCase();

    if (ACTIVE_DEPLOYMENT_STATUSES.has(status ?? "")) {
      const ws = new WebSocket(websocketUrl(`/ws/deployments/${deploymentId}`));
      socket.current = ws;
      ws.onopen = () => {
        setLogsById((prev) => ({ ...prev, [deploymentId]: [] }));
        ws.send("READY");
      };
      ws.onmessage = (event) => {
        const line = String(event.data);
        if (line === "READY") return;
        setLogsById((prev) => ({
          ...prev,
          [deploymentId]: [...(prev[deploymentId] ?? []), parseLogLine(line)],
        }));

        const nextStatus = statusFromLogLine(line);
        if (!nextStatus) return;
        queryClient.setQueryData<Deployment[]>(deploymentsKey, (current) =>
          current?.map((deployment) =>
            deployment.id === deploymentId ? { ...deployment, status: nextStatus } : deployment,
          ),
        );
        if (TERMINAL_STATUSES.has(nextStatus)) {
          ws.close();
          void queryClient.invalidateQueries({ queryKey: deploymentsKey });
        }
      };
      return () => ws.close();
    }

    let cancelled = false;
    apiJson<string[] | null>(`/api/deployments/${deploymentId}/logs`)
      .then((history) => {
        if (cancelled || !Array.isArray(history)) return;
        setLogsById((prev) => ({ ...prev, [deploymentId]: history.map(parseLogLine) }));
      })
      .catch(() => {
        // The panel stays empty if the history cannot be loaded.
      });
    return () => {
      cancelled = true;
    };
  }, [deploymentId, projectId, queryClient]);

  /** Adds a line of our own to a deployment's log, such as "canceled by user". */
  const append = useCallback((id: string, text: string) => {
    setLogsById((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), parseLogLine(text)] }));
  }, []);

  /** Stops following the stream, for a deployment that has just been canceled. */
  const stop = useCallback(() => socket.current?.close(), []);

  return { logs: (deploymentId && logsById[deploymentId]) || EMPTY_LOGS, append, stop };
}
