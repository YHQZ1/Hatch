import type { SimpleIcon } from "simple-icons";

/**
 * A brand logo drawn from the simple-icons package, so the app makes no
 * runtime requests to an icon CDN. Pass a hex color (without "#") to override
 * the brand color, or "currentColor" to follow the surrounding text color.
 */
export default function BrandIcon({
  icon,
  color,
  className,
}: {
  icon: SimpleIcon;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      role="img"
      aria-label={icon.title}
      viewBox="0 0 24 24"
      fill={color === "currentColor" ? color : `#${color ?? icon.hex}`}
      className={className}
    >
      <path d={icon.path} />
    </svg>
  );
}
