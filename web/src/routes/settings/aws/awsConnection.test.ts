import { describe, expect, it } from "vitest";
import type { CloudConnection } from "@/lib/types";
import {
  DEFAULT_BUDGET,
  DEFAULT_REGION,
  EMPTY_FORM,
  REGIONS,
  consoleUrl,
  formProblem,
  regionLabel,
  roleArnProblem,
  stageOf,
} from "./awsConnection";

const valid = { ...EMPTY_FORM, email: "me@example.com" };

function connection(over: Partial<CloudConnection> = {}): CloudConnection {
  return {
    id: "c1",
    provider: "aws",
    status: "pending",
    region: "us-east-1",
    stack_name: "hatch-connect",
    monthly_budget_usd: 10,
    budget_email: "me@example.com",
    certificate_arn: null,
    role_arn: null,
    aws_account_id: null,
    template_version: null,
    template_up_to_date: null,
    serves_https: null,
    last_error: null,
    last_verified_at: null,
    created_at: "2026-10-25T00:00:00Z",
    ...over,
  };
}

describe("formProblem", () => {
  it("accepts the defaults with an email", () => {
    expect(formProblem(valid)).toBeNull();
    expect(EMPTY_FORM.region).toBe(DEFAULT_REGION);
    expect(EMPTY_FORM.budget).toBe(DEFAULT_BUDGET);
  });

  it("offers only regions it can name", () => {
    expect(formProblem({ ...valid, region: "mars-1" })).toMatch(/region/i);
    for (const region of REGIONS) expect(formProblem({ ...valid, region: region.value })).toBeNull();
  });

  it("wants a whole number of dollars, at least one", () => {
    for (const budget of ["", "0", "-5", "2.5", "ten", "1e3", " "]) {
      expect(formProblem({ ...valid, budget }), JSON.stringify(budget)).toMatch(/whole number/);
    }
    expect(formProblem({ ...valid, budget: " 25 " })).toBeNull();
  });

  it("wants an email address", () => {
    for (const email of ["", "me", "me@", "me@example", "a b@example.com"]) {
      expect(formProblem({ ...valid, email }), email).toMatch(/email/i);
    }
  });

  it("takes an optional certificate in the chosen region", () => {
    const arn = (region: string) => `arn:aws:acm:${region}:123456789012:certificate/abc-123`;
    expect(formProblem({ ...valid, certificate: "  " })).toBeNull();
    expect(formProblem({ ...valid, certificate: arn("us-east-1") })).toBeNull();
    expect(formProblem({ ...valid, certificate: arn("eu-west-1") })).toMatch(/must be in us-east-1/);
    expect(formProblem({ ...valid, certificate: "not-an-arn" })).toMatch(/ACM certificate/);
  });

  it("says the first thing to fix", () => {
    expect(formProblem({ ...valid, region: "x", budget: "0", email: "" })).toMatch(/region/i);
  });
});

describe("roleArnProblem", () => {
  it("accepts a role ARN and trims it", () => {
    expect(roleArnProblem("arn:aws:iam::123456789012:role/hatch-control")).toBeNull();
    expect(roleArnProblem("  arn:aws:iam::123456789012:role/hatch-control\n")).toBeNull();
    expect(roleArnProblem("arn:aws-us-gov:iam::123456789012:role/path/hatch-control")).toBeNull();
  });

  it("refuses what is not a role", () => {
    expect(roleArnProblem("")).toMatch(/Paste/);
    for (const bad of ["hatch-control", "arn:aws:iam::123456789012:user/me", "arn:aws:iam::12345:role/x", "arn:aws:s3:::bucket"]) {
      expect(roleArnProblem(bad), bad).toMatch(/not the ARN of an IAM role/);
    }
  });
});

describe("stageOf", () => {
  it("follows the connection through its life", () => {
    expect(stageOf(connection())).toBe("create-stack");
    expect(stageOf(connection({ role_arn: "arn:aws:iam::123456789012:role/hatch-control" }))).toBe("checking");
    expect(stageOf(connection({ status: "error", role_arn: "r", last_error: "no" }))).toBe("failed");
    expect(stageOf(connection({ status: "connected", role_arn: "r" }))).toBe("connected");
  });
});

describe("consoleUrl", () => {
  it("passes an https link and drops anything else", () => {
    expect(consoleUrl(connection({ quick_create_url: "https://us-east-1.console.aws.amazon.com/cloudformation/home" }))).toMatch(/^https:/);
    expect(consoleUrl(connection({ quick_create_url: "javascript:alert(1)" }))).toBeNull();
    expect(consoleUrl(connection())).toBeNull();
  });
});

describe("regionLabel", () => {
  it("names a region, or falls back to its code", () => {
    expect(regionLabel("ap-south-1")).toBe("Asia Pacific (Mumbai)");
    expect(regionLabel("il-central-1")).toBe("il-central-1");
  });
});
