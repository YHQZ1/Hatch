import { cn } from "@/lib/cn";

/**
 * A section's layout: its main cards, and on a wide screen a narrower column of
 * related context beside them, so the page uses the width it has.
 */
export function SectionLayout({
  main,
  aside,
}: {
  main: React.ReactNode;
  aside: React.ReactNode;
}) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
      <div className="min-w-0 space-y-6">{main}</div>
      <div className="min-w-0 space-y-6">{aside}</div>
    </div>
  );
}

/** A titled card of related settings. */
export function SettingsCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-hatch border border-line-strong bg-base", className)}>
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}

/** One setting: what it is on the left, its value or control on the right. */
export function SettingRow({
  label,
  description,
  children,
  stacked = false,
}: {
  label: string;
  description?: string;
  children?: React.ReactNode;
  /** Put the control under the text, for a narrow column or a long description. */
  stacked?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-line px-5 py-4 last:border-b-0",
        !stacked && "sm:flex-row sm:items-center sm:justify-between sm:gap-6",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center gap-3">{children}</div>}
    </div>
  );
}

/** A small external link that opens in a new tab. */
export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("text-sm text-accent transition-colors hover:text-accent-hover", className)}
    >
      {children}
      <span aria-hidden> ↗</span>
    </a>
  );
}
