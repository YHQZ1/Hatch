import { Button } from "@/components/ui";

/**
 * One group of settings: a title and what it is for, the fields, and, for
 * settings that are saved, a footer with Save (on only when something changed)
 * and Discard. Nothing here saves another section's changes.
 */
export default function Section({
  id,
  title,
  description,
  footer,
  children,
}: {
  id: string;
  title: string;
  description: string;
  footer?: {
    dirty: boolean;
    /** Why it cannot be saved yet, shown instead of the note. */
    problem?: string | null;
    saving: boolean;
    note?: string;
    onSave: () => void;
    onDiscard: () => void;
  };
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 border-t border-line pt-8 first:border-t-0 first:pt-0 lg:scroll-mt-0"
    >
      <h2 id={`${id}-title`} className="text-[1rem] font-semibold tracking-tight">
        {title}
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
      <div className="mt-5 max-w-2xl">{children}</div>

      {footer && (
        // The row keeps its height while the buttons come and go, so nothing moves.
        <div className="mt-5 flex min-h-9 max-w-2xl items-center justify-between gap-4">
          <p className="min-w-0 text-xs leading-relaxed text-faint">{footer.dirty && footer.problem ? footer.problem : footer.note}</p>
          {footer.dirty && (
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" onClick={footer.onDiscard} disabled={footer.saving}>
                Discard
              </Button>
              <Button variant="primary" onClick={footer.onSave} disabled={footer.saving || Boolean(footer.problem)}>
                {footer.saving ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
