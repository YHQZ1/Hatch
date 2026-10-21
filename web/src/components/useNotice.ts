import { useEffect, useState } from "react";
import type { NoticePayload } from "./NoticeToast";

const AUTO_DISMISS_MS = 5000;

/**
 * State for a page's toast. Pages show notices for their own actions with
 * setNotice; loadError adds a notice for a failed query, which is derived from
 * the query's error time rather than copied into state. Both disappear after a
 * few seconds or when dismissed.
 *
 * Pass the error's time (from a query's errorUpdatedAt) as failedAt, or null
 * when nothing failed.
 */
export function useNotice(loadError?: {
  failedAt: number | null;
  notice: NoticePayload;
}) {
  const [notice, setNotice] = useState<NoticePayload | null>(null);
  const [errorDismissedAt, setErrorDismissedAt] = useState(0);

  const errorVisible =
    loadError?.failedAt != null && loadError.failedAt > errorDismissedAt;
  const shownNotice = notice ?? (errorVisible ? loadError!.notice : null);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!errorVisible) return;
    const timeout = window.setTimeout(
      () => setErrorDismissedAt(Date.now()),
      AUTO_DISMISS_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [errorVisible]);

  return {
    notice: shownNotice,
    setNotice,
    dismiss: () => {
      setNotice(null);
      setErrorDismissedAt(Date.now());
    },
  };
}
