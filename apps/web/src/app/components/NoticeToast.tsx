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

  const tone =
    notice.type === "success"
      ? "border-[#12301f] bg-[#07120c] text-[#86efac]"
      : notice.type === "error"
        ? "border-[#351313] bg-[#140909] text-[#fca5a5]"
        : "border-[#1f2937] bg-[#090c12] text-[#93c5fd]";

  const bodyTone =
    notice.type === "success"
      ? "text-[#4ade80]"
      : notice.type === "error"
        ? "text-[#f87171]"
        : "text-[#60a5fa]";

  return (
    <div className="fixed right-6 top-20 z-50 max-w-md">
      <div className={`border rounded-[3px] shadow-2xl ${tone}`}>
        <div className="flex items-start gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]">
              {notice.title}
            </p>
            {notice.message && (
              <p className={`mt-1 text-[12px] leading-relaxed ${bodyTone}`}>
                {notice.message}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="text-[10px] font-bold uppercase tracking-[0.18em] text-current/60 hover:text-current transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
