export type Status = "available" | "development" | "planned";

const LABELS: Record<Status, string> = {
  available: "Available",
  development: "In development",
  planned: "Planned",
};

const STYLES: Record<Status, string> = {
  available: "border-accent/40 bg-accent/10 text-accent",
  development: "border-line-strong text-ink/80",
  planned: "border-line text-muted",
};

/** A small squared label saying how far along a feature is. */
export default function Badge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-hatch border px-1.5 py-0.5 text-[11px] font-medium leading-4 ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
