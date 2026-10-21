export type Line = { text: string; delay: number; tone?: "dim" | "strong" };

/** An illustration of the flow Hatch is being built to deliver. */
export const SCRIPT: Line[] = [
  { text: "Dockerfile          node:24, port 3000", delay: 700, tone: "dim" },
  { text: "Estimated cost      $14.20 per month", delay: 900 },
  { text: "Budget alarm        $20 per month", delay: 350, tone: "dim" },
  { text: "Pause when idle     after 30 minutes", delay: 350, tone: "dim" },
  { text: "Expires             in 7 days", delay: 350, tone: "dim" },
  { text: "Building image", delay: 900 },
  { text: "Pushing to your registry", delay: 1100 },
  { text: "Starting service", delay: 900 },
  { text: "Health check passed", delay: 900 },
  { text: "Live at https://storefront.example.com", delay: 500, tone: "strong" },
];

export const COMMAND = "$ hatch deploy storefront";

