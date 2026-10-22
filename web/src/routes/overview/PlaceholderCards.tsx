import { Link } from "react-router";
import { cn } from "@/lib/cn";

/**
 * A card that holds the place of something the next phase brings. It says in
 * plain words what will appear and when, and never shows made-up numbers.
 */
function PlaceholderCard({
  label,
  value,
  status,
  children,
  className,
}: {
  label: string;
  value?: string;
  status?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-hatch border border-line-strong bg-base p-5", className)}>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">{label}</p>
      {value && <p className="mt-2 text-2xl font-semibold tracking-tight text-faint">{value}</p>}
      {status && (
        <p className="mt-2 flex items-center gap-2 text-sm font-medium text-muted">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-faint" />
          {status}
        </p>
      )}
      <p className="mt-3 text-sm leading-relaxed text-muted">{children}</p>
    </section>
  );
}

/** The two cards that sit beside the service counts once AWS is connected. */
export default function AwsPlaceholders() {
  return (
    <div className="mb-8 grid gap-4 md:grid-cols-2">
      <PlaceholderCard label="Estimated cost this month" value="—">
        Hatch will show what your services are expected to cost against a monthly cap, once an AWS
        account is connected.
      </PlaceholderCard>
      <PlaceholderCard label="AWS account" status="Not connected">
        Hatch deploys into an AWS account you own, so the bill is yours.{" "}
        <Link
          to="/settings?section=aws"
          className="text-accent transition-colors hover:text-accent-hover"
        >
          See how connecting works
        </Link>
        .
      </PlaceholderCard>
    </div>
  );
}
