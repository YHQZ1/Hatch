import Frame from "./Frame";

/** Small illustrations used inside the landing page cards. */

const BOX = "rounded-hatch border border-line-strong px-2.5 py-1.5 text-muted";

export function AccountDiagram() {
  return (
    <div className="w-full max-w-[17rem] text-xs">
      <div className={`${BOX} text-center`}>Hatch</div>
      <div className="mx-auto h-5 w-px bg-accent/60" />
      <div className="rounded-hatch border border-accent/40 p-3">
        <div className="mb-2.5 font-medium text-accent">Your AWS account</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className={BOX}>Service</div>
          <div className={BOX}>Registry</div>
          <div className={BOX}>Network</div>
        </div>
      </div>
    </div>
  );
}

export function BudgetMeter() {
  return (
    <div className="w-full max-w-[17rem] text-xs">
      <div className="flex items-baseline justify-between">
        <span className="text-muted">Monthly budget</span>
        <span className="font-medium text-ink">$20.00</span>
      </div>
      <div className="relative mt-3 h-2 rounded-hatch bg-line">
        <div className="h-full w-0 rounded-hatch bg-accent transition-[width] duration-1000 delay-300 ease-out group-data-[visible=true]/reveal:w-[71%]" />
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-muted">Estimated</span>
        <span className="font-medium text-accent">$14.20 (71%)</span>
      </div>
    </div>
  );
}

export function DockerfileToUrl() {
  return (
    <div className="w-full max-w-[17rem] text-xs">
      <pre className="rounded-hatch border border-line-strong bg-base px-3 py-2.5 font-mono leading-5 text-muted">
        <span className="text-accent">FROM</span> node:24-alpine{"\n"}
        <span className="text-accent">EXPOSE</span> 3000{"\n"}
        <span className="text-accent">CMD</span> [&quot;node&quot;, &quot;server.js&quot;]
      </pre>
      <div className="mx-auto h-4 w-px bg-accent/60" />
      <div className="rounded-hatch border border-accent/40 px-3 py-2 text-center font-medium text-accent">
        storefront.example.com
      </div>
    </div>
  );
}

const ROWS: [string, string][] = [
  ["Compute, 0.25 vCPU", "$9.00"],
  ["Memory, 0.5 GB", "$2.20"],
  ["Load balancer share", "$3.00"],
];

/** A mock of the review step shown before a deploy. */
export function EstimateCard() {
  return (
    <figure className="m-0">
      <Frame>
      <div className="overflow-hidden rounded-hatch border border-line-strong bg-base text-sm">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <span className="font-medium">Review deploy</span>
          <span className="text-xs text-faint">storefront</span>
        </div>
        <div className="space-y-3 px-5 py-5">
          {ROWS.map(([label, value]) => (
            <div key={label} className="flex justify-between text-muted">
              <span>{label}</span>
              <span className="tabular-nums text-ink/90">{value}</span>
            </div>
          ))}
        </div>
        <div className="flex items-baseline justify-between border-t border-line px-5 py-4">
          <span className="font-medium">Estimated total</span>
          <span className="text-lg font-semibold tabular-nums text-accent">
            $14.20<span className="ml-1 text-xs font-normal text-muted">/ month</span>
          </span>
        </div>
        <div className="border-t border-line px-5 py-5">
          <div className="mb-2.5 flex justify-between text-xs text-muted">
            <span>Budget alarm at $20</span>
            <span>71%</span>
          </div>
          <div className="h-2 rounded-hatch bg-line">
            <div className="h-full w-[71%] rounded-hatch bg-accent" />
          </div>
        </div>
        <div className="space-y-3 border-t border-line px-5 py-5 text-muted">
          <div className="flex justify-between">
            <span>Pause when idle</span>
            <span className="text-ink/90">After 30 minutes</span>
          </div>
          <div className="flex justify-between">
            <span>Expires</span>
            <span className="text-ink/90">In 7 days</span>
          </div>
        </div>
        <div className="border-t border-line p-5">
          <div className="flex h-10 items-center justify-center rounded-hatch bg-accent text-sm font-medium text-accent-ink">
            Deploy
          </div>
        </div>
      </div>
      </Frame>
      <figcaption className="mt-4 text-xs text-faint">
        An illustration of the review step. Guardrails are planned.
      </figcaption>
    </figure>
  );
}
