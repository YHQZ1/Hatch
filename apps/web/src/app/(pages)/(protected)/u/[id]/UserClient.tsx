/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { PageHeader } from "../../../../components/PageHeader";
import { PageLoadingState } from "../../../../components/LoadingState";

interface UserSession {
  username: string;
  avatar: string;
  github_id?: number;
  user_id?: string;
}

const CACHE_KEY = "hatch_profile_cache";
const CACHE_TTL = 5 * 60 * 1000;

export default function ProfileClient() {
  const router = useRouter();
  const params = useParams();
  const { id } = params;

  const [user, setUser] = useState<UserSession | null>(null);
  const [stats, setStats] = useState({ projects: 0 });
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem("hatch_token");
    if (!token) {
      router.push("/auth");
      return;
    }

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUser({
        username: id as string,
        avatar: `https://github.com/${id}.png`,
        github_id: payload.username === id ? payload.github_id : undefined,
        user_id: payload.username === id ? payload.user_id : undefined,
      });

      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Date.now() - (parsed.timestamp || 0) < CACHE_TTL) {
            setStats(parsed.stats || { projects: 0 });
            setLoading(false);
          }
        } catch {}
      }

      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          const s = { projects: Array.isArray(data) ? data.length : 0 };
          setStats(s);
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ stats: s, timestamp: Date.now() }),
          );
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } catch {
      router.push("/auth");
    }
  }, [id, router]);

  const handleSignOut = () => {
    [
      "hatch_token",
      "hatch_projects_cache",
      "hatch_infrastructure_cache",
      "hatch_activity_cache",
      CACHE_KEY,
    ].forEach((k) => localStorage.removeItem(k));
    router.push("/");
  };

  const copy = (val: string, key: string) => {
    navigator.clipboard.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };

  if (!mounted) return <PageLoadingState />;
  if (!user) return <PageLoadingState />;

  return (
    <div className="w-full min-h-screen bg-black text-white">
      <main className="w-full px-8 lg:px-10 py-8">
        <PageHeader
          title="Account"
          description="Manage your profile and preferences"
          actionLabel="Sign out"
          onAction={handleSignOut}
        />

        <div className="space-y-0">
          <Section title="Profile">
            <div className="flex items-center gap-6 py-6 border-b border-[#111]">
              <img
                src={user.avatar}
                alt={user.username}
                className="w-20 h-20 rounded-[3px] border border-[#1a1a1a] flex-shrink-0"
              />
              <div>
                <p className="text-[22px] font-medium text-white tracking-tight">
                  {user.username}
                </p>
                <a
                  href={`https://github.com/${user.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-zinc-600 font-mono hover:text-zinc-400 transition-colors mt-0.5 block"
                >
                  github.com/{user.username}
                </a>
              </div>
            </div>

            <Row label="Username" value={user.username} />
            <Row label="Auth Method" value="GitHub OAuth 2.0" />
          </Section>

          <Section title="Account Details">
            <Row
              label="User ID"
              value={user.user_id ?? "—"}
              mono
              copyable={!!user.user_id}
              onCopy={() => user.user_id && copy(user.user_id, "user_id")}
              copied={copied === "user_id"}
            />
            <Row
              label="GitHub ID"
              value={user.github_id ? String(user.github_id) : "—"}
              mono
              copyable={!!user.github_id}
              onCopy={() =>
                user.github_id && copy(String(user.github_id), "ghid")
              }
              copied={copied === "ghid"}
            />
            <Row
              label="Total Projects"
              value={loading ? "—" : String(stats.projects)}
            />
            <Row label="Plan" value="Standard" />
            <Row label="Region" value="ap-south-1" />
          </Section>

          <Section title="Connections">
            <div className="py-4">
              <div className="flex items-center justify-between py-5 px-6 border border-[#1a1a1a] bg-[#050505] rounded-[3px]">
                <div className="flex items-center gap-5">
                  <img
                    src="https://cdn.simpleicons.org/github/555555"
                    className="w-6 h-6 flex-shrink-0"
                    alt="GitHub"
                  />
                  <div>
                    <p className="text-[15px] font-medium text-white">GitHub</p>
                    <p className="text-[12px] text-zinc-600 font-mono mt-0.5">
                      @{user.username}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#4ade80]">
                    Connected
                  </span>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Danger Zone">
            <div className="py-4">
              <div className="flex items-center justify-between py-5 px-6 border border-[#1a1a1a] rounded-[3px]">
                <div>
                  <p className="text-[15px] font-medium text-white">
                    Delete Account
                  </p>
                  <p className="text-[12px] text-zinc-500 mt-1.5 leading-relaxed">
                    Permanently removes your account, all services, and
                    infrastructure.
                  </p>
                </div>
                <button className="ml-10 flex-shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-600 hover:text-zinc-400 border border-[#1a1a1a] hover:border-zinc-700 px-6 py-3 transition-all cursor-pointer">
                  Delete
                </button>
              </div>
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pb-8 pt-6 border-b border-[#111]">
      <p className="text-[16px] font-bold uppercase tracking-[0.2em] text-zinc-600 mb-5">
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  copyable,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="flex items-center py-4 border-b border-[#111] group">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-600 w-48 flex-shrink-0">
        {label}
      </span>
      <span
        className={`flex-1 text-[14px] ${mono ? "font-mono text-zinc-400" : "text-zinc-300"}`}
      >
        {value}
      </span>
      {copyable && onCopy && (
        <button
          onClick={onCopy}
          className="ml-4 text-[10px] font-bold uppercase tracking-widest flex-shrink-0 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}
