import { useRouteTitle } from "@/lib/useRouteTitle";

/**
 * Shown while the first page's code loads. It is the page colour, so nothing
 * flashes, and it already carries the page's title.
 */
export default function InitialLoad() {
  const title = useRouteTitle();

  return (
    <>
      <title>{title}</title>
      <div className="min-h-screen w-full bg-base" />
    </>
  );
}
