/* eslint-disable react-hooks/purity */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{
    username: string;
    avatar?: string;
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    const token = localStorage.getItem("hatch_token");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setUser({
          username: payload.username,
          avatar:
            payload.avatar_url || `https://github.com/${payload.username}.png`,
        });
      } catch {
        console.error("Session invalid");
      }
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem("hatch_token");
    router.push("/");
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-xl py-0 selection:bg-white selection:text-black">
      <div className="w-full px-8 lg:px-12 flex items-center justify-between h-20">
        {/* LOGO SECTION WITH NEW HABR ICON */}
        <div className="flex items-center h-full">
          <Link
            href="/dashboard"
            className="flex items-center gap-4 group cursor-pointer pr-10 border-r border-[var(--border)] h-1/2"
          >
            <div className="w-8 h-8 flex items-center justify-center">
              <img
                src="https://cdn.simpleicons.org/habr/FFFFFF"
                alt="Hatch Logo"
                className="w-full h-full"
              />
            </div>
            <span className="font-bold tracking-tighter text-2xl uppercase text-white">
              Hatch
            </span>
          </Link>

          {/* MAIN NAV */}
          <div className="hidden md:flex items-center gap-10 font-mono text-[14px] uppercase tracking-[0.3em] pl-10">
            <NavLink href="/deployments" active={pathname === "/deployments"}>
              Deployments
            </NavLink>
            <NavLink href="/activity" active={pathname === "/activity"}>
              Activity
            </NavLink>
            <NavLink
              href="/infrastructure"
              active={pathname === "/infrastructure"}
            >
              Infrastructure
            </NavLink>
          </div>
        </div>

        {/* ACTIONS SECTION */}
        <div className="flex items-center h-full gap-6 relative" ref={menuRef}>
          <div className="flex items-center gap-6 pr-8 border-r border-[var(--border)] h-1/2">
            <Link
              href="/new"
              className="h-9 px-4 border border-white bg-black text-white hover:bg-white hover:text-black transition-all duration-300 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] font-bold group"
            >
              <span className="text-lg leading-none group-hover:scale-110 transition-transform">
                +
              </span>
              New Project
            </Link>
          </div>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-4 group cursor-pointer outline-none bg-transparent border-none p-0"
          >
            <div className="text-right hidden sm:block">
              <p className="text-[14px] font-medium text-white tracking-tight group-hover:text-[var(--text-muted)] transition-colors">
                {user?.username ?? "Guest"}
              </p>
            </div>
            {user?.avatar && (
              <div className="relative">
                <img
                  src={user.avatar}
                  className={`w-9 h-9 rounded-sm border transition-all duration-300 pointer-events-none ${
                    menuOpen
                      ? "border-white"
                      : "border-[var(--border)] group-hover:border-[var(--border-focus)]"
                  }`}
                  alt="Profile"
                />
              </div>
            )}
          </button>

          {/* DROPDOWN MENU */}
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-[#080808] border border-[var(--border)] shadow-[0_30px_60px_rgba(0,0,0,1)] py-2 z-[60] animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="px-5 py-3 border-b border-[var(--border)] mb-1">
                <p className="text-[13px] font-medium text-white truncate">
                  {user?.username}
                </p>
                <p className="font-mono text-[9px] text-[#444] uppercase mt-1 tracking-widest">
                  GitHub Account
                </p>
              </div>

              <DropdownLink
                href="/profile"
                label="Profile"
                onClick={() => setMenuOpen(false)}
              />
              <DropdownLink
                href="/settings"
                label="Settings"
                onClick={() => setMenuOpen(false)}
              />

              <div className="h-px bg-[var(--border)] my-1" />

              <button
                onClick={handleSignOut}
                className="w-full text-left px-5 py-2.5 text-[11px] font-mono uppercase tracking-widest text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  children,
  active,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`transition-colors duration-200 relative py-1 cursor-pointer font-medium ${
        active ? "text-white" : "text-[var(--text-muted)] hover:text-white"
      }`}
    >
      {children}
      {active && (
        <span className="absolute -bottom-[32px] left-[-4px] right-[-4px] h-[2px] bg-white shadow-[0_0_15px_white]" />
      )}
    </Link>
  );
}

function DropdownLink({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center px-5 py-2.5 text-[11px] font-mono uppercase tracking-widest text-[var(--text-muted)] hover:text-white hover:bg-[#111] transition-all cursor-pointer"
    >
      {label}
    </Link>
  );
}
