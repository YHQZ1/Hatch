/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const NAV_SECTIONS = [
  {
    title: "Getting Started",
    items: [
      { label: "Quick Start", href: "/docs/quick-start" },
      { label: "Self-Hosting", href: "/docs/self-hosting" },
    ],
  },
  {
    title: "Configuration",
    items: [
      { label: "Environment Variables", href: "/docs/environment-variables" },
      { label: "Configuration Reference", href: "/docs/configuration" },
    ],
  },
  {
    title: "Project",
    items: [
      { label: "Roadmap", href: "/docs/roadmap" },
      { label: "Changelog", href: "/docs/changelog" },
      {
        label: "GitHub",
        href: "https://github.com/YHQZ1/Hatch",
        external: true,
      },
    ],
  },
];

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const scrollContainerRef = useRef<HTMLElement>(null);

  // FIX 1: Handle scroll reset on Navigation (Route changes)
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [pathname]);

  // FIX 2: Handle scroll reset on Page Reload (Mount)
  useEffect(() => {
    // We use a small timeout to ensure the browser's native scroll restoration
    // happens first, then we immediately override it.
    const timer = setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#030303]">
      <header className="shrink-0 z-50 w-full border-b border-white/10 backdrop-blur-xl py-4 bg-[#020202]">
        <div className="w-full px-8 lg:px-12 flex items-center justify-between">
          <div className="flex items-center gap-14">
            <Link href="/" className="flex items-center gap-4 group">
              <div className="w-8 h-8 relative">
                <img
                  src="https://cdn.simpleicons.org/habr/FFFFFF"
                  alt="Hatch Logo"
                  className="object-contain"
                />
              </div>
              <span className="font-bold tracking-tighter text-2xl uppercase text-white">
                Hatch
              </span>
            </Link>
            <nav className="hidden lg:flex items-center gap-10 font-mono text-[13px] uppercase tracking-[0.2em]">
              <Link
                href="/#how-it-works"
                className="text-[#888] hover:text-white transition-colors uppercase"
              >
                Process
              </Link>
              <Link
                href="/#primitives"
                className="text-[#888] hover:text-white transition-colors uppercase"
              >
                Primitives
              </Link>
              <Link
                href="/#architecture"
                className="text-[#888] hover:text-white transition-colors uppercase"
              >
                Architecture
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-5">
            <Link
              href="/auth"
              className="h-11 px-8 flex items-center justify-center bg-white text-black text-[13px] font-bold uppercase tracking-widest hover:bg-[#e5e5e5] transition-all"
            >
              Deploy Now
            </Link>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden max-w-[1600px] mx-auto w-full">
        <aside className="w-64 shrink-0 border-r border-[#111] hidden lg:block overflow-y-auto no-scrollbar">
          <div className="flex flex-col gap-8 py-10 pr-6">
            {NAV_SECTIONS.map((section) => (
              <div key={section.title}>
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#333] mb-4 px-3 font-bold">
                  {section.title}
                </div>
                <div className="flex flex-col gap-1">
                  {section.items.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      target={item.external ? "_blank" : undefined}
                      className={`flex items-center justify-between px-3 py-2 rounded-[1px] text-[13px] transition-colors ${
                        pathname === item.href
                          ? "bg-white/5 text-white font-medium"
                          : "text-[#555] hover:text-[#aaa] hover:bg-white/[0.02]"
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden relative custom-scrollbar"
        >
          <div className="min-h-full flex flex-col">
            <div className="flex-1">{children}</div>

            <footer className="w-full border-t border-[#111] py-6 mt-20 shrink-0">
              <div className="px-10 lg:px-20 flex flex-col md:flex-row items-center justify-between gap-6">
                <span className="font-mono text-[11px] uppercase text-zinc-500">
                  © 2026 Hatch · MIT License
                </span>
                <span className="font-mono text-[11px] uppercase text-zinc-500">
                  AWS · Terraform · RabbitMQ · Go
                </span>
              </div>
            </footer>
          </div>
        </main>
      </div>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #111;
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #222;
        }
      `}</style>
    </div>
  );
}
