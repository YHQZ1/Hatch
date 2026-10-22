import { cn } from "@/lib/cn";
import { SearchIcon } from "./Glyphs";
import Tabs from "./Tabs";
import { FILTERS, FILTER_LABELS, type StatusFilter } from "./overview";

export type ViewMode = "grid" | "list";

/**
 * The bar across the top: search (the "/" key focuses it from anywhere), the
 * grid/list switch, and the way to add a project.
 */
export default function Toolbar({
  query,
  onQuery,
  view,
  onView,
  searchRef,
  leading,
  trailing,
  placeholder = "Search projects…",
  className,
}: {
  query: string;
  onQuery: (value: string) => void;
  /** The grid/list switch is shown only when both are given. */
  view?: ViewMode;
  onView?: (value: ViewMode) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  placeholder?: string;
  /** Controls placed between the search and the layout switch. */
  leading?: React.ReactNode;
  /** Controls placed after the layout switch, such as the primary action. */
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <label className="relative block min-w-0 flex-1">
        <span className="sr-only">{placeholder.replace("…", "")}</span>
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onQuery("");
              e.currentTarget.blur();
            }
          }}
          placeholder={placeholder}
          className="h-10 w-full rounded-hatch border border-line-strong bg-base pl-10 pr-10 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {!query && (
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden h-5 -translate-y-1/2 items-center rounded-[3px] border border-line-strong px-1.5 text-[11px] text-faint sm:flex">
            /
          </kbd>
        )}
      </label>

      {leading}

      {view && onView && (
      <div role="group" aria-label="Layout" className="flex shrink-0 overflow-hidden rounded-hatch border border-line-strong">
        {(["grid", "list"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={view === mode}
            aria-label={mode === "grid" ? "Grid view" : "List view"}
            onClick={() => onView(mode)}
            className={cn(
              "flex h-10 w-10 items-center justify-center transition-colors",
              view === mode ? "bg-ink/10 text-ink" : "text-muted hover:text-ink",
              mode === "list" && "border-l border-line-strong",
            )}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
              {mode === "grid" ? (
                <>
                  <rect x="2" y="2" width="5" height="5" />
                  <rect x="9" y="2" width="5" height="5" />
                  <rect x="2" y="9" width="5" height="5" />
                  <rect x="9" y="9" width="5" height="5" />
                </>
              ) : (
                <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="square" />
              )}
            </svg>
          </button>
        ))}
      </div>
      )}

      {trailing}
    </div>
  );
}

/** The status filters as tabs, each with how many projects it would show. */
export function FilterTabs({
  filter,
  onFilter,
  counts,
}: {
  filter: StatusFilter;
  onFilter: (value: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
}) {
  return (
    <Tabs
      label="Filter by status"
      value={filter}
      onChange={onFilter}
      options={FILTERS.filter((f) => f === "all" || counts[f] > 0 || f === filter).map((f) => ({
        id: f,
        label: FILTER_LABELS[f],
        count: counts[f],
      }))}
    />
  );
}
