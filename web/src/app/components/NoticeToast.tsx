"use client";

export interface NoticePayload {
  type: "success" | "error" | "info";
  title: string;
  message?: string;
}

export function NoticeToast({
  notice,
  onDismiss,
}: {
  notice: NoticePayload | null;
  onDismiss: () => void;
}) {
  if (!notice) return null;

  const indicator =
    notice.type === "error"
      ? "bg-zinc-300"
      : notice.type === "success"
        ? "bg-zinc-500"
        : "bg-zinc-600";

  return (
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pointer-events-none">
      <div className="hatch-toast-enter pointer-events-auto w-full max-w-md overflow-hidden rounded-xl border border-white/[0.1] bg-[#090909]/95 text-zinc-200 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start gap-3 px-4 py-3.5">
          <span
            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${indicator}`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-zinc-100">
              {notice.title}
            </p>
            {notice.message && (
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                {notice.message}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="text-[11px] font-medium text-zinc-600 hover:text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
