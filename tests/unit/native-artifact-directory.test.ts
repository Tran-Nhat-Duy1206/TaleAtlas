import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join, resolve } from "node:path";

const mocks = vi.hoisted(() => ({
  lstat: vi.fn(),
  realpath: vi.fn(),
  database: vi.fn(),
}));
vi.mock("node:fs", () => ({
  lstatSync: mocks.lstat,
  realpathSync: mocks.realpath,
}));
vi.mock("@playwright/test", () => ({
  defineConfig: <T>(config: T): T => config,
  devices: {
    "Desktop Chrome": {
      browserName: "chromium",
      viewport: { width: 1280, height: 720 },
    },
  },
}));
vi.mock("../helpers/test-database", () => ({
  requireTestDatabase: mocks.database,
}));

const databaseURL =
  "postgres://synthetic:unit-only@127.0.0.1:5432/native_artifact_test";
const directory = () =>
  join(
    resolve(".local"),
    "v5b-native-artifacts-00000000-0000-4000-8000-000000000001",
  );
const loadBase = async () => (await import("../../playwright.config")).default;
const loadCommunity = async () =>
  (await import("../../playwright.community.config")).default;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("TALEATLAS_TEST_ARTIFACTS_DIRECTORY", undefined);
  vi.stubEnv("CI", "");
  vi.stubEnv("E2E_PORT", "3207");
  vi.stubEnv("TEST_SMTP_PORT", "3208");
  vi.stubEnv("TEST_DATABASE_URL", databaseURL);
  mocks.database.mockReturnValue(databaseURL);
  mocks.lstat.mockReturnValue({
    isSymbolicLink: () => false,
    isDirectory: () => true,
  });
  mocks.realpath.mockImplementation((path: string) => path);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

// These tests prove configuration branching with mocked filesystem metadata.
// They do not certify real directory ownership, database isolation, browser runs,
// artifact preservation on disk, or the absence of ancestor/junction races.
function originalFixture(
  config: Awaited<ReturnType<typeof loadBase>>,
  community: boolean,
  ci: boolean,
) {
  expect(config.testDir).toBe(
    community ? "./tests/community-e2e" : "./tests/e2e",
  );
  expect(config.fullyParallel).toBe(false);
  expect(config.workers).toBe(1);
  expect(config.timeout).toBe(60000);
  expect(config.expect?.timeout).toBe(15000);
  expect(config.retries).toBe(community ? 0 : ci ? 1 : 0);
  expect(config.use).toEqual({
    baseURL: "http://127.0.0.1:3207",
    trace: "retain-on-failure",
  });
  expect(config.projects).toEqual([
    {
      name: "chromium",
      use: { browserName: "chromium", viewport: { width: 1280, height: 720 } },
    },
  ]);
  expect(Array.isArray(config.webServer)).toBe(true);
  const servers = Array.isArray(config.webServer) ? config.webServer : [];
  expect(servers).toHaveLength(2);
  expect(servers[0]).toMatchObject({
    command: "node --import tsx scripts/test-mail.ts",
    url: "http://127.0.0.1:1026/health",
    reuseExistingServer: false,
    timeout: 30000,
  });
  expect(servers[1]).toMatchObject({
    command:
      "pnpm --filter @taleatlas/web dev --hostname 127.0.0.1 --port 3207",
    stdout: "pipe",
    url: "http://127.0.0.1:3207/api/health",
    reuseExistingServer: false,
    timeout: 120000,
  });
  expect(servers[1]!.env).toEqual({
    DATABASE_URL: databaseURL,
    BETTER_AUTH_SECRET: "synthetic-e2e-secret-not-production-123456789",
    APP_ORIGIN: "http://127.0.0.1:3207",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "3208",
    SMTP_FROM: "TaleAtlas <test@example.invalid>",
    SMTP_SECURE: "false",
    ...(community ? { V4_COMMUNITIES_ENABLED: "true" } : {}),
  });
  if (community)
    expect(servers[0]!.env).toEqual({ V4_COMMUNITIES_ENABLED: "true" });
  else expect(servers[0]!.env).toBeUndefined();
}

