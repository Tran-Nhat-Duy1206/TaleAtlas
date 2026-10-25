// One authorized reporting-only legacy execution; never an application fix.
import { spawn, spawnSync, execFileSync } from "node:child_process";
import {
  appendFileSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  SUT_SHA,
  STAGES,
  blankResult,
  buildManifest,
  selfTest,
  validateResult,
} from "./a6-legacy-diagnostic-reporter.mjs";

const reporter = fileURLToPath(
  new URL("./a6-legacy-diagnostic-reporter.mjs", import.meta.url),
);
const root = realpathSync(process.cwd());
let stage = "guard";
let manifest;
let privateDirectory;
let postgresContainer;
const fixedError = () => new Error("A6_DIAG_GUARD_FAILED");
function requireGuard(condition) {
  if (!condition) throw fixedError();
}
function git(...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}
function ownDirectory(directory) {
  const temp = realpathSync(process.env.RUNNER_TEMP || "");
  requireGuard(
    isAbsolute(directory) &&
      dirname(directory) === temp &&
      /^a6-legacy-[a-f0-9-]{36}$/.test(directory.slice(temp.length + 1)),
  );
  requireGuard(
    !lstatSync(directory).isSymbolicLink() &&
      realpathSync(directory) === directory &&
      (lstatSync(directory).mode & 0o077) === 0,
  );
  return directory;
}
function adapterStage(name, started = false) {
  requireGuard(STAGES.includes(name));
  writeFileSync(
    join(privateDirectory, "adapter-stage.json"),
    JSON.stringify({ stage: name, playwrightStarted: started }),
    { mode: 0o600 },
  );
}
function publish(result) {
  // Reconstruct and revalidate immediately before both public output channels.
  const safe = validateResult(result, manifest);
  const json = JSON.stringify(safe);
  requireGuard(Buffer.byteLength(json) <= 128000);
  const block = `A6_DIAG_RESULT_BEGIN\n${json}\nA6_DIAG_RESULT_END\n`;
  // The ordinary log is an independent retrieval channel, even if writing the
  // optional Actions summary file fails. Never republish an alternate raw value.
  process.stdout.write(block);
  try {
    const summary = process.env.GITHUB_STEP_SUMMARY;
    const temp = realpathSync(process.env.RUNNER_TEMP || "");
    requireGuard(
      typeof summary === "string" &&
        isAbsolute(summary) &&
        resolve(summary).startsWith(temp + sep),
    );
    requireGuard(realpathSync(dirname(summary)).startsWith(temp + sep));
    if (existsSync(summary)) requireGuard(!lstatSync(summary).isSymbolicLink());
    appendFileSync(summary, "```json\n" + block + "```\n", { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}
function runStage(name, command, args, environment) {
  stage = name;
  const fd = openSync(join(privateDirectory, "raw.log"), "a", 0o600);
  let result;
  try {
    result = spawnSync(command, args, {
      cwd: root,
      env: environment,
      stdio: ["ignore", fd, fd],
    });
  } finally {
    closeSync(fd);
  }
  requireGuard(!result.error && result.status === 0);
}
async function preparePostgres(environment) {
  // Identical service runtime and health settings; private orchestration avoids
  // Actions' built-in service command log exposing the synthetic credentials.
  stage = "postgres";
  postgresContainer = "a6-diag-" + randomUUID();
  runStage(
    "postgres",
    "docker",
    [
      "run",
      "--detach",
      "--rm",
      "--name",
      postgresContainer,
      "--env",
      "POSTGRES_USER=taleatlas_test",
      "--env",
      "POSTGRES_PASSWORD=synthetic_ci_only",
      "--env",
      "POSTGRES_DB=taleatlas_test",
      "--publish",
      "5432:5432",
      "--health-cmd",
      "pg_isready",
      "--health-interval",
      "5s",
      "--health-timeout",
      "5s",
      "--health-retries",
      "10",
      "postgres:17",
    ],
    environment,
  );
  // Only the same Docker health state is observed: no extra database probes,
  // application runs or automatic retry of provisioning/browser execution.
  for (let i = 0; i < 120; i++) {
    const fd = openSync(join(privateDirectory, "raw.log"), "a", 0o600);
    let state;
    try {
      state = execFileSync(
        "docker",
        ["inspect", "--format", "{{.State.Health.Status}}", postgresContainer],
        { encoding: "utf8", stdio: ["ignore", "pipe", fd] },
      ).trim();
    } finally {
      closeSync(fd);
    }
    if (state === "healthy") return;
    requireGuard(state === "starting");
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw fixedError();
}
function stopOwnedPostgres() {
  if (
    !privateDirectory ||
    !/^a6-diag-[a-f0-9-]{36}$/.test(postgresContainer || "")
  )
    return;
  // This exact UUID container belongs only to this ephemeral diagnostic job.
  // Cleanup output stays private and cannot replace the original diagnosis.
  try {
    const fd = openSync(join(privateDirectory, "raw.log"), "a", 0o600);
    try {
      spawnSync("docker", ["stop", postgresContainer], {
        stdio: ["ignore", fd, fd],
      });
    } finally {
      closeSync(fd);
    }
  } catch {
    /* Runner teardown will discard any remaining owned resource. */
  }
}
async function nativeAdapter() {
  privateDirectory = ownDirectory(process.env.A6_DIAG_PRIVATE || "");
  adapterStage("native-guard");
  requireGuard(
    process.argv.length === 3 &&
      process.argv[2] === "--native" &&
      process.platform === "linux" &&
      process.env.CI === "true",
  );
  requireGuard(
    process.env.TALEATLAS_TEST_NATIVE_SERVER_MODE === "production" &&
      process.env.TEST_SMTP_PORT === "1025" &&
      process.env.SMTP_PORT === "1025",
  );
  requireGuard(
    process.env.A6_DIAG_SUT === root && git("rev-parse", "HEAD") === SUT_SHA,
  );
  const { requireTestDatabase } = await import(
    pathToFileURL(join(root, "tests/helpers/test-database.ts")).href
  );
  const { nativeChildNodeOptions } = await import(
    pathToFileURL(join(root, "scripts/native-child-options.ts")).href
  );
  const { prepareNativeProductionTls } = await import(
    pathToFileURL(join(root, "scripts/native-production-tls.ts")).href
  );
  requireTestDatabase();
  const nodeOptions = nativeChildNodeOptions(process.env);
  adapterStage("native-tls");
  const tls = await prepareNativeProductionTls();
  adapterStage("native-startup");
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "./node_modules/@playwright/test/cli.js",
      "test",
      "--config",
      "playwright.production.config.ts",
      "--reporter",
      reporter,
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "development",
        V4_COMMUNITIES_ENABLED: "false",
        TALEATLAS_TEST_TLS_DIRECTORY: dirname(tls.certificatePath),
        TALEATLAS_TEST_TLS_SPKI: tls.spki,
        NODE_EXTRA_CA_CERTS: tls.caPath,
        ...(nodeOptions === undefined ? {} : { NODE_OPTIONS: nodeOptions }),
      },
    },
  );
  child.once("spawn", () => adapterStage("native-startup", true));
  const status = await new Promise((done, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => done(code ?? 1));
  });
  process.exitCode = status;
}
async function main() {
  requireGuard(
    process.argv.length === 2 &&
      process.platform === "linux" &&
      process.env.CI === "true",
  );
  requireGuard(
    process.env.GITHUB_REPOSITORY === "Tran-Nhat-Duy1206/TaleAtlas" &&
      process.env.GITHUB_EVENT_NAME === "push",
  );
  requireGuard(
    process.env.GITHUB_REF === "refs/heads/diagnostics/v6a-a6-legacy-2951947" &&
      process.env.GITHUB_RUN_ATTEMPT === "1",
  );
  // Mandatory legacy preparation does not set NODE_ENV. In particular, never
  // let the native phase's development setting contaminate the production build.
  requireGuard(
    process.env.NODE_ENV === undefined &&
      git("rev-parse", "HEAD") === SUT_SHA &&
      git("status", "--porcelain") === "",
  );
  requireGuard(process.versions.node.split(".")[0] === "24");
  const temp = realpathSync(process.env.RUNNER_TEMP || "");
  privateDirectory = join(temp, "a6-legacy-" + randomUUID());
  mkdirSync(privateDirectory, { mode: 0o700 });
  const environment = {
    ...process.env,
    DATABASE_URL:
      "postgresql://taleatlas_test:synthetic_ci_only@127.0.0.1:5432/taleatlas_test",
    DATABASE_URL_DIRECT:
      "postgresql://taleatlas_test:synthetic_ci_only@127.0.0.1:5432/taleatlas_test",
    TEST_DATABASE_URL:
      "postgresql://taleatlas_test:synthetic_ci_only@127.0.0.1:5432/taleatlas_test",
    BETTER_AUTH_SECRET: "synthetic-ci-auth-secret-not-for-production-12345",
    APP_ORIGIN: "http://127.0.0.1:3000",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "1025",
    SMTP_FROM: "TaleAtlas <test@example.invalid>",
    A6_DIAG_PRIVATE: privateDirectory,
    A6_DIAG_SUT: root,
  };
  const pnpmVersion = execFileSync("pnpm", ["--version"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  requireGuard(pnpmVersion === "11.7.0");
  await preparePostgres(environment);
  // Same commands, environment and ordering as ci.yml e2e_legacy preparation.
  runStage(
    "frozen-install",
    "pnpm",
    ["install", "--frozen-lockfile"],
    environment,
  );
  runStage("migrate-first", "pnpm", ["db:migrate"], environment);
  runStage("migrate-second", "pnpm", ["db:migrate"], environment);
  runStage("generate", "pnpm", ["db:generate"], environment);
  runStage(
    "drift",
    "git",
    ["diff", "--exit-code", "--", "packages/database/drizzle"],
    environment,
  );
  runStage("production-build", "pnpm", ["build"], environment);
  runStage("typecheck", "pnpm", ["typecheck"], environment);
  runStage(
    "chromium",
    "pnpm",
    ["exec", "playwright", "install", "--with-deps", "chromium"],
    environment,
  );
  stage = "reporter-safety";
  manifest = await buildManifest(root);
  requireGuard(await selfTest(root));
  // An exclusive budget fence prevents a second native invocation in this job.
  closeSync(openSync(join(privateDirectory, "native-once"), "wx", 0o600));
  stage = "native-startup";
  const fd = openSync(join(privateDirectory, "raw.log"), "a", 0o600);
  let child;
  try {
    child = spawnSync(
      process.execPath,
      ["--import", "tsx", fileURLToPath(import.meta.url), "--native"],
      {
        cwd: root,
        stdio: ["ignore", fd, fd],
        env: {
          ...environment,
          NODE_ENV: "development",
          TEST_SMTP_PORT: "1025",
          TALEATLAS_TEST_NATIVE_SERVER_MODE: "production",
        },
      },
    );
  } finally {
    closeSync(fd);
  }
  let result;
  let adapter = { stage: "native-startup", playwrightStarted: false };
  const marker = join(privateDirectory, "adapter-stage.json");
  if (existsSync(marker)) {
    requireGuard(
      !lstatSync(marker).isSymbolicLink() && lstatSync(marker).size <= 4096,
    );
    const state = JSON.parse(readFileSync(marker, "utf8"));
    requireGuard(
      Object.keys(state).sort().join(",") === "playwrightStarted,stage" &&
        STAGES.includes(state.stage) &&
        typeof state.playwrightStarted === "boolean",
    );
    adapter = state;
  }
  const safePath = join(privateDirectory, "safe-result.json");
  if (existsSync(safePath)) {
    requireGuard(
      !lstatSync(safePath).isSymbolicLink() &&
        lstatSync(safePath).size <= 128000,
    );
    stage = "reporter-safety";
    result = validateResult(
      JSON.parse(readFileSync(safePath, "utf8")),
      manifest,
    );
    result.playwrightStarted =
      result.playwrightStarted || adapter.playwrightStarted;
  } else {
    result = blankResult(adapter.stage, "fail");
    result.playwrightStarted = adapter.playwrightStarted;
  }
  // Never convert a failed child, or a reporter error, into an apparent PASS.
  if (child.error || child.status !== 0) result.outcome = "fail";
  const bothChannels = publish(result);
  process.exitCode =
    bothChannels && result.outcome === "pass" && child.status === 0 ? 0 : 1;
}
if (process.argv[2] === "--native") {
  await nativeAdapter().catch(() => {
    process.exitCode = 1;
  });
} else {
  await main()
    .catch(() => {
      // No exception string or environment value may reach either public channel.
      try {
        publish(blankResult(stage, "fail"));
      } catch {
        /* Fail closed if even the trusted projection cannot be produced. */
      }
      process.exitCode = 1;
    })
    .finally(stopOwnedPostgres);
}
