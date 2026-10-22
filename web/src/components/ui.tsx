import { Link } from "react-router";
import { cn } from "@/lib/cn";
import { safeHttpUrl } from "@/lib/url";
import { useEffect } from "react";
import Container from "./Container";

type Tone = "default" | "success" | "warning" | "danger" | "muted";

/** The tone of a status, as a text colour that reads in both themes. */
const TONE_TEXT = {
  default: "text-ink",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-faint",
} satisfies Record<Tone, string>;

export function AppShell({
  children,
  className,
  contentClassName,
}: {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn("min-h-[calc(100vh-64px)] w-full text-ink", className)}>
      <Container className={cn("py-10", contentClassName)}>{children}</Container>
    </div>
  );
}

export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}

export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-hatch border border-line-strong bg-base", className)}
    >
      {children}
    </section>
  );
}

export function Toolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  href,
  onClick,
  disabled,
  variant = "secondary",
  className,
  type = "button",
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  type?: "button" | "submit";
}) {
  const classes = cn(
    "inline-flex h-9 items-center justify-center gap-2 rounded-hatch px-3.5 text-sm font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
    variant === "primary" && "bg-accent text-accent-ink hover:bg-accent-hover",
    variant === "secondary" &&
      "border border-line-strong text-ink hover:border-ink/40 hover:bg-ink/5",
    variant === "ghost" && "text-muted hover:text-ink",
    variant === "danger" &&
      "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/15",
    className,
  );

  if (href) {
    // A full URL leaves the app; anything else is a route.
    if (/^https?:\/\//i.test(href)) {
      return (
        <a href={safeHttpUrl(href) ?? undefined} className={classes}>
          {children}
        </a>
      );
    }
    return (
      <Link to={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  );
}

export function StatusText({
  children,
  tone = "default",
  pulse = false,
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  const dots = {
    default: "before:bg-muted",
    success: "before:bg-success",
    warning: "before:bg-warning",
    danger: "before:bg-danger",
    muted: "before:bg-faint",
  } satisfies Record<Tone, string>;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 truncate font-mono text-[11px] font-medium uppercase tracking-[0.14em]",
        "before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full",
        pulse && "before:animate-pulse",
        tone === "default" ? "text-muted" : TONE_TEXT[tone],
        dots[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
        {label}
      </p>
      <p className={cn("text-2xl font-semibold tracking-tight", TONE_TEXT[tone])}>
        {value}
      </p>
    </div>
  );
}

export function EmptyStateBlock({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-xl font-semibold tracking-tight">{title}</p>
      <p className="mt-3 max-w-md leading-relaxed text-muted">{description}</p>
      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="Close modal"
        className="hatch-modal-backdrop absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <section className="hatch-modal-panel relative w-full max-w-md overflow-hidden rounded-hatch border border-line-strong bg-base shadow-2xl">
        <div className="border-b border-line px-5 py-4">
          <p className="text-[1rem] font-semibold tracking-tight">{title}</p>
          {description && (
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {description}
            </p>
          )}
        </div>
        <div className="px-5 py-4">{children}</div>
      </section>
    </div>
  );
}
