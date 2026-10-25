import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import SetupChecklist from "./SetupChecklist";
import { setupSteps } from "./setup";

const html = (state: Parameters<typeof setupSteps>[0]) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <SetupChecklist steps={setupSteps(state)} />
    </MemoryRouter>,
  );

const fresh = { appInstalled: false, awsAvailable: true, awsConnected: false, hasProjects: false };

describe("the setup checklist with an optional AWS step", () => {
  it("counts only the required steps", () => {
    // Signed in is done; the App and the first deploy are not; AWS is not counted.
    expect(html(fresh)).toContain("1 of 3");
  });

  it("highlights the next required step and offers AWS beside it as optional", () => {
    const out = html(fresh);
    expect(out).toContain("Install on GitHub");
    expect(out).toContain("Connect AWS");
    expect(out).toContain("Optional");
    // Only one button is the filled, primary one.
    expect(out.match(/bg-accent px-3/g)?.length).toBe(1);
  });

  it("skips past the optional step to the first deploy once the App is installed", () => {
    const out = html({ ...fresh, appInstalled: true });
    expect(out).toContain("New service");
    expect(out).toContain("Connect AWS");
    expect(out.match(/bg-accent px-3/g)?.length).toBe(1);
    expect(out).toContain("2 of 3");
  });

  it("stops offering AWS once it is connected", () => {
    const out = html({ ...fresh, awsConnected: true });
    expect(out).not.toContain("Connect AWS");
    expect(out).not.toContain("Optional");
  });

  it("has no AWS line on a server that cannot connect an account", () => {
    const out = html({ ...fresh, awsAvailable: false });
    expect(out).not.toContain("AWS");
    expect(out).toContain("1 of 3");
  });
});
