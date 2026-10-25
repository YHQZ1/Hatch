import { Link } from "react-router";
import { cn } from "@/lib/cn";

export interface SetupStep {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  /**
   * A suggestion, not a requirement: it does not count towards the progress,
   * is never the highlighted next step, and does not keep the list open.
   */
  optional?: boolean;
  action: { label: string; href: string; external?: boolean };
}

const NEXT_CLASS =
  "mt-3 inline-flex h-8 items-center rounded-hatch bg-accent px-3 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover";
const OPTIONAL_CLASS =
  "mt-3 inline-flex h-8 items-center rounded-hatch border border-line-strong px-3 text-sm font-medium text-ink transition-colors hover:border-ink/40 hover:bg-ink/5";

/**
 * A short list of what is left to do before the first deploy. It is only
 * shown until every required step is done, and lists only steps that exist today.
 */
export default function SetupChecklist({
  steps,
  className,
}: {
  steps: SetupStep[];
  className?: string;
}) {
  // Progress counts what is required; an optional step is offered alongside.
  const required = steps.filter((step) => !step.optional);
  const doneCount = required.filter((step) => step.done).length;
  const nextId = required.find((step) => !step.done)?.id;

  return (
    <section className={cn("rounded-hatch border border-line-strong bg-base", className)}>
      <div className="relative flex h-12 items-center justify-between border-b border-line px-4">
        <h2 className="text-sm font-semibold">Get started</h2>
        <p className="text-[13px] text-muted">
          {doneCount} of {required.length}
        </p>
        <div aria-hidden className="absolute inset-x-0 bottom-[-1px] h-px">
          <div
            className="h-px bg-accent transition-[width] duration-500"
            style={{ width: `${(doneCount / required.length) * 100}%` }}
          />
        </div>
      </div>

      <ol>
        {steps.map((step) => (
          <li
            key={step.id}
            className="flex items-start gap-3 border-b border-line px-4 py-3.5 last:border-b-0"
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] border",
                step.done
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line-strong text-transparent",
              )}
            >
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M2.5 6.5l2.2 2.2L9.5 3.5" strokeLinecap="square" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", step.done && "text-muted line-through decoration-faint")}>
                {step.title}
                {step.optional && !step.done && (
                  <span className="ml-2 text-xs font-normal text-faint">Optional</span>
                )}
              </p>
              {!step.done && (
                <p className="mt-1 text-sm leading-relaxed text-muted">{step.detail}</p>
              )}
              {(step.id === nextId || (step.optional && !step.done)) &&
                (step.action.external ? (
                  <a href={step.action.href} className={step.id === nextId ? NEXT_CLASS : OPTIONAL_CLASS}>
                    {step.action.label}
                  </a>
                ) : (
                  <Link to={step.action.href} className={step.id === nextId ? NEXT_CLASS : OPTIONAL_CLASS}>
                    {step.action.label}
                  </Link>
                ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Holds the checklist's space until it is known whether setup is finished. */
export function SetupChecklistSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("rounded-hatch border border-line-strong bg-base", className)}>
      <div className="flex h-12 items-center border-b border-line px-4">
        <div className="h-5 w-28 animate-pulse rounded-hatch bg-line" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3 border-b border-line px-4 py-3.5 last:border-b-0">
          <div className="h-5 w-5 shrink-0 animate-pulse rounded-[2px] bg-line" />
          <div className="w-full space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded-hatch bg-line" />
            {i > 0 && <div className="h-3 w-full animate-pulse rounded-hatch bg-line/60" />}
          </div>
        </div>
      ))}
    </div>
  );
}
