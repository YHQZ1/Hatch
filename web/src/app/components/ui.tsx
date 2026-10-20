"use client";

import Link from "next/link";
import { useEffect } from "react";

type Tone = "default" | "success" | "warning" | "danger" | "muted";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

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
    <div
      className={cn(
        "min-h-[calc(100vh-64px)] w-full bg-[#050505] text-white",
        className,
      )}
    >
      <div
        className={cn(
          "w-full px-4 py-6 sm:px-6 lg:px-8 xl:px-10",
          contentClassName,
        )}
      >
        {children}
      </div>
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
        "mb-8 flex flex-col gap-5 border-b border-white/[0.08] pb-7 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-600">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-medium tracking-tight text-white sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
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
      className={cn(
        "border-y border-white/[0.08]",
        className,
      )}
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
    "inline-flex h-9 items-center justify-center rounded-md px-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-all",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
    disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
    variant === "primary" &&
      "bg-white text-black hover:bg-zinc-200 active:bg-zinc-300",
    variant === "secondary" &&
      "border border-white/[0.11] bg-transparent text-zinc-300 hover:border-white/25 hover:bg-white/[0.045] hover:text-white",
    variant === "ghost" &&
      "text-zinc-500 hover:bg-white/[0.06] hover:text-white",
    variant === "danger" &&
      "border border-red-500/20 bg-red-500/[0.05] text-red-300 hover:border-red-400/35 hover:bg-red-500/[0.09]",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
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
  const colors = {
    default: "text-zinc-300 before:bg-zinc-500",
    success: "text-[#5cc98f] before:bg-[#3fba78]",
    warning: "text-[#d8ad4f] before:bg-[#d8ad4f]",
    danger: "text-[#d86666] before:bg-[#d05252]",
    muted: "text-zinc-600 before:bg-zinc-700",
  } satisfies Record<Tone, string>;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 truncate font-mono text-[10px] font-semibold uppercase tracking-[0.16em]",
        "before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full",
        pulse && "before:animate-pulse",
        colors[tone],
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
  const valueColor = {
    default: "text-white",
    success: "text-[#5cc98f]",
    warning: "text-[#d8ad4f]",
    danger: "text-[#d86666]",
    muted: "text-zinc-500",
  } satisfies Record<Tone, string>;

  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600">
        {label}
      </p>
      <p className={cn("text-xl font-medium tracking-tight", valueColor[tone])}>
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
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
        {title}
      </p>
      <p className="mt-3 max-w-md text-sm leading-6 text-zinc-600">
        {description}
      </p>
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
        className="hatch-modal-backdrop absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default"
        onClick={onClose}
      />
      <section className="hatch-modal-panel relative w-full max-w-md overflow-hidden rounded-xl border border-white/[0.1] bg-[#090909] shadow-2xl">
        <div className="border-b border-white/[0.08] px-5 py-4">
          <p className="text-base font-medium tracking-tight text-white">
            {title}
          </p>
          {description && (
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              {description}
            </p>
          )}
        </div>
        <div className="px-5 py-4">{children}</div>
      </section>
    </div>
  );
}
