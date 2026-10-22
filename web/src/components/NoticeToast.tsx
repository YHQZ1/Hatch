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
      ? "bg-accent-hover"
      : notice.type === "success"
        ? "bg-faint"
        : "bg-faint";

  return (
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pointer-events-none">
      <div className="hatch-toast-enter pointer-events-auto w-full max-w-md overflow-hidden rounded-hatch border border-line-strong bg-base/95 text-ink shadow-2xl backdrop-blur-xl">
        <div className="flex items-start gap-3 px-4 py-3.5">
          <span
            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${indicator}`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-ink">
              {notice.title}
            </p>
            {notice.message && (
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                {notice.message}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="text-[11px] font-medium text-faint hover:text-ink transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
