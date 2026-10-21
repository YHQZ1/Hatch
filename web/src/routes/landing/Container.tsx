import type { ReactNode } from "react";

/** Page gutter: content runs close to the edges, capped on very wide screens. */
export default function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto w-full max-w-[1800px] px-6 md:px-10 lg:px-16 ${className}`}
    >
      {children}
    </div>
  );
}
