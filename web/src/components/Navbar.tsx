import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { logout } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAwsConnection } from "@/lib/aws";
import { meQuery } from "@/lib/queries";
import type { Theme } from "@/lib/theme";
import Container from "./Container";
import ThemeToggle from "./ThemeToggle";
import { Button } from "./ui";

interface NavItem {
  label: string;
  href: string;
  /** Whether the current path belongs to this section. */
  active: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Overview",
    href: "/overview",
    // A project's own pages and the flow that adds one belong to the Overview.
    active: (p) => p === "/overview" || p === "/new" || p.startsWith("/projects/"),
  },
  // A single deployment's page belongs to the Deployments.
  { label: "Deployments", href: "/deployments", active: (p) => p === "/deployments" || p.startsWith("/deployments/") },
  { label: "Cost", href: "/cost", active: (p) => p === "/cost" },
  { label: "Resources", href: "/resources", active: (p) => p === "/resources" },
  { label: "Settings", href: "/settings", active: (p) => p.startsWith("/settings") },
];

export default function Navbar({
  theme,
  onToggleTheme,
}: {
  theme: Theme;
  onToggleTheme: (origin: { x: number; y: number }) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useLocation().pathname;
  const username = useQuery(meQuery()).data?.username;
  const aws = useAwsConnection();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // With seven tabs the bar can scroll: keep the current one in view.
  useEffect(() => {
    tabsRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  const handleSignOut = async () => {
    await logout();
    queryClient.clear();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-base/80 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between">
        {/* Seven tabs can outgrow the bar on a small screen, so the tabs scroll. */}
        <nav
          ref={tabsRef}
          className="flex h-full min-w-0 items-center gap-6 overflow-x-auto text-sm [scrollbar-width:none] max-md:[mask-image:linear-gradient(to_right,#000_88%,transparent)] md:gap-7 [&::-webkit-scrollbar]:hidden"
        >
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.label} href={item.href} active={item.active(pathname)}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="relative flex shrink-0 items-center gap-3 pl-4" ref={menuRef}>
          <Link
            to="/settings?section=aws"
            className="hidden h-10 min-w-[10.5rem] items-center justify-center gap-2 rounded-hatch border border-line-strong px-3 text-sm text-muted transition-colors hover:border-ink/40 hover:text-ink xl:flex"
          >
            <span
              aria-hidden
              className={cn("h-1.5 w-1.5 rounded-full", aws.connected ? "bg-success" : "bg-faint")}
            />
            {aws.loading ? "AWS" : aws.connected ? "AWS connected" : "AWS not connected"}
          </Link>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <div className="hidden sm:block">
            <Button href="/new" variant="primary" className="h-10">
              New project
            </Button>
          </div>

          <button
            type="button"
            aria-label="Account menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
            className={cn(
              "flex h-10 items-center gap-3 rounded-hatch border px-1.5 pr-3 transition-colors",
              menuOpen ? "border-accent" : "border-line-strong hover:border-ink/40",
            )}
          >
            {username ? (
              <img
                src={`https://github.com/${username}.png?size=64`}
                alt=""
                className="h-7 w-7 rounded-[2px]"
              />
            ) : (
              <span className="h-7 w-7 rounded-[2px] bg-line" />
            )}
            <span className="hidden text-sm text-muted xl:block">{username ?? "…"}</span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+10px)] z-[60] w-60 overflow-hidden rounded-hatch border border-line-strong bg-base shadow-2xl">
              <div className="border-b border-line px-4 py-3.5">
                <p className="truncate text-sm font-medium">{username}</p>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
                  Personal account
                </p>
              </div>
              <Link
                to="/new"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2.5 text-sm text-accent transition-colors hover:bg-ink/5 hover:text-accent-hover sm:hidden"
              >
                New project
              </Link>
              <Link
                to="/settings"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2.5 text-sm text-muted transition-colors hover:bg-ink/5 hover:text-ink"
              >
                Settings
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full border-t border-line px-4 py-2.5 text-left text-sm text-muted transition-colors hover:bg-ink/5 hover:text-ink"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </Container>
    </header>
  );
}

function NavLink({
  href,
  children,
  active,
}: {
  href: string;
  children: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      to={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-full shrink-0 items-center whitespace-nowrap transition-colors",
        active
          ? "text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-accent"
          : "text-muted hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
