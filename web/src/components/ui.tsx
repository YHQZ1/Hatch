import { Link } from "react-router";
import { cn } from "@/lib/cn";
import { safeHttpUrl } from "@/lib/url";
import { useEffect } from "react";
import Container from "./Container";

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
