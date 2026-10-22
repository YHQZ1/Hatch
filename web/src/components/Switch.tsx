import { cn } from "@/lib/cn";

/** An on/off switch. `label` names it for screen readers; the text beside it is the caller's. */
export default function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        checked ? "justify-end border-accent bg-accent" : "justify-start border-line-strong bg-base",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
      )}
    >
      <span className={cn("h-4 w-4 rounded-full transition-colors", checked ? "bg-accent-ink" : "bg-faint")} />
    </button>
  );
}
