import { Outlet, useMatches } from "react-router";

const DEFAULT_TITLE = "Hatch — Deploys in your own AWS account";

/** Wraps every page: sets the document title and draws the page backdrop. */
export default function RootLayout() {
  const matches = useMatches();
  const routeTitle = matches
    .map((match) => (match.handle as { title?: string } | undefined)?.title)
    .findLast(Boolean);

  return (
    <>
      <title>{routeTitle ? `${routeTitle} | Hatch` : DEFAULT_TITLE}</title>

      <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)] opacity-20" />
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-white opacity-[0.02] blur-[120px] rounded-full" />
      </div>

      <main className="flex-grow flex flex-col w-full relative z-0">
        <Outlet />
      </main>
    </>
  );
}
