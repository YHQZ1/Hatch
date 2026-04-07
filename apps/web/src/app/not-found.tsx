"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="w-full h-screen bg-black text-white flex flex-col font-sans relative overflow-hidden">
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 relative">
        <div className="max-w-xl w-full flex flex-col items-center text-center space-y-8">
          {/* Simple 404 Header */}
          <div className="space-y-2">
            <h1 className="text-[120px] font-bold tracking-tighter leading-none text-white">
              404
            </h1>
            <h2 className="text-xl font-medium text-zinc-300">
              Page not found
            </h2>
          </div>

          {/* Descriptive Text (Normal English) */}
          <div className="space-y-4 max-w-sm">
            <p className="text-sm text-zinc-500 leading-relaxed">
              The page you are looking for does not exist. It might have been
              moved or deleted.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 w-full sm:w-auto">
            <Link
              href="/console"
              className="px-8 bg-white text-black py-3 text-sm font-semibold rounded-md hover:bg-zinc-200 transition-all text-center"
            >
              Back to Console
            </Link>
            <button
              onClick={() => router.back()}
              className="px-8 border border-zinc-800 bg-transparent text-zinc-400 py-3 text-sm font-semibold rounded-md hover:text-white hover:border-zinc-600 transition-all cursor-pointer"
            >
              Go Back
            </button>
          </div>
        </div>
      </main>

      {/* Simple Footer */}
      <footer className="h-16 w-full border-t border-zinc-900 px-8 flex items-center justify-center bg-black">
        <p className="text-[10px] text-zinc-600 tracking-widest uppercase">
          © 2026 Hatch Cloud
        </p>
      </footer>
    </div>
  );
}
