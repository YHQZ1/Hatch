import { expect, test } from "vitest";
import { safeHttpUrl } from "./url";

test("accepts http and https URLs", () => {
  expect(safeHttpUrl("https://app.example.com/path?x=1")).toBe(
    "https://app.example.com/path?x=1",
  );
  expect(safeHttpUrl("http://localhost:3000")).toBe("http://localhost:3000");
});

test("rejects other schemes", () => {
  for (const value of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.com",
  ]) {
    expect(safeHttpUrl(value)).toBeNull();
  }
});

test("rejects values that are not absolute URLs", () => {
  for (const value of ["", null, undefined, "not a url", "/relative/path", "//example.com"]) {
    expect(safeHttpUrl(value)).toBeNull();
  }
});
