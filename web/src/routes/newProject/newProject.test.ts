import { describe, expect, it } from "vitest";
import {
  cleanSubdomain,
  dockerfilePathIn,
  envMap,
  firstProblem,
  folderOf,
  mergeEnv,
  parseEnvText,
  parseGitHubRepo,
  pasteIntoEnv,
  sanitizePath,
  slugify,
} from "./newProject";

describe("parseGitHubRepo", () => {
  const octo = { owner: "octo", repo: "hello", fullName: "octo/hello", url: "https://github.com/octo/hello" };

  it("reads the ways people paste a repository", () => {
    for (const input of [
      "https://github.com/octo/hello",
      "https://github.com/octo/hello/",
      "https://github.com/octo/hello.git",
      "https://www.github.com/octo/hello/tree/main/src",
      "http://github.com/octo/hello?tab=readme#top",
      "github.com/octo/hello",
      "git@github.com:octo/hello.git",
      "octo/hello",
      "  octo/hello  ",
    ]) {
      expect(parseGitHubRepo(input), input).toEqual(octo);
    }
  });

  it("keeps dots, dashes and underscores in names", () => {
    expect(parseGitHubRepo("my-org/site.v2_x")?.fullName).toBe("my-org/site.v2_x");
  });

  it("rejects anything that is not a repository", () => {
    for (const input of [
      "",
      "   ",
      "octo",
      "https://gitlab.com/octo/hello",
      "https://github.com/octo",
      "https://evilgithub.com/octo/hello",
      "ftp://github.com/octo/hello",
      "javascript:alert(1)",
      "octo/hel lo",
    ]) {
      expect(parseGitHubRepo(input), input).toBeNull();
    }
  });
});

describe("naming", () => {
  it("turns a name into an address", () => {
    expect(slugify("My Cool_App!")).toBe("my-cool-app");
    expect(slugify("  --hello--  ")).toBe("hello");
    expect(slugify("***")).toBe("");
    expect(slugify("a".repeat(60))).toHaveLength(40);
  });

  it("cleans an address as it is typed, allowing a trailing hyphen", () => {
    expect(cleanSubdomain("My App")).toBe("my-app");
    expect(cleanSubdomain("my-")).toBe("my-");
    expect(cleanSubdomain("-my--app")).toBe("my-app");
  });
});

describe("folderOf", () => {
  it("shows where a Dockerfile is, the way the form takes it", () => {
    expect(folderOf("Dockerfile")).toBe("./");
    expect(folderOf("")).toBe("./");
    expect(folderOf("api/Dockerfile")).toBe("./api");
    expect(folderOf("services/api/Dockerfile")).toBe("./services/api");
    // and back again
    expect(dockerfilePathIn(folderOf("services/api/Dockerfile"))).toBe("services/api/Dockerfile");
  });
});

describe("paths", () => {
  it("tidies a folder and finds the Dockerfile in it", () => {
    expect(sanitizePath("./api/")).toBe("api");
    expect(sanitizePath("a//b")).toBe("a/b");
    expect(dockerfilePathIn("./")).toBe("Dockerfile");
    expect(dockerfilePathIn("services/api")).toBe("services/api/Dockerfile");
  });
});

describe("env", () => {
  it("reads a .env file", () => {
    const text = ['# comment', "", "port = 8080", 'DB_URL="postgres://x"', "NAME='it works'", "TOKEN=a=b # trailing", "NOEQUALS"].join("\n");
    expect(parseEnvText(text)).toEqual([
      { key: "PORT", value: "8080" },
      { key: "DB_URL", value: "postgres://x" },
      { key: "NAME", value: "it works" },
      { key: "TOKEN", value: "a=b" },
    ]);
  });

  it("merges imported variables over the ones already there", () => {
    expect(
      mergeEnv(
        [{ key: "A", value: "1" }, { key: "", value: "" }, { key: "B", value: "2" }],
        [{ key: "B", value: "3" }, { key: "C", value: "4" }],
      ),
    ).toEqual([{ key: "A", value: "1" }, { key: "B", value: "3" }, { key: "C", value: "4" }]);
  });

  it("turns pasted KEY=value lines into rows", () => {
    const vars = [{ key: "A", value: "1" }, { key: "", value: "" }];
    expect(pasteIntoEnv(vars, 1, "B=2\nC=3")).toEqual([
      { key: "A", value: "1" },
      { key: "B", value: "2" },
      { key: "C", value: "3" },
    ]);
    expect(pasteIntoEnv([{ key: "", value: "" }], 0, "KEY=value")).toEqual([{ key: "KEY", value: "value" }]);
  });

  it("pastes ordinary text as it is", () => {
    expect(pasteIntoEnv([{ key: "", value: "" }], 0, "just text")).toBeNull();
    expect(pasteIntoEnv([{ key: "", value: "" }], 0, "# only a comment =")).toBeNull();
    // Half-typed name with a single pasted fragment: leave it to the box.
    expect(pasteIntoEnv([{ key: "API", value: "" }], 0, "_KEY=x")).toBeNull();
  });

  it("sends only the variables with a name", () => {
    expect(envMap([{ key: " A ", value: "1" }, { key: "", value: "x" }])).toEqual({ A: "1" });
  });
});

describe("firstProblem", () => {
  const ok = { name: "Shop", subdomain: "shop", port: "8080", branch: "main", hasDockerfile: true };

  it("accepts a complete form, and one still checking the Dockerfile", () => {
    expect(firstProblem(ok)).toBeNull();
    expect(firstProblem({ ...ok, hasDockerfile: null })).toBeNull();
  });

  it("names the first thing wrong", () => {
    expect(firstProblem({ ...ok, name: " " })).toMatch(/name/);
    expect(firstProblem({ ...ok, subdomain: "" })).toMatch(/address/);
    expect(firstProblem({ ...ok, subdomain: "bad-" })).toMatch(/hyphen/);
    expect(firstProblem({ ...ok, addressError: "That address is already taken." })).toMatch(/taken/);
    expect(firstProblem({ ...ok, port: "70000" })).toMatch(/port/);
    expect(firstProblem({ ...ok, port: "" })).toMatch(/port/);
    expect(firstProblem({ ...ok, branch: "" })).toMatch(/branch/);
    expect(firstProblem({ ...ok, hasDockerfile: false })).toMatch(/Dockerfile/);
  });
});
