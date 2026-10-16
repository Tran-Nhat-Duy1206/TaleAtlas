import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { requireTestDatabase } from "../tests/helpers/test-database";
import { nativeChildNodeOptions } from "./native-child-options";
import { prepareNativeProductionTls } from "./native-production-tls";

// Explicitly scoped CI experiment. Keep the original native wrapper, Playwright
// configs, assertions, workers, deadlines, and retry policies unchanged.
async function main(): Promise<void> {
  // Refuse non-synthetic databases before creating files or child processes.
  requireTestDatabase();
  const phase = process.argv[2];
  if (
    process.argv.length !== 3 ||
    (phase !== "legacy" && phase !== "v4") ||
    process.env.CI !== "true" ||
    process.env.TALEATLAS_TEST_NATIVE_SERVER_MODE !== "production" ||
    process.env.TEST_SMTP_PORT !== "1025" ||
    process.env.SMTP_PORT !== "1025"
  )
    throw new Error("Guarded CI production E2E phase required");

  // Each isolated job generates its own short-lived loopback CA + leaf.
  // The established helper rejects ambient global trust overrides.
  const nodeOptions = nativeChildNodeOptions(process.env);
  const tls = await prepareNativeProductionTls();
  const config =
    phase === "legacy"
      ? "playwright.production.config.ts"
      : "playwright.community.production.config.ts";

  console.info(`NATIVE CI PRODUCTION PHASE BEGIN: ${phase}`);
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "./node_modules/@playwright/test/cli.js",
      "test",
      "--config",
      config,
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        // Matches the original wrapper: the Playwright fixture is development
        // while productionNativeConfig starts ONLY the owned web in production.
        NODE_ENV: "development",
        V4_COMMUNITIES_ENABLED: phase === "v4" ? "true" : "false",
        TALEATLAS_TEST_TLS_DIRECTORY: dirname(tls.certificatePath),
        TALEATLAS_TEST_TLS_SPKI: tls.spki,
        NODE_EXTRA_CA_CERTS: tls.caPath,
        ...(nodeOptions === undefined ? {} : { NODE_OPTIONS: nodeOptions }),
      },
    },
  );
  const result = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (result !== 0) {
    console.error(`NATIVE CI PRODUCTION PHASE FAILED: ${phase}`);
    process.exitCode = result;
    return;
  }
  console.info(`NATIVE CI PRODUCTION PHASE PASS: ${phase}`);
}

await main().catch(() => {
  // Never serialize private paths, certificate material, or auth state.
  console.error("Guarded CI production E2E phase could not start");
  process.exitCode = 1;
});
