import { defineConfig } from "@playwright/test";
import base, { fixtureArtifactsDirectory } from "./playwright.config";
import { join } from "node:path";

// Same original browser/deadline/fixture settings, separate fully executed suite.
// Feature opt-in is synthetic child-server-only, never operator configuration.
export default defineConfig({
  ...base,
  testDir: "./tests/community-e2e",
  retries: 0,
  outputDir: fixtureArtifactsDirectory
    ? join(fixtureArtifactsDirectory, "community-results")
    : "test-results-community",
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: fixtureArtifactsDirectory
          ? join(fixtureArtifactsDirectory, "community-report")
          : "playwright-report-community",
      },
    ],
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
