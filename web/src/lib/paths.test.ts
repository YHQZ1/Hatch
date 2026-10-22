import { describe, expect, it } from "vitest";
import { deploymentPath, deploymentRef, findProject, projectPath, projectRef, settingsPath } from "./paths";

const shop = { id: "d9b6bfdc-6ccb-4893-a337-96adc5c6725f", subdomain: "shop" };
const unnamed = { id: "11111111-2222-3333-4444-555555555555", subdomain: null };

describe("paths", () => {
  it("names a project by its address name", () => {
    expect(projectPath(shop)).toBe("/projects/shop");
    expect(settingsPath(shop)).toBe("/projects/shop/settings");
    expect(projectRef(shop)).toBe("shop");
  });

  it("falls back to the id for a project without one", () => {
    expect(projectPath(unnamed)).toBe("/projects/11111111-2222-3333-4444-555555555555");
    expect(projectRef({ id: "x", subdomain: "" })).toBe("x");
  });

  it("keeps odd characters from changing the address", () => {
    expect(projectPath({ id: "x", subdomain: "a/b?c" })).toBe("/projects/a%2Fb%3Fc");
  });

  it("gives a deployment a short address of its own", () => {
    expect(deploymentRef("430b592c-089e-4776-a214-0cbfcd0de2f4")).toBe("430b592c");
    expect(deploymentPath({ id: "430b592c-089e-4776-a214-0cbfcd0de2f4" })).toBe("/deployments/430b592c");
  });
});

describe("findProject", () => {
  const list = [shop, unnamed, { id: "aaaaaaaa-0000-0000-0000-000000000000", subdomain: "blog" }];

  it("finds a project by its name, without regard to case", () => {
    expect(findProject(list, "shop")).toBe(shop);
    expect(findProject(list, "BLOG")?.subdomain).toBe("blog");
  });

  it("finds a project by id, which is how older links and unnamed projects are reached", () => {
    expect(findProject(list, shop.id)).toBe(shop);
    expect(findProject(list, unnamed.id.toUpperCase())).toBe(unnamed);
  });

  it("finds nothing for an unknown or empty reference", () => {
    expect(findProject(list, "nope")).toBeUndefined();
    expect(findProject(list, "")).toBeUndefined();
    expect(findProject(list, "  ")).toBeUndefined();
    expect(findProject([], "shop")).toBeUndefined();
  });

  it("prefers a name over an id that happens to look the same", () => {
    const tricky = [{ id: "abc", subdomain: null }, { id: "zzz", subdomain: "abc" }];
    expect(findProject(tricky, "abc")?.id).toBe("zzz");
  });
});
