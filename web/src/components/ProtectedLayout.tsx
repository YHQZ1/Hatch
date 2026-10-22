import { Outlet } from "react-router";
import { useTheme } from "@/lib/theme";
import Navbar from "./Navbar";

/**
 * The signed-in shell. Pages redirect to /auth themselves on a 401. They read
 * the visitor's theme through the design tokens (see styles.css).
 */
export default function ProtectedLayout() {
  const { theme, toggle } = useTheme();

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-base font-sans text-ink">
      <div
        aria-hidden
        className="bg-line-grid pointer-events-none absolute inset-x-0 top-0 h-[520px] [mask-image:linear-gradient(to_bottom,#000,transparent)]"
      />
      <Navbar theme={theme} onToggleTheme={toggle} />
      <main className="relative z-10 flex-grow overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
