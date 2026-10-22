import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { projectDeploymentsQuery } from "@/lib/queries";
import type { Deployment } from "@/lib/types";
import { type LogLine, appendLines, parseLogLine } from "./logs";

const EMPTY_LOGS: LogLine[] = [];

/**
 * The log of one deployment, read from the server's event stream (ADR 0012).
 * The stream replays the log from the start, then follows it; the browser
 * reconnects by itself and carries on from the last line it had, so lines are
 * only ever added. The server also says when the deployment's status changes
 * and when it is finished, so the status shown never depends on what the log
 * text happens to say.
 */
export function useDeploymentLogs(projectId: string, deploymentId: string | null): LogLine[] {
  const queryClient = useQueryClient();
  const [logsById, setLogsById] = useState<Record<string, LogLine[]>>({});

  useEffect(() => {
    if (!deploymentId) return;
    const deploymentsKey = projectDeploymentsQuery(projectId).queryKey;
    const source = new EventSource(`/api/deployments/${deploymentId}/logs/stream`);

    // A long log arrives as a burst of events; adding them once per frame keeps
    // the page from rebuilding its list thousands of times.
    let pending: LogLine[] = [];
    let frame = 0;
    const flush = () => {
      frame = 0;
      const lines = pending;
      pending = [];
      setLogsById((prev) => ({ ...prev, [deploymentId]: appendLines(prev[deploymentId] ?? EMPTY_LOGS, lines) }));
    };

    // The stream starts from line 1, so what an earlier visit kept is dropped.
    // Only the first connection does this: a reconnect resumes where it left off.
    let first = true;
    source.onopen = () => {
      if (!first) return;
      first = false;
      setLogsById((prev) => ({ ...prev, [deploymentId]: EMPTY_LOGS }));
    };

    source.addEventListener("log", (event) => {
      const { data, lastEventId } = event as MessageEvent<string>;
      pending.push(parseLogLine(data, Number(lastEventId)));
      if (!frame) frame = requestAnimationFrame(flush);
    });

    source.addEventListener("status", (event) => {
      const status = (event as MessageEvent<string>).data.toLowerCase();
      queryClient.setQueryData<Deployment[]>(deploymentsKey, (current) =>
        current?.map((deployment) => (deployment.id === deploymentId ? { ...deployment, status } : deployment)),
      );
    });

    // The deployment is finished and every line has been sent. Closing stops the
    // browser from reconnecting; the list is read again for what only the API knows.
    source.addEventListener("end", () => {
      source.close();
      void queryClient.invalidateQueries({ queryKey: deploymentsKey });
    });

    return () => {
      source.close();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [deploymentId, projectId, queryClient]);

  return (deploymentId && logsById[deploymentId]) || EMPTY_LOGS;
}