describe("optional native browser artifact isolation (configuration-only unit proof)", () => {
  it.each([false, true])(
    "preserves all original defaults without an override (CI=%s)",
    async (ci) => {
      vi.stubEnv("CI", ci ? "1" : "");
      const base = await loadBase();
      const community = await loadCommunity();
      originalFixture(base, false, ci);
      originalFixture(community, true, ci);
      expect(base.outputDir).toBeUndefined();
      expect(base.reporter).toEqual([["list"], ["html", { open: "never" }]]);
      expect(community.outputDir).toBe("test-results-community");
      expect(community.reporter).toEqual([
        ["list"],
        [
          "html",
          { open: "never", outputFolder: "playwright-report-community" },
        ],
      ]);
      expect(mocks.lstat).not.toHaveBeenCalled();
      expect(mocks.realpath).not.toHaveBeenCalled();
      expect(mocks.database).toHaveBeenCalledTimes(1);
    },
  );

  it.each([false, true])(
    "uses distinct owned phase paths without changing fixture/CI settings (CI=%s)",
    async (ci) => {
      vi.stubEnv("CI", ci ? "1" : "");
      vi.stubEnv("TALEATLAS_TEST_ARTIFACTS_DIRECTORY", directory());
      const base = await loadBase();
      const community = await loadCommunity();
      originalFixture(base, false, ci);
      originalFixture(community, true, ci);
      expect(base.outputDir).toBe(join(directory(), "default-results"));
      expect(base.reporter).toEqual([
        ["list"],
        [
          "html",
          { open: "never", outputFolder: join(directory(), "default-report") },
        ],
      ]);
      expect(community.outputDir).toBe(join(directory(), "community-results"));
      expect(community.reporter).toEqual([
        ["list"],
        [
          "html",
          {
            open: "never",
            outputFolder: join(directory(), "community-report"),
          },
        ],
      ]);
      expect(base.outputDir).not.toBe(community.outputDir);
      expect(mocks.lstat).toHaveBeenCalledWith(resolve(directory()));
      expect(mocks.realpath).toHaveBeenCalledWith(resolve(directory()));
    },
  );

  for (const phase of ["default", "community"] as const) {
    const load = phase === "default" ? loadBase : loadCommunity;
    it.each([
      [
        "relative",
        ".local/v5b-native-artifacts-00000000-0000-4000-8000-000000000001",
      ],
      [
        "outside .local",
        join(
          resolve("."),
          "v5b-native-artifacts-00000000-0000-4000-8000-000000000001",
        ),
      ],
      ["empty relative parent", resolve(".local")],
      [
        "wrong basename",
        join(resolve(".local"), "v5a-existing-private-artifacts"),
      ],
      [
        "malformed UUID basename",
        join(resolve(".local"), "v5b-native-artifacts-not-a-uuid"),
      ],
      [
        "escaping .local",
        join(
          resolve(".local"),
          "..",
          "v5b-native-artifacts-00000000-0000-4000-8000-000000000001",
        ),
      ],
    ])(`rejects %s override for ${phase} config`, async (_label, path) => {
      vi.stubEnv("TALEATLAS_TEST_ARTIFACTS_DIRECTORY", path);
      await expect(load()).rejects.toThrow(
        "Owned isolated native artifact directory required",
      );
      expect(mocks.database).not.toHaveBeenCalled();
    });
    it(`rejects a symbolic link for ${phase} config`, async () => {
      vi.stubEnv("TALEATLAS_TEST_ARTIFACTS_DIRECTORY", directory());
      mocks.lstat.mockReturnValue({
        isSymbolicLink: () => true,
        isDirectory: () => true,
      });
      await expect(load()).rejects.toThrow(
        "Owned isolated native artifact directory required",
      );
      expect(mocks.database).not.toHaveBeenCalled();
    });
    it(`rejects a different realpath for ${phase} config`, async () => {
      vi.stubEnv("TALEATLAS_TEST_ARTIFACTS_DIRECTORY", directory());
      mocks.realpath.mockReturnValue(
        join(resolve(".local"), "different-owned-target"),
      );
      await expect(load()).rejects.toThrow(
        "Owned isolated native artifact directory required",
      );
      expect(mocks.database).not.toHaveBeenCalled();
    });
    it(`fails closed on unavailable filesystem metadata for ${phase} config`, async () => {
      vi.stubEnv("TALEATLAS_TEST_ARTIFACTS_DIRECTORY", directory());
      mocks.lstat.mockImplementation(() => {
        throw new Error("synthetic unit ENOENT");
      });
      await expect(load()).rejects.toThrow("synthetic unit ENOENT");
      expect(mocks.database).not.toHaveBeenCalled();
    });
  }
});
