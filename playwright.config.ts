import { defineConfig, devices } from "@playwright/test";
import { requireTestDatabase } from "./tests/helpers/test-database";
import { isAbsolute, relative, resolve, basename, join } from "node:path";
import { lstatSync, realpathSync } from "node:fs";
// Optional local-only artifact isolation preserves earlier ignored test reports.
// With no override, CI and all original fixture settings remain unchanged.
export const fixtureArtifactsDirectory =
  process.env.TALEATLAS_TEST_ARTIFACTS_DIRECTORY;
if (fixtureArtifactsDirectory) {
  const target = resolve(fixtureArtifactsDirectory);
  const withinLocal = relative(resolve(".local"), target);
  if (
    !isAbsolute(fixtureArtifactsDirectory) ||
    !withinLocal ||
    withinLocal.startsWith("..") ||
    isAbsolute(withinLocal) ||
    !/^v5b-native-artifacts-[0-9a-f-]{36}$/.test(basename(target)) ||
    lstatSync(target).isSymbolicLink() ||
    realpathSync(target).toLowerCase() !== target.toLowerCase()
  )
    throw new Error("Owned isolated native artifact directory required");
}
const databaseURL = requireTestDatabase();
const port = Number(process.env.E2E_PORT ?? "3000");
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid isolated E2E port");
const origin = `http://127.0.0.1:${port}`;
const smtpPort = Number(process.env.TEST_SMTP_PORT ?? "1025");
if (!Number.isInteger(smtpPort) || smtpPort < 1024 || smtpPort > 65535)
  throw new Error("Invalid isolated E2E SMTP port");
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: fixtureArtifactsDirectory
    ? join(fixtureArtifactsDirectory, "default-results")
    : undefined,
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        ...(fixtureArtifactsDirectory
          ? { outputFolder: join(fixtureArtifactsDirectory, "default-report") }
          : {}),
      },
    ],
  ],
  use: { baseURL: origin, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node --import tsx scripts/test-mail.ts",
      url: "http://127.0.0.1:1026/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: `pnpm --filter @taleatlas/web dev --hostname 127.0.0.1 --port ${port}`,
      stdout: "pipe",
      url: `${origin}/api/health`,
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        DATABASE_URL: databaseURL,
        BETTER_AUTH_SECRET: "synthetic-e2e-secret-not-production-123456789",
        APP_ORIGIN: origin,
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: String(smtpPort),
        SMTP_FROM: "TaleAtlas <test@example.invalid>",
        SMTP_SECURE: "false",
      },
    },
  ],
});
