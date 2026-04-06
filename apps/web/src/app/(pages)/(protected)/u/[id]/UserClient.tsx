/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

interface UserSession {
  username: string;
  avatar: string;
  github_id?: number;
  user_id?: string;
}

export default function ProfileClient() {
  const router = useRouter();
  const params = useParams();
  const { id } = params; // Extracts the 'id' (username) from the URL /u/[id]

  const [user, setUser] = useState<UserSession | null>(null);
  const [stats, setStats] = useState({ projects: 0 });
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem("hatch_token");
    if (!token) {
      router.push("/auth");
      return;
    }

    try {
      // Decode token to verify if the user is viewing their own profile
      const payload = JSON.parse(atob(token.split(".")[1]));

      // We use the 'id' from params to drive the UI
      setUser({
        username: id as string,
        avatar: `https://github.com/${id}.png`,
        github_id: payload.username === id ? payload.github_id : null,
        user_id: payload.username === id ? payload.user_id : null,
      });

      // Fetch stats for the specific user ID
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setStats({ projects: data.length });
          }
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } catch (err) {
      router.push("/auth");
    }
  }, [id, router]);

  const handleSignOut = () => {
    localStorage.removeItem("hatch_token");
    router.push("/");
  };

  if (!mounted || !user) return <div className="min-h-screen bg-black" />;

  return (
    <div className="min-h-screen w-full bg-black text-white selection:bg-white selection:text-black">
      <main className="w-full px-6 lg:px-10 py-10 max-w-[1400px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24">
          {/* ── LEFT: IDENTITY BLOCK (4 Cols) ── */}
          <section className="lg:col-span-4 space-y-10">
            <div className="space-y-8">
              <div className="relative inline-block">
                <img
                  src={user.avatar}
                  alt={user.username}
                  className="w-40 h-40 rounded-[2px] border border-[#1a1a1a] shadow-2xl transition-transform hover:scale-[1.02]"
                />
                <div className="absolute -bottom-4 -right-4 bg-black border border-[#1a1a1a] p-3 shadow-2xl">
                  <img
                    src="https://cdn.simpleicons.org/github/FFFFFF"
                    className="w-5 h-5 opacity-80"
                    alt="GitHub"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <h1 className="text-6xl font-medium tracking-tighter uppercase leading-none">
                  {user.username}
                </h1>
                <p className="font-mono text-[11px] text-zinc-500 uppercase tracking-[0.5em]">
                  Registry Identity
                </p>
              </div>
            </div>

            {/* QUICK STAT GRID */}
            <div className="grid grid-cols-1 gap-px bg-[#1a1a1a] border border-[#1a1a1a] rounded-[2px] overflow-hidden shadow-xl">
              <SidebarStat
                label="Total Projects"
                value={loading ? "..." : String(stats.projects)}
              />
              <SidebarStat label="Primary Region" value="ap-south-1" />
              <SidebarStat label="Plan Status" value="Standard" />
            </div>

            <button
              onClick={handleSignOut}
              className="w-full h-12 border border-zinc-900 text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-white hover:text-black transition-all rounded-[2px] cursor-pointer"
            >
              Terminate Session
            </button>
          </section>

          {/* ── RIGHT: TECHNICAL MANIFEST (8 Cols) ── */}
          <section className="lg:col-span-8 space-y-20">
            {/* METADATA SECTION */}
            <div className="space-y-10">
              <div className="flex items-center justify-between border-b border-[#1a1a1a] pb-6">
                <h2 className="text-[12px] font-bold uppercase tracking-[0.5em] text-zinc-600">
                  Account_Manifest
                </h2>
                <span className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
                  v2.4.0-Stable
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-20 gap-y-12">
                <ManifestField label="GitHub Handle" value={user.username} />
                <ManifestField
                  label="Provider Identifier"
                  value={String(user.github_id || "Auth_Restricted")}
                />
                <ManifestField
                  label="Platform UID"
                  value={user.user_id || "Internal_System"}
                />
                <ManifestField label="Auth Protocol" value="OAuth 2.0 / JWT" />
              </div>
            </div>

            {/* CONNECTION STATUS */}
            <div className="space-y-10">
              <h2 className="text-[12px] font-bold uppercase tracking-[0.5em] text-zinc-600 border-b border-[#1a1a1a] pb-6">
                System_Connectivity
              </h2>
              <div className="p-10 border border-[#1a1a1a] bg-[#050505] flex flex-col md:flex-row md:items-center justify-between gap-8 group hover:border-zinc-700 transition-all rounded-[2px]">
                <div className="flex items-center gap-8">
                  <img
                    src="https://cdn.simpleicons.org/github/FFFFFF"
                    className="w-10 h-10 opacity-30 group-hover:opacity-100 transition-all"
                    alt="GH"
                  />
                  <div className="space-y-1">
                    <p className="text-xl font-medium tracking-tight">
                      GitHub Infrastructure
                    </p>
                    <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                      Status: Fully_Functional
                    </p>
                  </div>
                </div>
                <div className="px-5 py-2 border border-zinc-800 rounded-sm bg-black group-hover:border-zinc-600 transition-colors">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-tighter">
                    Handshake_Verified
                  </span>
                </div>
              </div>
            </div>

            {/* VISUAL FILLER */}
            <div className="pt-16 select-none pointer-events-none opacity-[0.02]">
              <h3 className="text-[180px] font-bold tracking-tighter leading-none uppercase -ml-4">
                HATCH
              </h3>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function SidebarStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black p-8 space-y-2 group transition-colors hover:bg-[#050505]">
      <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest block">
        {label}
      </span>
      <p className="text-3xl font-medium tracking-tighter text-zinc-200 group-hover:text-white transition-colors">
        {value}
      </p>
    </div>
  );
}

function ManifestField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-3 group">
      <p className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest group-hover:text-zinc-500 transition-colors">
        {label}
      </p>
      <p className="text-base font-medium text-zinc-300 border-b border-zinc-900 pb-3 truncate group-hover:text-white transition-colors">
        {value}
      </p>
    </div>
  );
}
