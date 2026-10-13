import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { PlaywrightTestConfig } from "@playwright/test";
import {
  nativeServerMode,
  productionNativeConfig,
} from "../../scripts/native-server-mode";
import { productionTlsSettings } from "../../scripts/native-production-tls";

// Metadata only: no certificates, files, subprocesses, listeners, or databases.
const directory = resolve(
  process.cwd(),
  ".local/native-production-tls-12345678-1234-4234-8234-123456789abc",
);
const spki = Buffer.alloc(32, 7).toString("base64");
const environment = {
  TALEATLAS_TEST_TLS_DIRECTORY: directory,
  TALEATLAS_TEST_TLS_SPKI: spki,
};

function fixture(enabled = false): PlaywrightTestConfig {
  return {
    testDir: enabled ? "./tests/community-e2e" : "./tests/e2e",
    fullyParallel: false,
    workers: 1,
    retries: enabled ? 0 : 1,
    timeout: 60000,
    expect: { timeout: 15000 },
    outputDir: "synthetic-output",
    reporter: [["list"], ["html", { open: "never" }]],
    projects: [{ name: "chromium", use: { browserName: "chromium" } }],
    use: {
      baseURL: "http://127.0.0.1:3110",
      trace: "retain-on-failure",
      launchOptions: { headless: true, args: ["--synthetic-retained-option"] },
    },
    webServer: [
      {
        command: "node --import tsx scripts/test-mail.ts",
        url: "http://127.0.0.1:1026/health",
        reuseExistingServer: false,
        timeout: 30000,
        env: {
          NODE_ENV: "development",
          V4_COMMUNITIES_ENABLED: String(enabled),
        },
      },
      {
        command:
          "pnpm --filter @taleatlas/web dev --hostname 127.0.0.1 --port 3110",
        url: "http://127.0.0.1:3110/api/health",
        reuseExistingServer: false,
        timeout: 120000,
        stdout: "pipe",
        env: {
          APP_ORIGIN: "http://127.0.0.1:3110",
          V4_COMMUNITIES_ENABLED: String(enabled),
          SMTP_HOST: "127.0.0.1",
          SMTP_PORT: "1125",
          SMTP_FROM: "TaleAtlas <test@example.invalid>",
          SMTP_SECURE: "false",
          DATABASE_URL: "synthetic-database-reference",
        },
      },
    ],
  };
}

function servers(base: PlaywrightTestConfig) {
  if (!Array.isArray(base.webServer)) throw new Error("Expected fixture pair");
  return base.webServer;
}

