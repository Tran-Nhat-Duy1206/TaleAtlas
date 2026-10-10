import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRequire = createRequire(
  new URL("../../apps/web/package.json", import.meta.url),
);
const configRequire = createRequire(webRequire.resolve("eslint-config-next"));
const pluginEntry = configRequire.resolve("@next/eslint-plugin-next");
const pluginRequire = createRequire(pluginEntry);
const { getRootDirs } = pluginRequire("./utils/get-root-dirs.js") as {
  getRootDirs(context: {
    cwd: string;
    settings: { next?: { rootDir?: string | string[] } };
  }): string[];
};

const forward = (value: string) => value.replaceAll("\\", "/");
let fixture: string;

beforeAll(() => {
  mkdirSync(".local", { recursive: true });
  fixture = forward(mkdtempSync(".local/next-root-glob-test-"));
  for (const directory of [
    "alpha/src/app/nested",
    "beta/app",
    "gamma",
    ".hidden/app",
    "éclair/app",
  ]) {
    mkdirSync(path.join(fixture, directory), { recursive: true });
  }
  writeFileSync(path.join(fixture, "not-a-directory"), "fixture");
});

afterAll(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});

function roots(rootDir?: string | string[]) {
  return getRootDirs({
    cwd: path.resolve(fixture, "alpha"),
    settings: rootDir === undefined ? {} : { next: { rootDir } },
  }).sort();
}

// Expected values were frozen using fast-glob 3.3.1 before substituting the
// dependency. No vulnerable baseline library is kept as a test dependency.
// These cases cover the actual private helper, not a parallel reimplementation.
describe("Next ESLint 16.4.0 root-directory glob compatibility", () => {
  it("loads the pinned Next plugin through the narrowly scoped adapter", () => {
    expect(pluginRequire("../package.json").version).toBe("16.4.0");
    expect(pluginRequire.resolve("fast-glob")).toBe(
      fileURLToPath(
        new URL("../../packages/next-root-glob/index.cjs", import.meta.url),
      ),
    );
  });

  it("keeps the context cwd when no rootDir is configured", () => {
    expect(roots()).toEqual([path.resolve(fixture, "alpha")]);
  });

  it.each<[string, string[]]>([
    ["alpha", ["alpha"]],
    ["alpha/", ["alpha/"]],
    ["*", ["alpha", "beta", "gamma", "éclair"]],
    ["*/", ["alpha", "beta", "gamma", "éclair"]],
    ["{alpha,beta}", ["alpha", "beta"]],
    ["{alpha,beta}/", ["alpha/", "beta/"]],
    ["+(alpha|beta)", ["alpha", "beta"]],
    ["**/app", ["alpha/src/app", "beta/app", "éclair/app"]],
    [".*", [".hidden"]],
    [".hidden", [".hidden"]],
    ["missing", []],
    ["not-a-directory", []],
    ["!alpha", []],
  ])(
    "matches the frozen directory-only baseline for %s",
    (pattern, expected) => {
      expect(roots(`${fixture}/${pattern}`)).toEqual(
        expected.map((directory) => `${fixture}/${directory}`).sort(),
      );
    },
  );

  it("preserves explicit dot-relative spelling", () => {
    expect(roots(`./${fixture}/*`)).toEqual(
      ["alpha", "beta", "gamma", "éclair"]
        .map((name) => `./${fixture}/${name}`)
        .sort(),
    );
    expect(roots(`./${fixture}/alpha`)).toEqual([`./${fixture}/alpha`]);
  });

  it("preserves absolute forward-slash paths and wildcard outputs", () => {
    const absolute = forward(path.resolve(fixture));
    expect(roots(`${absolute}/alpha`)).toEqual([`${absolute}/alpha`]);
    expect(roots(`${absolute}/{alpha,beta}`)).toEqual([
      `${absolute}/alpha`,
      `${absolute}/beta`,
    ]);
  });

  it("normalizes Windows separators in the actual Next helper", () => {
    expect(roots(path.resolve(fixture, "alpha"))).toEqual([
      forward(path.resolve(fixture, "alpha")),
    ]);
  });

  it("keeps Next's independent array entries, including exclusion-only entries", () => {
    // Next calls globSync separately for each string; a negative array entry
    // does not subtract matches from a different entry. Preserve that behavior.
    expect(roots([`${fixture}/{alpha,beta}`, `!${fixture}/beta`])).toEqual([
      `${fixture}/alpha`,
      `${fixture}/beta`,
    ]);
  });
});
