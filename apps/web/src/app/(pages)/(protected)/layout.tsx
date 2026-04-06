import Navbar from "@/app/components/Navbar";

export default function PagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-[#080808] flex flex-col relative selection:bg-white selection:text-black font-sans">
      <Navbar />
      <main className="relative z-10 flex-grow">{children}</main>

      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.05]" />
      </div>
    </div>
  );
}
