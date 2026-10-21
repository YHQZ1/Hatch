import { useEffect } from "react";
import { useNavigate } from "react-router";
import { apiFetch, clearClientSession } from "@/lib/api";
import { useTheme } from "@/lib/theme";

/** The page GitHub's sign-in lands on: confirm the session, then open the console. */
export default function AuthSuccess() {
  const navigate = useNavigate();
  const { theme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/me")
      .then((res) => {
        if (!res.ok) throw new Error("Session verification failed");
        if (!cancelled) navigate("/console", { replace: true });
      })
      .catch(() => {
        clearClientSession();
        if (!cancelled) navigate("/auth?error=session", { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div
      data-theme={theme}
      style={{ colorScheme: theme }}
      className="flex min-h-screen flex-col items-center justify-center bg-base text-ink"
    >
      <img src="/hatch.svg" alt="" className="theme-logo h-8 w-8" />
      <p className="mt-6 text-lg font-medium tracking-tight">Signing you in</p>
      <div
        aria-hidden
        className="relative mt-6 h-px w-56 overflow-hidden bg-line"
      >
        <div className="absolute inset-0 animate-loading-bar bg-accent" />
      </div>
    </div>
  );
}
