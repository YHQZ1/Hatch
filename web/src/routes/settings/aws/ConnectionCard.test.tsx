import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CloudConnection } from "@/lib/types";
import ConnectForm from "./ConnectForm";
import ConnectionCard from "./ConnectionCard";
import type { ConnectionActions } from "./useConnectionActions";

const ROLE = "arn:aws:iam::123456789012:role/hatch-control";
const LINK = "https://ap-south-1.console.aws.amazon.com/cloudformation/home?region=ap-south-1#/stacks/quickcreate?stackName=hatch-connect";

function connection(over: Partial<CloudConnection> = {}): CloudConnection {
  return {
    id: "c1",
    provider: "aws",
    status: "pending",
    region: "ap-south-1",
    stack_name: "hatch-connect",
    monthly_budget_usd: 25,
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
    quick_create_url: LINK,
    ...over,
  };
}

const actions = (busy: string | null = null): ConnectionActions => ({
  busy,
  create: vi.fn(),
  giveRole: vi.fn(),
  checkAgain: vi.fn(),
  remove: vi.fn(),
});

const html = (c: CloudConnection, busy: string | null = null) =>
  renderToStaticMarkup(<ConnectionCard connection={c} actions={actions(busy)} />);

describe("a connection with no role yet", () => {
  const out = html(connection());

  it("names the region and offers the link that creates the stack", () => {
    expect(out).toContain("Asia Pacific (Mumbai)");
    expect(out).toContain("ap-south-1");
    expect(out).toContain(`href="${LINK.replace(/&/g, "&amp;")}"`);
    expect(out).toContain("Open in the AWS console");
  });

  it("tells the user about the IAM acknowledgement and where the role is", () => {
    expect(out).toMatch(/IAM roles/);
    expect(out).toContain("ControlRoleArn");
    expect(out).toContain("Check the connection");
  });
});

describe("a link the server should not have sent", () => {
  it("is not made clickable, and the page says what to do", () => {
    const out = html(connection({ quick_create_url: "javascript:alert(1)" }));
    expect(out).not.toContain("javascript:");
    expect(out).toMatch(/could not build the link/);
  });
});

describe("a connection being checked", () => {
  it("shows the role and that it is working, with nothing to click", () => {
    const out = html(connection({ role_arn: ROLE }));
    expect(out).toContain(ROLE);
    expect(out).toContain("Working…");
    expect(out).not.toContain("Open in the AWS console");
  });
});

describe("a connection whose check failed", () => {
  const failed = connection({
    status: "error",
    role_arn: ROLE,
    last_error: "the stack is still being set up (CREATE_IN_PROGRESS); try again when it finishes",
  });

  it("says why, in the server's words, and offers to check again", () => {
    const out = html(failed);
    expect(out).toContain("still being set up");
    expect(out).toContain('role="alert"');
    expect(out).toContain("Check again");
    expect(out).toContain(`value="${ROLE}"`);
  });

  it("keeps the link, in case the stack was never created", () => {
    expect(html(failed)).toContain("Stack not created yet?");
  });

  it("does not hide the message when the server gave none", () => {
    expect(html({ ...failed, last_error: null })).toContain("The check did not pass.");
  });

  it("disables the buttons while another action is under way", () => {
    expect(html(failed, "some-other-id")).toMatch(/<button[^>]*disabled=""[^>]*>Check again/);
  });
});

describe("a connected account", () => {
  const connected = connection({
    status: "connected",
    role_arn: ROLE,
    aws_account_id: "123456789012",
    template_version: "1",
    template_up_to_date: true,
    serves_https: false,
    last_verified_at: "2026-10-25T09:00:00Z",
    quick_create_url: undefined,
  });

  it("shows the account, the budget alert and that it is up to date", () => {
    const out = html(connected);
    expect(out).toContain("123456789012");
    expect(out).toContain("$25 a month");
    expect(out).toContain("me@example.com");
    expect(out).toContain("Up to date");
    expect(out).not.toContain("Open in the AWS console");
  });

  it("warns that HTTP-only is not encrypted, and shows HTTPS when it is", () => {
    const http = html(connected);
    expect(http).toContain("HTTP only");
    expect(http).toContain("not encrypted");
    expect(http).toContain("text-warning");

    const https = html({ ...connected, serves_https: true });
    expect(https).toContain(">HTTPS<");
    expect(https).not.toContain("not encrypted");
  });

  it("says when the stack came from an older template, without calling it broken", () => {
    const out = html({ ...connected, template_up_to_date: false });
    expect(out).toContain("An older version");
    expect(out).toContain("still works");
  });

  it("never offers the removal as harmless to the bill", () => {
    // The text of the confirmation is in the modal, which is closed here; the row
    // that opens it must say AWS is left alone.
    expect(html(connected)).toContain("Nothing in your AWS account changes");
  });
});

describe("the form that starts a connection", () => {
  const out = renderToStaticMarkup(<ConnectForm busy={false} onSubmit={vi.fn()} />);

  it("states the fixed cost before anything is created, without a made-up number", () => {
    expect(out).toContain("billed by the hour");
    expect(out).toContain("https://aws.amazon.com/elasticloadbalancing/pricing/");
    expect(out).not.toMatch(/\$\s?\d+\.\d+|per month|\/mo\b/i);
  });

  it("starts with a suggested limit and explains the certificate is optional", () => {
    expect(out).toContain('value="10"');
    expect(out).toContain("(optional)");
    expect(out).toContain("plain HTTP");
  });

  it("offers Cancel only for an extra connection", () => {
    expect(out).not.toContain("Cancel");
    expect(renderToStaticMarkup(<ConnectForm busy={false} onSubmit={vi.fn()} onCancel={vi.fn()} />)).toContain("Cancel");
  });

  it("waits while creating", () => {
    expect(renderToStaticMarkup(<ConnectForm busy onSubmit={vi.fn()} />)).toContain("Creating…");
  });
});
