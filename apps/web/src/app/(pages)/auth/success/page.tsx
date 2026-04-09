"use client";

import { useEffect, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AuthSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Validating Session...");

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      router.push("/auth");
      return;
    }

    localStorage.setItem("hatch_token", token);

    const t1 = setTimeout(() => setStatus("Authorizing..."), 400);
    const t2 = setTimeout(() => setStatus("Verified"), 800);
    const t3 = setTimeout(() => router.push("/console"), 1500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [router, searchParams]);

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

      <style jsx global>{`
        @keyframes loading-bar {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        .animate-loading-bar {
          animation: loading-bar 2s cubic-bezier(0.65, 0, 0.35, 1) infinite;
        }
      `}</style>
    </div>
  );
}

export default function AuthSuccess() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <AuthSuccessContent />
    </Suspense>
  );
}
