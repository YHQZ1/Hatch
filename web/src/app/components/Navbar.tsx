/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { apiFetch, logout } from "@/app/lib/api";
import { Button, cn } from "./ui";

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

    apiFetch("/api/me")
      .then(async (res) => {
        if (!res.ok) return;
        const payload = await res.json();
        setUser({
          username: payload.username,
          avatar: `https://github.com/${payload.username}.png`,
        });
      })
      .catch(() => {});

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await logout();
    router.push("/");
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/[0.07] bg-black/70 backdrop-blur-xl">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 flex items-center justify-between h-16">
        <div className="flex items-center h-full gap-10">
          <Link
            href="/console"
            className="flex items-center gap-3.5 group cursor-pointer"
          >
            <div className="w-8 h-8 flex items-center justify-center">
              <img
                src="https://cdn.simpleicons.org/habr/FFFFFF"
                alt="Hatch Logo"
                className="w-full h-full"
              />
            </div>
            <span className="font-bold tracking-tighter text-xl uppercase text-white">
              Hatch
            </span>
          </Link>

          <div className="hidden md:flex items-center h-full gap-1">
            <NavLink href="/console" active={pathname === "/console"}>
              Console
            </NavLink>
            <NavLink href="/activity" active={pathname === "/activity"}>
              Activity
            </NavLink>
            <NavLink
              href="/insights"
              active={pathname === "/insights"}
            >
              Insights
            </NavLink>
          </div>
        </div>

        <div className="flex items-center h-full gap-3 sm:gap-5 relative" ref={menuRef}>
          <Button href="/new" variant="primary" className="hidden sm:inline-flex">
            <span className="text-sm">+</span>
            New
          </Button>

          <div className="hidden sm:block h-5 w-px bg-white/[0.08]" />

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
                <img
                  src={user.avatar}
                  className={`w-8 h-8 rounded-md border transition-all duration-200 ${
                    menuOpen
                      ? "border-white"
                      : "border-white/[0.1] group-hover:border-white/35"
                  }`}
                  alt="Profile"
                />
              </div>
            )}
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+10px)] w-60 bg-[#090909]/95 border border-white/[0.08] shadow-2xl py-2 z-[60] rounded-xl overflow-hidden backdrop-blur-xl">
              <div className="px-5 py-4 border-b border-white/[0.07] mb-1">
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

              <div className="h-px bg-white/[0.07] my-1" />

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
      className={cn(
        "relative flex h-9 items-center px-3 text-sm font-medium tracking-tight transition-colors cursor-pointer",
        active
          ? "text-white after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-white"
          : "text-zinc-500 hover:text-white",
      )}
    >
      {children}
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
      className="flex items-center px-5 py-2.5 text-[12px] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer font-medium"
    >
      {label}
    </Link>
  );
}
