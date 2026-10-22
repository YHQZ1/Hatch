import { cn } from "@/lib/cn";

export interface TabOption<T extends string> {
  id: T;
  label: string;
  count: number;
}

/** Underlined tabs, each with how many items it would show. */
export default function Tabs<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-x-5 gap-y-1 border-b border-line">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "-mb-px flex h-10 items-center gap-2 border-b-2 text-sm transition-colors",
            value === option.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {option.label}
          <span className="text-xs tabular-nums text-faint">{option.count}</span>
        </button>
      ))}
    </div>
  );
}
