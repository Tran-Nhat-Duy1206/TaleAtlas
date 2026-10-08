import { defineConfig, devices } from "@playwright/test";
import { requireTestDatabase } from "./tests/helpers/test-database";
const databaseURL = requireTestDatabase();
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node --import tsx scripts/test-mail.ts",
      url: "http://127.0.0.1:1026/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "pnpm --filter @taleatlas/web dev --hostname 127.0.0.1",
      url: "http://127.0.0.1:3000/api/health",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        DATABASE_URL: databaseURL,
        BETTER_AUTH_SECRET: "synthetic-e2e-secret-not-production-123456789",
        APP_ORIGIN: "http://127.0.0.1:3000",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "1025",
        SMTP_FROM: "TaleAtlas <test@example.invalid>",
        SMTP_SECURE: "false",
      },
    },
  ],
});
