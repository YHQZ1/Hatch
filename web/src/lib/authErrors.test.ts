import { expect, test } from "vitest";
import { authErrorMessage } from "./authErrors";

test("no code means no error", () => {
  expect(authErrorMessage(null)).toBeNull();
  expect(authErrorMessage("")).toBeNull();
});

test("every code the server sends has its own message", () => {
  for (const code of ["state", "denied", "exchange", "github", "server", "session"]) {
    expect(authErrorMessage(code)).toMatch(/\S/);
  }
  expect(authErrorMessage("denied")).toContain("cancelled");
});

test("an unknown code falls back to the generic message", () => {
  expect(authErrorMessage("anything-else")).toBe(authErrorMessage("server"));
});
