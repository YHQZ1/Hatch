import { useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/cn";

/** How long the tick stays before the copy icon comes back. */
const TICK_MS = 1600;

/**
 * A small button that copies a project's full address, with its http:// or
 * https://, which the shorter text beside it leaves out.
 *
 * After copying, the copy icon shrinks and fades while a grey tick draws itself
 * in; a moment later the tick fades and the copy icon returns. Both icons are
 * always in the button, so the swap is a transition and nothing moves.
 */
export default function CopyUrlButton({ url, className }: { url: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copied = state === "copied";

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), TICK_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const swap = "transition duration-200 ease-out motion-reduce:transition-none";

  return (
    <button
      type="button"
      aria-label={copied ? "URL copied" : "Copy URL"}
      title={copied ? "Copied" : state === "failed" ? "Could not copy" : `Copy ${url}`}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setState((await copyText(url)) ? "copied" : "failed");
      }}
      className={cn(
        "pointer-events-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] transition-colors motion-reduce:transition-none",
        copied ? "text-muted" : state === "failed" ? "text-danger" : "text-faint hover:text-ink",
        className,
      )}
    >
      <span className="relative block h-3.5 w-3.5">
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
          className={cn("absolute inset-0 h-full w-full", swap, copied ? "scale-50 opacity-0" : "scale-100 opacity-100")}
        >
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
          <path d="M10.5 5.5v-2A1.5 1.5 0 009 2H4a1.5 1.5 0 00-1.5 1.5V9A1.5 1.5 0 004 10.5h1.5" strokeLinecap="round" />
        </svg>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
          className={cn("absolute inset-0 h-full w-full", swap, copied ? "scale-100 opacity-100" : "scale-75 opacity-0")}
        >
          {/* Drawn in by animating the stroke from empty to full. */}
          <path
            d="M3 8.5l3.2 3.2L13 4.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={copied ? 0 : 1}
            className="transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none"
            style={{ transitionDelay: copied ? "90ms" : "0ms" }}
          />
        </svg>
      </span>
    </button>
  );
}
