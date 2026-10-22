import { useId } from "react";
import { cn } from "@/lib/cn";

export const INPUT_CLASS =
  "h-10 w-full rounded-hatch border border-line-strong bg-base px-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";

/** A labelled text box, with an optional line of help underneath. */
export default function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  suffix,
  inputClassName,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: React.ReactNode;
  /** Fixed text shown inside the box after the value, such as a domain. */
  suffix?: string;
  inputClassName?: string;
  className?: string;
}) {
  const id = useId();
  const input = (
    <input
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      className={cn(
        suffix
          ? "h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-ink placeholder:text-faint focus:outline-none"
          : INPUT_CLASS,
        inputClassName,
      )}
    />
  );

  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {suffix ? (
        <div className="flex h-10 items-center rounded-hatch border border-line-strong bg-base focus-within:border-accent">
          {input}
          <span className="max-w-[55%] shrink-0 truncate pr-3 text-sm text-muted">{suffix}</span>
        </div>
      ) : (
        input
      )}
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-faint">{hint}</p>}
    </div>
  );
}
