"use client";

import { useEffect, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AuthSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Validati Session...");

  useEffect(() => {
    const token = searchParams.get("token");

    if (token) {
      localStorage.setItem("hatch_token", token);

      // Sequence to make the technical transition feel reactive
      const t1 = setTimeout(() => setStatus("Authorizing..."), 400);
      const t2 = setTimeout(() => setStatus("Verified"), 800);
      const t3 = setTimeout(() => router.push("/dashboard"), 1500);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    } else {
      router.push("/auth");
    }
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-black flex flex-col relative overflow-hidden selection:bg-white selection:text-black">
      {/* Background Grid */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-grid-pattern opacity-10 [mask-image:radial-gradient(ellipse_at_center,black,transparent_90%)]"></div>
      </div>

      <main className="relative z-10 flex-grow flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-10">
          {/* Technical Readout */}
          <div className="space-y-4 text-center">
            <div className="flex items-center justify-center gap-3">
              <div className="w-1 h-1 bg-white animate-pulse"></div>
              <h1 className="text-white font-mono text-[10px] uppercase tracking-[0.6em] opacity-40">
                Protocol_Handshake_Secure
              </h1>
            </div>

            <h2 className="text-white text-4xl lg:text-6xl font-medium tracking-tighter uppercase font-sans">
              {status}
            </h2>
          </div>

          {/* Precision Loading Line */}
          <div className="w-80 h-[1px] bg-[#111] relative overflow-hidden">
            <div className="absolute inset-0 bg-white animate-loading-bar"></div>
          </div>

          {/* Footer Metadata */}
          <div className="font-mono text-[9px] text-[#222] uppercase tracking-[0.2em] mt-4">
            RSA_4096 // AES_256_GCM // TLS_1.3
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
