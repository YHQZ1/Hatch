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
    <nav className="sticky top-0 z-50 w-full border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-md py-4 selection:bg-white selection:text-black">
      <div className="w-full px-8 lg:px-12 flex items-center justify-between">
        <div className="flex items-center gap-14">
          <Link
            href="/dashboard"
            className="flex items-center gap-4 group cursor-pointer"
          >
            <div className="w-7 h-7 bg-white flex items-center justify-center transition-transform group-hover:scale-90">
              <div className="w-3 h-3 bg-black" />
            </div>
            <span className="font-bold tracking-tighter text-2xl uppercase text-white">
              Hatch
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-10 font-mono text-[13px] uppercase tracking-[0.2em]">
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

        <div className="relative flex items-center" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-5 group cursor-pointer outline-none bg-transparent border-none p-0"
          >
            <div className="text-right hidden sm:block pointer-events-none">
              <p className="text-[13px] font-medium text-white tracking-tight group-hover:text-[var(--text-muted)] transition-colors">
                {user?.username ?? "Guest"}
              </p>
            </div>
            {user?.avatar && (
              <img
                src={user.avatar}
                className={`w-9 h-9 rounded-full border transition-all duration-300 pointer-events-none ${menuOpen ? "border-white" : "border-[var(--border)] group-hover:border-[var(--border-focus)]"}`}
                alt="Profile"
              />
            )}
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-5 w-56 bg-[#080808] border border-[var(--border)] shadow-[0_30px_60px_rgba(0,0,0,1)] py-3 z-[60] animate-in fade-in zoom-in-95 duration-100">
              <div className="px-5 py-3 border-b border-[var(--border)] mb-2">
                <p className="text-[13px] font-medium text-white truncate">
                  {user?.username}
                </p>
                <p className="font-mono text-[9px] text-[#444] uppercase mt-1 tracking-widest">
                  Active Session
                </p>
              </div>

              <DropdownLink
                href="/profile"
                label="View Profile"
                onClick={() => setMenuOpen(false)}
              />
              <DropdownLink
                href="/settings"
                label="Account Settings"
                onClick={() => setMenuOpen(false)}
              />

              <div className="h-px bg-[var(--border)] my-2" />

              <button
                onClick={handleSignOut}
                className="w-full text-left px-5 py-3 text-[13px] text-red-500 hover:text-red-400 hover:bg-red-500/5 transition-colors cursor-pointer font-medium"
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
        <span className="absolute -bottom-[28px] left-0 right-0 h-[2.5px] bg-white shadow-[0_0_15px_rgba(255,255,255,0.4)]" />
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
      className="flex items-center px-5 py-3 text-[13px] text-[var(--text-muted)] hover:text-white hover:bg-[var(--surface)] transition-all cursor-pointer"
    >
      {label}
    </Link>
  );
}
