// Explicitly approved isolated browser diagnostic, never a mandatory scenario or fix.
import { defineConfig } from "@playwright/test";
import base from "../playwright.community.config";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let directory: string;
try {
  const supplied = process.env.TALEATLAS_V4_HTTP_DIAGNOSTIC_DIRECTORY;
  const databaseValue = process.env.TEST_DATABASE_URL;
  if (
    process.env.CI !== "true" ||
    process.platform !== "linux" ||
    process.env.TALEATLAS_V4_HTTP_DIAGNOSTIC_ONLY !== "true" ||
    process.env.V4_COMMUNITIES_ENABLED !== "true" ||
    !supplied ||
    !path.isAbsolute(supplied) ||
    path.dirname(path.resolve(supplied)) !==
      path.join(root, ".local", "v4-http-transport-diagnostic") ||
    !/^[a-f0-9-]{36}$/.test(path.basename(supplied)) ||
    !lstatSync(supplied).isDirectory() ||
    realpathSync(supplied) !== path.resolve(supplied) ||
    !databaseValue ||
    process.env.DATABASE_URL !== databaseValue ||
    process.env.DATABASE_URL_DIRECT !== databaseValue ||
    (process.env.APP_ORIGIN !== undefined &&
      process.env.APP_ORIGIN !== "http://127.0.0.1:3000") ||
    (process.env.E2E_PORT !== undefined && process.env.E2E_PORT !== "3000") ||
    (process.env.TEST_SMTP_PORT !== undefined &&
      process.env.TEST_SMTP_PORT !== "1025") ||
    process.env.TALEATLAS_TEST_NATIVE_HEAP_MB !== undefined ||
    (process.env.TALEATLAS_TEST_NATIVE_SERVER_MODE !== undefined &&
      process.env.TALEATLAS_TEST_NATIVE_SERVER_MODE !== "development")
  )
    throw new Error("BROWSER_DIAGNOSTIC_GUARD_FAILED");
  const database = new URL(databaseValue);
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) ||
    !/^\/[a-zA-Z0-9_]+_test$/.test(database.pathname)
  )
    throw new Error("BROWSER_DIAGNOSTIC_GUARD_FAILED");
  directory = supplied;
} catch {
  throw new Error("BROWSER_DIAGNOSTIC_GUARD_FAILED");
}

export default defineConfig({
  ...base,
  testDir: path.join(root, "scripts"),
  testMatch: "v4-browser-navigation-diagnostic.spec.ts",
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: path.join(directory, "browser-private-output"),
  use: { ...base.use, trace: "off", screenshot: "off", video: "off" },
  projects: base.projects?.map((project) => ({
    ...project,
    testDir: path.join(root, "scripts"),
    testMatch: "v4-browser-navigation-diagnostic.spec.ts",
    outputDir: path.join(directory, "browser-private-output"),
    retries: 0,
    use: { ...project.use, trace: "off", screenshot: "off", video: "off" },
  })),
});
