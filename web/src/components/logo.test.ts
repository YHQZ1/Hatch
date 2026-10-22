import { describe, expect, it } from "vitest";
import svg from "../../public/hatch.svg?raw";
import { LOGO_COLOURS } from "./logoColours";

// styles.css recolours the logo by matching the colours written in
// public/hatch.svg, so the file may only use colours it has a rule for.
describe("the logo file", () => {
  const used = [...svg.matchAll(/(?:stroke|fill)="(#[0-9a-fA-F]+)"/g)].map((m) => m[1]);

  it("is drawn only in colours the stylesheet knows how to recolour", () => {
    expect(used.length).toBeGreaterThan(0);
    for (const colour of used) {
      expect(LOGO_COLOURS, `hatch.svg uses ${colour}: add it to logoColours.ts and a .hatch-logo rule in styles.css`).toContain(colour);
    }
  });

  it("draws nothing that an attribute selector cannot reach", () => {
    expect(svg).not.toMatch(/<style|style="/);
  });
});
