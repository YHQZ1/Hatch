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
    <nav className="sticky top-0 z-50 w-full border-b border-[#1a1a1a] bg-black/80 backdrop-blur-md">
      {/* Increased height to h-16 for better scale */}
      <div className="w-full px-6 lg:px-10 flex items-center justify-between h-16">
        {/* LEFT SECTION */}
        <div className="flex items-center h-full gap-10">
          <Link
            href="/dashboard"
            className="flex items-center gap-3.5 group cursor-pointer"
          >
            {/* Slightly larger logo container */}
            <div className="w-8 h-8 flex items-center justify-center">
              <img
                src="https://cdn.simpleicons.org/habr/FFFFFF"
                alt="Hatch Logo"
                className="w-full h-full"
              />
            </div>
            {/* Increased font size to text-xl */}
            <span className="font-bold tracking-tighter text-xl uppercase text-white">
              Hatch
            </span>
          </Link>

          {/* MAIN NAV - Scaled gap and text size */}
          <div className="hidden md:flex items-center h-full gap-6">
            <NavLink href="/dashboard" active={pathname === "/dashboard"}>
              Services
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

        {/* RIGHT SECTION */}
        <div className="flex items-center h-full gap-6 relative" ref={menuRef}>
          {/* Scaled Button: h-9 instead of h-8 */}
          <Link
            href="/new"
            className="h-9 px-4 border border-zinc-800 text-white hover:bg-white hover:text-black transition-all flex items-center gap-2 font-bold text-[11px] uppercase tracking-tight rounded-[2px] cursor-pointer"
          >
            <span className="text-sm">+</span>
            New
          </Link>

          <div className="h-5 w-px bg-[#1a1a1a]" />

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-4 group cursor-pointer outline-none bg-transparent border-none p-0 appearance-none"
          >
            <div className="text-right hidden sm:block">
              {/* Bumped user name size to 13px */}
              <p className="text-[13px] font-medium text-zinc-400 group-hover:text-white transition-colors tracking-tight">
                {user?.username ?? "Guest"}
              </p>
            </div>
            {user?.avatar && (
              <div className="relative">
                {/* Bumped avatar size to w-8 */}
                <img
                  src={user.avatar}
                  className={`w-8 h-8 rounded-sm border transition-all duration-200 ${
                    menuOpen
                      ? "border-white"
                      : "border-zinc-800 group-hover:border-zinc-500"
                  }`}
                  alt="Profile"
                />
              </div>
            )}
          </button>

          {/* DROPDOWN MENU */}
          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] w-56 bg-[#0a0a0a] border border-[#1a1a1a] shadow-2xl py-2 z-[60] rounded-[2px] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1a1a1a] mb-1">
                <p className="text-[13px] font-semibold text-white truncate">
                  {user?.username}
                </p>
                <p className="text-[10px] text-zinc-500 uppercase mt-0.5 tracking-widest font-mono">
                  Personal Account
                </p>
              </div>
              <DropdownLink
                href={`/u/${user?.username}`}
                label="Account Settings"
                onClick={() => setMenuOpen(false)}
              />

              <div className="h-px bg-[#1a1a1a] my-1" />

              <button
                onClick={handleSignOut}
                className="w-full text-left px-5 py-2.5 text-[12px] text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer font-medium"
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
      className={`h-full flex items-center px-1 transition-colors duration-200 relative text-[16px] font-medium cursor-pointer tracking-tight ${
        active ? "text-white" : "text-zinc-500 hover:text-white"
      }`}
    >
      {children}
      {active && (
        <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-white" />
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
      className="flex items-center px-5 py-2.5 text-[12px] text-zinc-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer font-medium"
    >
      {label}
    </Link>
  );
}
