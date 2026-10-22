import { useState } from "react";
import Logo from "@/components/Logo";
import { cn } from "@/lib/cn";

/**
 * A project's icon: the one its site declares, which Hatch fetches from the
 * running app. Until that arrives, and when the site has none (a backend with
 * no pages, an app that is not running), it shows the Hatch logo instead, so the space never changes size.
 */
export default function ProjectIcon({
  projectId,
  /** Changes when the app is redeployed, so a new icon is asked for. */
  version,
  /** Whether the app is running; there is nothing to ask for otherwise. */
  running,
  size = 40,
  className,
}: {
  projectId: string;
  version?: string;
  running: boolean;
  size?: number;
  className?: string;
}) {
  const src = running
    ? `/api/projects/${projectId}/icon${version ? `?v=${encodeURIComponent(version)}` : ""}`
    : null;

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-hatch border border-line-strong bg-panel text-faint",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Logo className="h-[56%] w-[56%]" />
      {/* Keyed by address, so a new icon starts from "not loaded yet". */}
      {src && <LoadedIcon key={src} src={src} />}
    </span>
  );
}

function LoadedIcon({ src }: { src: string }) {
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  if (state === "missing") return null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onLoad={() => setState("ready")}
      onError={() => setState("missing")}
      className={cn(
        "absolute inset-0 h-full w-full bg-base object-contain p-[18%]",
        state === "loading" && "opacity-0",
      )}
    />
  );
}
