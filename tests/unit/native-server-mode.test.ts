import { describe, expect, it } from "vitest";
import type { PlaywrightTestConfig } from "@playwright/test";
import {
  nativeServerMode,
  productionWebServers,
} from "../../scripts/native-server-mode";

describe("isolated native server mode", () => {
  it("preserves development defaults and recognizes explicit production only", () => {
    expect(nativeServerMode({})).toBe("development");
    expect(
      nativeServerMode({ TALEATLAS_TEST_NATIVE_SERVER_MODE: "development" }),
    ).toBe("development");
    expect(
      nativeServerMode({ TALEATLAS_TEST_NATIVE_SERVER_MODE: "production" }),
    ).toBe("production");
  });
  it.each([
    "",
    "Production",
    " production",
    "production\n",
    "test",
    "synthetic-secret-option",
  ])("rejects invalid mode without echoing supplied value", (value) => {
    expect(() =>
      nativeServerMode({ TALEATLAS_TEST_NATIVE_SERVER_MODE: value }),
    ).toThrow("Invalid isolated native server mode");
  });
  for (const enabled of [false, true]) {
    it(`preserves fixture and all test settings for enabled=${enabled}`, () => {
      const smtp = {
        command: "node --import tsx scripts/test-mail.ts",
        url: "http://127.0.0.1:1026/health",
        reuseExistingServer: false,
        timeout: 30000,
      };
      const web = {
        command:
          "pnpm --filter @taleatlas/web dev --hostname 127.0.0.1 --port 3110",
        url: "http://127.0.0.1:3110/api/health",
        reuseExistingServer: false,
        timeout: 120000,
        stdout: "pipe" as const,
        env: {
          APP_ORIGIN: "http://127.0.0.1:3110",
          V4_COMMUNITIES_ENABLED: String(enabled),
          SMTP_PORT: "1125",
        },
      };
      const base: PlaywrightTestConfig = {
        testDir: enabled ? "./tests/community-e2e" : "./tests/e2e",
        fullyParallel: false,
        workers: 1,
        retries: enabled ? 0 : 1,
        timeout: 60000,
        expect: { timeout: 15000 },
        webServer: [smtp, web],
      };
      const original = structuredClone(base);
      const servers = productionWebServers(base);
      expect(Array.isArray(servers)).toBe(true);
      if (!Array.isArray(servers)) throw new Error("Expected fixture pair");
      expect(servers[0]).toBe(smtp);
      expect(servers[1]).toEqual({
        ...web,
        command:
          "pnpm --filter @taleatlas/web start --hostname 127.0.0.1 --port 3110",
        env: { ...web.env, NODE_ENV: "production" },
      });
      expect(base).toEqual(original);
      expect({ ...base, webServer: servers }).toMatchObject({
        testDir: original.testDir,
        fullyParallel: false,
        workers: 1,
        retries: original.retries,
        timeout: 60000,
        expect: { timeout: 15000 },
      });
    });
  }
  it.each([
    undefined,
    [],
    [{ command: "node smtp" }],
    [
      {
        command:
          "pnpm --filter @taleatlas/web dev --hostname 0.0.0.0 --port 3110",
      },
    ],
    [
      {
        command:
          "pnpm --filter @taleatlas/web dev --hostname 127.0.0.1 --port 1023",
      },
    ],
    [
      {
        command:
          "pnpm --filter @taleatlas/web dev --hostname 127.0.0.1 --port 65536",
      },
    ],
  ])("fails closed on unsupported fixture shape", (webServer) => {
    expect(() => productionWebServers({ webServer })).toThrow();
  });
  it("refuses duplicate web servers", () => {
    const web = {
      command:
        "pnpm --filter @taleatlas/web dev --hostname 127.0.0.1 --port 3110",
    };
    expect(() => productionWebServers({ webServer: [web, web] })).toThrow(
      "Exactly one original isolated web server required",
    );
  });
});
