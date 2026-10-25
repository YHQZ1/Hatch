import { isChecking } from "@/lib/queries";
import type { CloudConnection } from "@/lib/types";
import { safeHttpUrl } from "@/lib/url";

/** Regions to offer, with where they are. The server accepts any region AWS has. */
export const REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "ca-central-1", label: "Canada (Central)" },
  { value: "sa-east-1", label: "South America (São Paulo)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "eu-west-2", label: "Europe (London)" },
  { value: "eu-west-3", label: "Europe (Paris)" },
  { value: "eu-central-1", label: "Europe (Frankfurt)" },
  { value: "eu-north-1", label: "Europe (Stockholm)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
] as const;

export const DEFAULT_REGION = "us-east-1";
/** The limit suggested for a first account (docs/04-cost-guardrails.md). */
export const DEFAULT_BUDGET = "10";

/** What the form holds; the budget stays text until it is sent. */
export interface ConnectForm {
  region: string;
  budget: string;
  email: string;
  certificate: string;
}

export const EMPTY_FORM: ConnectForm = {
  region: DEFAULT_REGION,
  budget: DEFAULT_BUDGET,
  email: "",
  certificate: "",
};

// These repeat what the server checks, so a mistake is said at once. The server
// has the last word.
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CERTIFICATE = /^arn:aws[a-z-]*:acm:([a-z0-9-]+):\d{12}:certificate\/.+$/;
const ROLE = /^arn:aws[a-z-]*:iam::\d{12}:role\/[A-Za-z0-9_+=,.@/-]+$/;

/** What is wrong with the form, as the first thing to fix, or null when it can be sent. */
export function formProblem(form: ConnectForm): string | null {
  if (!REGIONS.some((region) => region.value === form.region)) return "Choose a region.";
  const budget = Number(form.budget);
  if (!/^\d+$/.test(form.budget.trim()) || budget < 1) {
    return "The monthly limit must be a whole number of dollars, at least 1.";
  }
  if (!EMAIL.test(form.email.trim())) return "Enter the email address that alerts should go to.";
  const certificate = form.certificate.trim();
  if (certificate) {
    const match = CERTIFICATE.exec(certificate);
    if (!match) return "The certificate must be the ARN of an ACM certificate.";
    if (match[1] !== form.region) {
      return `The certificate must be in ${form.region}, the region you chose.`;
    }
  }
  return null;
}

/** What is wrong with a role ARN, or null when it looks like one. */
export function roleArnProblem(value: string): string | null {
  const arn = value.trim();
  if (!arn) return "Paste the ControlRoleArn from the stack's Outputs tab.";
  if (!ROLE.test(arn)) {
    return "That is not the ARN of an IAM role. It looks like arn:aws:iam::123456789012:role/hatch-control.";
  }
  return null;
}

export type Stage =
  /** Made, but the stack is not created or the role not given yet. */
  | "create-stack"
  /** The role is given and Hatch is checking it. */
  | "checking"
  /** The last check failed, and the message says why. */
  | "failed"
  | "connected";

export function stageOf(connection: CloudConnection): Stage {
  if (connection.status === "connected") return "connected";
  if (connection.status === "error") return "failed";
  return isChecking(connection) ? "checking" : "create-stack";
}

/** The link that opens the stack in the AWS console, if the server gave one. */
export function consoleUrl(connection: CloudConnection): string | null {
  return safeHttpUrl(connection.quick_create_url);
}

/** The region's name, or its code when it is one we do not list. */
export function regionLabel(code: string): string {
  return REGIONS.find((region) => region.value === code)?.label ?? code;
}
