import { cn } from "@/lib/cn";

/**
 * A bar chart of requests per minute, newest on the right. Errors are drawn in
 * the danger colour over the part of the bar they make up. It is a picture of
 * the shape of the hour: the label says the numbers.
 */
export default function Sparkline({
  requests,
  errors,
  label,
  className,
}: {
  requests: number[];
  errors: number[];
  /** Read out instead of the picture, for screen readers. */
  label: string;
  className?: string;
}) {
  const max = Math.max(1, ...requests);
  const count = Math.max(1, requests.length);
  const height = 24;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${count} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full", className)}
    >
      {requests.map((value, i) => {
        if (value === 0) {
          // A quiet minute is a hairline, so the chart still shows its width.
          return <rect key={i} x={i + 0.15} y={height - 0.6} width={0.7} height={0.6} className="fill-line-strong" />;
        }
        const barHeight = Math.max(1.5, (value / max) * height);
        const errorHeight = Math.min(barHeight, (errors[i] ?? 0) > 0 ? Math.max(1, ((errors[i] ?? 0) / value) * barHeight) : 0);
        return (
          <g key={i}>
            <rect x={i + 0.15} y={height - barHeight} width={0.7} height={barHeight} className="fill-accent" />
            {errorHeight > 0 && (
              <rect x={i + 0.15} y={height - errorHeight} width={0.7} height={errorHeight} className="fill-danger" />
            )}
          </g>
        );
      })}
    </svg>
  );
}
