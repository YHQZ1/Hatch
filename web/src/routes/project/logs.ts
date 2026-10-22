export interface LogLine {
  /** The line's number in the deployment's log, as the server numbered it. */
  seq: number;
  text: string;
  type: "success" | "error" | "system" | "muted";
}

/** How many lines the page keeps: the newest. A build can print far more than anyone reads. */
export const MAX_SHOWN = 5000;

/** What a line of a build or deploy log is, so it can be coloured. */
export function parseLogLine(line: string, seq: number): LogLine {
  const lower = line.toLowerCase();
  const isSuccess =
    line.includes("✓") ||
    line.includes("successfully") ||
    lower.includes("deployment live at") ||
    lower.includes("target healthy");
  const isError = line.includes("✗") || lower.includes("error") || lower.includes("failed");
  const isSystem = line.startsWith("[") || line.includes("STEP");
  return {
    seq,
    text: line,
    type: isSuccess ? "success" : isError ? "error" : isSystem ? "system" : "muted",
  };
}

/** The lines kept after adding more: the newest MAX_SHOWN of them. */
export function appendLines(current: LogLine[], incoming: LogLine[]): LogLine[] {
  if (incoming.length === 0) return current;
  const all = current.concat(incoming);
  return all.length > MAX_SHOWN ? all.slice(all.length - MAX_SHOWN) : all;
}
