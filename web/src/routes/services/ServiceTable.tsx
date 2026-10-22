import { StatusText } from "@/components/ui";
import type { StatusKind, StatusMeta } from "./service";

export function ServiceSkeleton() {
  return (
    <div>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 border-b border-line px-5 py-5 last:border-b-0"
          style={{ opacity: 1 - index * 0.18 }}
        >
          <div className="h-9 w-9 animate-pulse rounded-hatch bg-line" />
          <div className="space-y-2">
            <div className="h-3 w-40 animate-pulse rounded-hatch bg-line" />
            <div className="h-2.5 w-28 animate-pulse rounded-hatch bg-line/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

const STATUS_TONE = {
  live: "success",
  active: "warning",
  failed: "danger",
  canceled: "muted",
  deleting: "warning",
  suspended: "muted",
  idle: "muted",
} satisfies Record<StatusKind, "success" | "warning" | "danger" | "muted">;

export function StatusBadge({ status }: { status: StatusMeta }) {
  return (
    <StatusText
      tone={STATUS_TONE[status.kind]}
      pulse={status.kind === "active" || status.kind === "deleting"}
      className="max-w-full"
    >
      {status.label}
    </StatusText>
  );
}
