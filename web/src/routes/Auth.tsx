import { Link } from "react-router";
import { useTheme } from "@/lib/theme";
import AuthScene from "./auth/AuthScene";
import SignInCard from "./auth/SignInCard";
import Frame from "./landing/Frame";

export default function AuthPage() {
  // The theme is whatever the visitor chose on the landing page.
  const { theme } = useTheme();

  return (
    <div
      data-theme={theme}
      style={{ colorScheme: theme }}
      className="relative flex min-h-screen w-full flex-col overflow-hidden bg-base text-ink"
    >
      <AuthScene />

      <Link
        to="/"
        className="absolute left-6 top-6 z-10 flex items-center gap-2.5 md:left-10 lg:left-16"
      >
        <img src="/hatch.svg" alt="" className="theme-logo h-7 w-7" />
        <span className="text-lg font-semibold tracking-tight">Hatch</span>
      </Link>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-16">
        <div className="animate-rise w-full max-w-md">
          <Frame>
            <div className="rounded-hatch border border-line-strong bg-base p-8 md:p-10">
              <SignInCard />
            </div>
          </Frame>
        </div>
      </main>
    </div>
  );
}
