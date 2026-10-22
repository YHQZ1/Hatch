import { describe, expect, it } from "vitest";
import { parseLogLine, statusFromLogLine } from "./logs";

describe("parseLogLine", () => {
  it("colours a line by what it says", () => {
    expect(parseLogLine("Image successfully pushed").type).toBe("success");
    expect(parseLogLine("Deployment live at http://a.localhost:8081").type).toBe("success");
    expect(parseLogLine("Deployment failed: the container stopped").type).toBe("error");
    expect(parseLogLine("[system] starting").type).toBe("system");
    expect(parseLogLine("#26 DONE 0.0s").type).toBe("muted");
  });

  it("keeps the text as it came", () => {
    expect(parseLogLine("  indented  ").text).toBe("  indented  ");
  });
});

describe("statusFromLogLine", () => {
  it("reads the stage a line announces", () => {
    expect(statusFromLogLine("Syncing source code...")).toBe("building");
    expect(statusFromLogLine("Starting Docker build...")).toBe("building");
    expect(statusFromLogLine("Triggering deployment orchestration...")).toBe("deploying");
    expect(statusFromLogLine("Deployment live at http://x")).toBe("live");
    expect(statusFromLogLine("Deployment failed: boom")).toBe("failed");
    expect(statusFromLogLine("Deployment canceled by user")).toBe("canceled");
  });

  it("says nothing for an ordinary line", () => {
    expect(statusFromLogLine("#26 DONE 0.0s")).toBeNull();
  });
});
