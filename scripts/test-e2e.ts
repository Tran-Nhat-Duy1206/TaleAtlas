import { spawn } from "node:child_process";
import { requireTestDatabase } from "../tests/helpers/test-database";
import { nativeChildNodeOptions } from "./native-child-options";
import { nativeServerMode } from "./native-server-mode";

// Every native phase uses the same explicitly guarded synthetic loopback DB.
// No operator/hosted flag is changed: opt-in exists only in the child test server.
requireTestDatabase();
const nativeNodeOptions = nativeChildNodeOptions(process.env);
const serverMode = nativeServerMode(process.env);
const defaultConfig =
  serverMode === "production"
    ? "playwright.production.config.ts"
    : "playwright.config.ts";
const communityConfig =
  serverMode === "production"
    ? "playwright.community.production.config.ts"
    : "playwright.community.config.ts";
console.info(
  `NATIVE SERVER MODE: ${serverMode}; original tests and deadlines unchanged`,
);
const args = process.argv.slice(2);
async function phase(
  label: string,
  config: string,
  enabled: boolean,
  extra: string[] = [],
) {
  console.info(`NATIVE PHASE BEGIN: ${label}`);
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "./node_modules/@playwright/test/cli.js",
      "test",
      "--config",
      config,
      ...extra,
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: serverMode,
        V4_COMMUNITIES_ENABLED: enabled ? "true" : "false",
        ...(nativeNodeOptions === undefined
          ? {}
          : { NODE_OPTIONS: nativeNodeOptions }),
      },
    },
  );
  const result = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (result !== 0) {
    process.exitCode = result;
    return false;
  }
  console.info(`NATIVE PHASE PASS: ${label}`);
  return true;
}
if (args.length) {
  console.info(
    "Explicit CLI selection is diagnostic only; it does not run every mandatory native phase.",
  );
  await phase("selected default-off diagnostic", defaultConfig, false, args);
} else if (
  await phase(
    "all original V0-V3 plus V4 disabled routes",
    defaultConfig,
    false,
  )
) {
  await phase(
    "all additive explicitly enabled V4 scenarios, retry0",
    communityConfig,
    true,
  );
}
