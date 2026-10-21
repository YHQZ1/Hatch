import { useNavigate, useSearchParams } from "react-router";
import { useEffect, useState } from "react";
import { apiFetch, clearClientSession } from "@/lib/api";

export default function AuthSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hasLegacyToken = searchParams.has("token");
  const [status, setStatus] = useState("Validating Session...");

  useEffect(() => {
    // Older links carried a token in the URL; sessions use a cookie now.
    if (hasLegacyToken) {
      window.history.replaceState({}, "", "/auth/success");
    }

    let cancelled = false;
    const verifySession = async () => {
      setStatus("Authorizing...");
      try {
        const res = await apiFetch("/api/me");
        if (!res.ok) throw new Error("Session verification failed");
        if (!cancelled) {
          setStatus("Verified");
          setTimeout(() => navigate("/console", { replace: true }), 500);
        }
      } catch {
        clearClientSession();
        if (!cancelled) navigate("/auth", { replace: true });
      }
    };
    verifySession();

    return () => {
      cancelled = true;
    };
  }, [navigate, hasLegacyToken]);

  return (
    <div className="min-h-screen bg-black flex flex-col relative overflow-hidden selection:bg-white selection:text-black">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-grid-pattern opacity-10 [mask-image:radial-gradient(ellipse_at_center,black,transparent_90%)]" />
      </div>

      <main className="relative z-10 flex-grow flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-10">
          <div className="space-y-4 text-center">
            <div className="flex items-center justify-center gap-3">
              <div className="w-1 h-1 bg-white animate-pulse" />
              <h1 className="text-white font-mono text-[10px] uppercase tracking-[0.6em] opacity-40">
                Redirecting to Console
              </h1>
            </div>

            <h2 className="text-white text-4xl lg:text-6xl font-medium tracking-tighter uppercase font-sans">
              {status}
            </h2>
          </div>

          <div className="w-80 h-[1px] bg-[#111] relative overflow-hidden">
            <div className="absolute inset-0 bg-white animate-loading-bar" />
          </div>
        </div>
      </main>
    </div>
  );
}
