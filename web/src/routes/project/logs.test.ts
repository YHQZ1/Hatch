import { describe, expect, it } from "vitest";
import { MAX_SHOWN, appendLines, parseLogLine } from "./logs";

describe("parseLogLine", () => {
  it("colours a line by what it says", () => {
    expect(parseLogLine("Image successfully pushed", 1).type).toBe("success");
    expect(parseLogLine("Deployment live at http://a.localhost:8081", 2).type).toBe("success");
    expect(parseLogLine("Deployment failed: the container stopped", 3).type).toBe("error");
    expect(parseLogLine("[system] starting", 4).type).toBe("system");
    expect(parseLogLine("#26 DONE 0.0s", 5).type).toBe("muted");
  });

  it("keeps the text as it came, and its number", () => {
    expect(parseLogLine("  indented  ", 42)).toMatchObject({ text: "  indented  ", seq: 42 });
  });
});

describe("appendLines", () => {
  const line = (seq: number) => parseLogLine(`line ${seq}`, seq);

  it("adds lines in order and leaves the old list alone", () => {
    const before = [line(1), line(2)];
    const after = appendLines(before, [line(3)]);
    expect(after.map((l) => l.seq)).toEqual([1, 2, 3]);
    expect(before).toHaveLength(2);
  });

  it("returns the same list when nothing was added", () => {
    const before = [line(1)];
    expect(appendLines(before, [])).toBe(before);
  });

  it("keeps only the newest lines once there are too many", () => {
    const many = Array.from({ length: MAX_SHOWN + 10 }, (_, i) => line(i + 1));
    const kept = appendLines([], many);
    expect(kept).toHaveLength(MAX_SHOWN);
    expect(kept[0].seq).toBe(11);
    expect(kept[kept.length - 1].seq).toBe(MAX_SHOWN + 10);
  });
});
