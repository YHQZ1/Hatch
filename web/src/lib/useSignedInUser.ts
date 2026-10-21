import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import type { Session } from "./types";

type State =
  | { status: "checking" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: Session };

/**
 * Whether the browser already has a session. This is a plain request, not a
 * query: a 401 here is the normal answer for a visitor, and must not trigger
 * the app-wide sign-out redirect.
 */
export function useSignedInUser(): State & { refresh: () => void } {
  const [state, setState] = useState<State>({ status: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/me")
      .then(async (res) => {
        if (!res.ok) return { status: "signed-out" } as const;
        return { status: "signed-in", user: (await res.json()) as Session } as const;
      })
      .catch(() => ({ status: "signed-out" }) as const)
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { ...state, refresh: () => setAttempt((n) => n + 1) };
}
