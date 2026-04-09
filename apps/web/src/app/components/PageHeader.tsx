import Link from "next/link";

interface PageHeaderProps {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

export function PageHeader({
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-4xl font-medium tracking-tight text-white">
          {title}
        </h1>
        {description && (
          <p className="text-[11px] text-zinc-600 mt-1 tracking-wide">
            {description}
          </p>
        )}
      </div>
      {actionLabel &&
        (actionHref ? (
          <Link
            href={actionHref}
            className="bg-white text-black text-[10px] font-bold px-4 py-2 rounded-[3px] uppercase tracking-widest hover:bg-zinc-200 transition-colors"
          >
            {actionLabel}
          </Link>
        ) : onAction ? (
          <button
            onClick={onAction}
            className="bg-white text-black text-[10px] font-bold px-4 py-2 rounded-[3px] uppercase tracking-widest hover:bg-zinc-200 transition-colors"
          >
            {actionLabel}
          </button>
        ) : null)}
    </div>
  );
}
