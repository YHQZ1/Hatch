import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { apiFetch, clearClientSession } from "@/lib/api";
import type { Session } from "@/lib/types";
import SuccessHatch from "./auth/SuccessHatch";
import Logo from "@/components/Logo";

/** The page GitHub's sign-in lands on: confirm the session, then open the overview. */
export default function AuthSuccess() {
  const navigate = useNavigate();
  const [user, setUser] = useState<Session | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/me")
      .then(async (res) => {
        if (!res.ok) throw new Error("Session verification failed");
        const session = (await res.json()) as Session;
        if (!cancelled) setUser(session);
      })
      .catch(() => {
        clearClientSession();
        if (!cancelled) navigate("/auth?error=session", { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const openOverview = useCallback(() => navigate("/overview", { replace: true }), [navigate]);

  return (
    <div className="bg-line-grid relative flex min-h-screen w-full flex-col overflow-hidden bg-base text-ink">
      <Link
        to="/"
        className="absolute left-6 top-6 z-10 flex items-center gap-2.5 md:left-10 lg:left-16"
      >
        <Logo className="h-7 w-7" />
        <span className="text-lg font-semibold tracking-tight">Hatch</span>
      </Link>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-16">
        <div className="animate-rise flex w-full justify-center">
          <SuccessHatch user={user} onDone={openOverview} />
        </div>
      </main>
    </div>
  );
}
