import type { ReactNode } from "react";
import { Link } from "react-router";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  secondary:
    "border border-line-strong text-white hover:border-white/40 hover:bg-white/5",
  ghost: "text-muted hover:text-white",
};

const BASE =
  "inline-flex h-10 items-center justify-center gap-2 rounded-hatch px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** A link styled as a button: in-app route when `to` is set, else external. */
export default function Button({
  variant = "primary",
  to,
  href,
  children,
}: {
  variant?: Variant;
  to?: string;
  href?: string;
  children: ReactNode;
}) {
  const className = `${BASE} ${VARIANTS[variant]}`;
  if (to) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}
