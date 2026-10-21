import type { ReactNode } from "react";

function Plus({ className }: { className: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 11 11"
      className={`absolute h-[11px] w-[11px] text-ink/40 ${className}`}
    >
      <path d="M5.5 0v11M0 5.5h11" stroke="currentColor" fill="none" />
    </svg>
  );
}

/** Wraps a bordered block with small crosshairs on its four corners. */
export default function Frame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Plus className="-left-[5px] -top-[5px]" />
      <Plus className="-right-[5px] -top-[5px]" />
      <Plus className="-bottom-[5px] -left-[5px]" />
      <Plus className="-bottom-[5px] -right-[5px]" />
      {children}
    </div>
  );
}
