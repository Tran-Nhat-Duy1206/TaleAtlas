import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Same original browser/deadline/fixture settings, separate fully executed suite.
// Feature opt-in is synthetic child-server-only, never operator configuration.
export default defineConfig({
  ...base,
  testDir: "./tests/community-e2e",
  retries: 0,
  outputDir: "test-results-community",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report-community" }],
  ],
  webServer: (Array.isArray(base.webServer)
    ? base.webServer
    : [base.webServer]
  ).map((server) => {
    if (!server)
      throw new Error("Original fixture server configuration required");
    return {
      ...server,
      env: { ...server.env, V4_COMMUNITIES_ENABLED: "true" },
    };
  }),
});
