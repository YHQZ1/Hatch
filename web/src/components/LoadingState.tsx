interface LoadingStateProps {
  rows?: number;
  columns?: string;
  rowHeight?: string;
}

export function TableLoadingState({
  rows = 4,
  columns = "grid-cols-[2fr_1.5fr_1fr_1fr_0.7fr_0.7fr_80px]",
  rowHeight = "py-4",
}: LoadingStateProps) {
  return (
    <div>
      {[...Array(rows)].map((_, i) => (
        <div
          key={i}
          className={`grid ${columns} px-5 ${rowHeight} border-b border-line items-center last:border-b-0`}
          style={{ opacity: 1 - i * 0.15 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-line rounded-hatch animate-pulse" />
            <div className="space-y-1.5">
              <div className="h-2.5 w-28 bg-line rounded-full animate-pulse" />
              <div className="h-2 w-20 bg-line/50 rounded-full animate-pulse" />
            </div>
          </div>
          <div className="h-2 w-36 bg-line/70 rounded-full animate-pulse" />
          <div className="h-2 w-14 bg-line/70 rounded-full animate-pulse" />
          <div className="h-2 w-24 bg-line/50 rounded-full animate-pulse" />
          <div className="h-2 w-12 bg-line/50 rounded-full animate-pulse" />
          <div className="h-2 w-12 bg-line/50 rounded-full animate-pulse" />
          <div className="h-5 w-12 bg-line/70 rounded-hatch animate-pulse ml-auto" />
        </div>
      ))}
    </div>
  );
}

export function CardLoadingState({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className="bg-base border border-line rounded-hatch p-5 animate-pulse"
          style={{ opacity: 1 - i * 0.1 }}
        >
          <div className="h-3 w-20 bg-line rounded-full mb-3" />
          <div className="h-8 w-16 bg-line rounded-full mb-2" />
          <div className="h-2 w-full bg-line/50 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function PageLoadingState() {
  return (
    <div className="delayed-appear flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <div className="w-10 h-10 border-2 border-line border-t-accent rounded-full animate-spin" />
        <p className="text-[11px] text-faint font-mono uppercase tracking-[0.3em]">
          Loading...
        </p>
      </div>
    </div>
  );
}

export function InlineLoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-line border-t-accent rounded-full animate-spin" />
    </div>
  );
}
