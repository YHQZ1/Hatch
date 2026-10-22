import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/cn";

export interface MenuItem {
  label: string;
  /** A route, or a full URL that opens in a new tab. */
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  /** Drawn in the danger colour, for an action that cannot be undone. */
  danger?: boolean;
  /**
   * Which group the item belongs to. Items in a group are divided by a soft
   * line, and groups by a stronger one, so the menu reads in sections.
   */
  group?: number;
}

/**
 * The "..." button of a service and the menu it opens. It closes when a click
 * lands outside it or Escape is pressed, and its items are plain links or
 * buttons, so the keyboard reaches them in order.
 */
export default function ActionsMenu({
  items,
  label,
  busy = false,
  onOpenChange,
}: {
  items: MenuItem[];
  /** Names the service for screen readers: "Actions for octo/shop". */
  label: string;
  busy?: boolean;
  /** Lets the card raise itself above its neighbours while the menu is open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass = (disabled?: boolean, danger?: boolean) =>
    cn(
      "block w-full px-4 py-2.5 text-left text-sm transition-colors",
      disabled
        ? "cursor-not-allowed text-faint"
        : danger
          ? "text-danger hover:bg-danger/10"
          : "text-muted hover:bg-ink/5 hover:text-ink",
    );

  return (
    <div ref={ref} className="pointer-events-auto relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-hatch border transition-colors",
          open ? "border-accent text-ink" : "border-transparent text-muted hover:border-line-strong hover:text-ink",
          busy && "cursor-wait opacity-60",
        )}
      >
        {busy ? (
          <span aria-hidden className="h-3 w-3 animate-spin rounded-full border border-faint border-t-transparent" />
        ) : (
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
            <circle cx="3" cy="8" r="1.3" />
            <circle cx="8" cy="8" r="1.3" />
            <circle cx="13" cy="8" r="1.3" />
          </svg>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-40 w-52 overflow-hidden rounded-hatch border border-line-strong bg-base shadow-2xl"
        >
          {items.map((item, index) => {
            const previous = items[index - 1];
            const newGroup = previous !== undefined && (previous.group ?? 0) !== (item.group ?? 0);
            // A line between every pair of items; stronger where a new group starts.
            const className = cn(
              itemClass(item.disabled, item.danger),
              index > 0 && (newGroup ? "border-t border-ink/25" : "border-t border-line"),
            );
            if (item.href && !item.disabled) {
              return /^https?:\/\//i.test(item.href) ? (
                <a
                  key={item.label}
                  role="menuitem"
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className={className}
                >
                  {item.label}
                </a>
              ) : (
                <Link key={item.label} role="menuitem" to={item.href} onClick={() => setOpen(false)} className={className}>
                  {item.label}
                </Link>
              );
            }
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
                className={className}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
