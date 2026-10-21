import { Outlet } from "react-router";
import Navbar from "./Navbar";

/** The signed-in shell. Pages redirect to /auth themselves on a 401. */
export default function ProtectedLayout() {
  return (
    <div className="min-h-screen w-full bg-[#050505] flex flex-col relative selection:bg-white selection:text-black font-sans">
      <Navbar />
      <main className="relative z-10 flex-grow overflow-x-hidden">
        <Outlet />
      </main>

      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.018]" />
      </div>
    </div>
  );
}