function rejectConfig(base: PlaywrightTestConfig) {
  try {
    productionNativeConfig(base, environment);
    throw new Error("Expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("synthetic-secret");
    expect((error as Error).message).not.toBe("Expected rejection");
  }
}

describe("isolated native server mode", () => {
  it("preserves development defaults and recognizes explicit production only", () => {
    expect(nativeServerMode({})).toBe("development");
    expect(
      nativeServerMode({ TALEATLAS_TEST_NATIVE_SERVER_MODE: "development" }),
    ).toBe("development");
    expect(
      nativeServerMode({ TALEATLAS_TEST_NATIVE_SERVER_MODE: "production" }),
    ).toBe("production");
    const base = fixture();
    const before = structuredClone(base);
    nativeServerMode({});
    expect(base).toEqual(before);
    expect(base.use?.baseURL).toBe("http://127.0.0.1:3110");
  });
  it.each([
    "",
    "Production",
    " production",
    "production\n",
    "test",
    "synthetic-secret-option",
  ])("rejects invalid mode without echoing supplied value: %s", (value) => {
    expect(() =>
      nativeServerMode({ TALEATLAS_TEST_NATIVE_SERVER_MODE: value }),
    ).toThrow("Invalid isolated native server mode");
  });
  it.each([false, true])(
    "preserves every inherited setting except approved STARTTLS inbox, enabled=%s",
    (enabled) => {
      const base = fixture(enabled);
      const before = structuredClone(base);
      const result = productionNativeConfig(base, environment);
      const originalServers = servers(base);
      const resultServers = servers(result);
      expect(resultServers[0]).not.toBe(originalServers[0]);
      expect(resultServers[0]).toEqual({
        ...originalServers[0],
        command: "node --import tsx scripts/test-production-mail.ts",
        env: { ...originalServers[0].env, NODE_ENV: "development" },
      });
      expect(resultServers[0].env?.NODE_ENV).toBe("development");
      expect(resultServers[1]).toEqual({
        ...originalServers[1],
        command:
          "node --import tsx scripts/test-production-server.ts --port 3110",
        url: "https://127.0.0.1:3110/api/health",
        env: {
          ...originalServers[1].env,
          NODE_ENV: "production",
          APP_ORIGIN: "https://127.0.0.1:3110",
        },
      });
      const {
        use: originalUse,
        webServer: originalWebServer,
        ...settings
      } = base;
      const {
        use: resultUse,
        webServer: resultWebServer,
        ...resultSettings
      } = result;
      expect(resultSettings).toEqual(settings);
      for (const name of Object.keys(settings))
        expect(resultSettings[name as keyof typeof settings]).toBe(
          settings[name as keyof typeof settings],
        );
      expect(resultUse).toEqual({
        ...originalUse,
        baseURL: "https://127.0.0.1:3110",
        launchOptions: {
          ...originalUse?.launchOptions,
          args: [
            "--synthetic-retained-option",
            `--ignore-certificate-errors-spki-list=${spki}`,
          ],
        },
      });
      expect(resultUse?.ignoreHTTPSErrors).toBeUndefined();
      expect(resultUse?.launchOptions?.args).not.toContain(
        "--ignore-certificate-errors",
      );
      expect(resultServers[1].env).not.toHaveProperty(
        "NODE_TLS_REJECT_UNAUTHORIZED",
      );
      expect(base).toEqual(before);
      expect(originalWebServer).not.toBe(resultWebServer);
      expect(environment).toEqual({
        TALEATLAS_TEST_TLS_DIRECTORY: directory,
        TALEATLAS_TEST_TLS_SPKI: spki,
      });
    },
  );
  it("adds only scoped pin when no launch options exist", () => {
    const base = fixture();
    base.use = { baseURL: "http://127.0.0.1:3110" };
    expect(productionNativeConfig(base, environment).use).toEqual({
      baseURL: "https://127.0.0.1:3110",
      launchOptions: {
        args: [`--ignore-certificate-errors-spki-list=${spki}`],
      },
    });
  });
  it.each([1024, 65535])("accepts canonical boundary port %s", (port) => {
    const base = fixture();
    base.use!.baseURL = `http://127.0.0.1:${port}`;
    servers(base)[1].command =
      `pnpm --filter @taleatlas/web dev --hostname 127.0.0.1 --port ${port}`;
    expect(productionNativeConfig(base, environment).use?.baseURL).toBe(
      `https://127.0.0.1:${port}`,
    );
  });
  it.each([
    undefined,
    "https://127.0.0.1:3110",
    "http://localhost:3110",
    "http://0.0.0.0:3110",
    "http://127.0.0.1:1023",
    "http://127.0.0.1:65536",
    "http://127.0.0.1:03110",
    "http://127.0.0.1:3110/",
    "http://127.0.0.1:3110/path",
    "http://127.0.0.1:3110?synthetic-secret",
    "http://synthetic-secret@127.0.0.1:3110",
    "http://127.0.0.1:3110#synthetic-secret",
    "http://127.0.0.1:3110\n",
  ])("rejects non-original/redacted origin %s", (baseURL) => {
    const base = fixture();
    base.use!.baseURL = baseURL;
    rejectConfig(base);
  });
  it.each([undefined, [], [{ command: "node smtp" }]])(
    "rejects missing web fixture",
    (webServer) => {
      const base = fixture();
      base.webServer = webServer;
      rejectConfig(base);
    },
  );
  it.each([
    "pnpm --filter @taleatlas/web dev --hostname 0.0.0.0 --port 3110",
    "pnpm --filter @taleatlas/web dev --hostname 127.0.0.1 --port 3111",
    "pnpm --filter @taleatlas/web dev --hostname 127.0.0.1 --port 03110",
    "pnpm --filter @taleatlas/web dev --hostname 127.0.0.1 --port 3110 --synthetic-secret",
    "pnpm --filter @taleatlas/web dev --hostname 127.0.0.1 --port 3110\n",
    "pnpm --filter @taleatlas/web start --hostname 127.0.0.1 --port 3110",
  ])("rejects mismatched or modified command %s", (command) => {
    const base = fixture();
    servers(base)[1].command = command;
    rejectConfig(base);
  });
  it("refuses duplicate original web servers", () => {
    const base = fixture();
    servers(base).push(servers(base)[1]);
    expect(() => productionNativeConfig(base, environment)).toThrow(
      "Exactly one original isolated web server required",
    );
  });
  it("rejects missing original mail fixture without mutation", () => {
    const base = fixture();
    base.webServer = servers(base)[1];
    const before = structuredClone(base);
    expect(() => productionNativeConfig(base, environment)).toThrow(
      "Exactly one original isolated mail server required",
    );
    expect(base).toEqual(before);
  });
  it("rejects duplicate original mail fixtures", () => {
    const base = fixture();
    servers(base).push(servers(base)[0]);
    expect(() => productionNativeConfig(base, environment)).toThrow(
      "Exactly one original isolated mail server required",
    );
  });
  it.each([
    { command: "node --import tsx scripts/test-mail.ts --synthetic-secret" },
    { command: "node --import tsx scripts/test-production-mail.ts" },
    { url: "http://synthetic-secret@127.0.0.1:1026/health" },
    { url: "http://127.0.0.1:1027/health" },
    { timeout: 30001 },
    { reuseExistingServer: true },
  ])("rejects modified original mail fixtures", (changed) => {
    const base = fixture();
    Object.assign(servers(base)[0], changed);
    rejectConfig(base);
  });
  it("rejects unknown extra fixture without changing base", () => {
    const base = fixture();
    servers(base).push({ command: "node synthetic-secret-extra-server" });
    const before = structuredClone(base);
    rejectConfig(base);
    expect(base).toEqual(before);
  });
  it("derives certificate paths within the owned metadata scope only", () => {
    const tls = productionTlsSettings(environment);
    for (const path of [tls.certificatePath, tls.keyPath, tls.caPath]) {
      expect(resolve(path, "..")).toBe(directory);
    }
    expect(new Set([tls.certificatePath, tls.keyPath, tls.caPath]).size).toBe(
      3,
    );
    expect(tls.spki).toBe(spki);
  });
  it.each([
    {},
    {
      ...environment,
      TALEATLAS_TEST_TLS_DIRECTORY:
        ".local/native-production-tls-12345678-1234-4234-8234-123456789abc",
    },
    {
      ...environment,
      TALEATLAS_TEST_TLS_DIRECTORY: resolve(process.cwd(), "synthetic-secret"),
    },
    {
      ...environment,
      TALEATLAS_TEST_TLS_DIRECTORY: resolve(directory, "nested"),
    },
    { ...environment, TALEATLAS_TEST_TLS_SPKI: "synthetic-secret" },
    { ...environment, TALEATLAS_TEST_TLS_SPKI: `${spki}\n` },
    {
      ...environment,
      TALEATLAS_TEST_TLS_SPKI: Buffer.alloc(31).toString("base64"),
    },
  ])(
    "rejects unscoped TLS metadata before config transformation",
    (invalid) => {
      const base = fixture();
      const before = structuredClone(base);
      expect(() => productionNativeConfig(base, invalid)).toThrow();
      expect(base).toEqual(before);
    },
  );
});
