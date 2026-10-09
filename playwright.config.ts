import { defineConfig, devices } from "@playwright/test";
import { requireTestDatabase } from "./tests/helpers/test-database";
const databaseURL = requireTestDatabase();
const port = Number(process.env.E2E_PORT ?? "3000");
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid isolated E2E port");
const origin = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
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
        SMTP_PORT: "1025",
        SMTP_FROM: "TaleAtlas <test@example.invalid>",
        SMTP_SECURE: "false",
      },
    },
  ],
});
