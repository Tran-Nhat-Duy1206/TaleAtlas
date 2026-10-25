// One authorized Linux execution only. No application/test/config edits or raw uploads.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  validateReceipt,
  renderSummary,
} from "./a4-legacy-diagnostic-reporter.mjs";

const SUT_SHA = "5d9a40207ea6b5969296c17d072c4ab090eda245";
const BRANCH = "refs/heads/diagnostics/v6a-a4-legacy-5d9a402";
const stages = new Set([
  "guard",
  "database-start",
  "database-ready",
  "frozen-install",
  "migration-first",
  "migration-repeat",
  "migration-drift",
  "build",
  "types",
  "chromium-install",
  "sut-integrity",
  "native-bootstrap",
  "native-guard",
  "native-tls",
  "playwright-launch",
  "complete-legacy",
  "safe-result",
]);
let stage = "guard";
let privateDirectory;
let logFd;
let summaryPath;
function fixedSummary(outcome, category) {
  const safeStage = stages.has(stage) ? stage : "guard";
  return `## A4 exact-source Linux diagnostic\n\nSUT: \`${SUT_SHA}\`\n\nOutcome: ${outcome}\n\nStage: ${safeStage}\n\nCategory: ${category}\n\nTest identity/assertion: unavailable; no raw diagnostics disclosed.\n`;
}
function publish(text) {
  if (!summaryPath || typeof text !== "string" || text.length > 50000)
    throw new Error("Summary unavailable");
  writeFileSync(summaryPath, text, { encoding: "utf8", flag: "a" });
}
function child(command, args, cwd, env, capture = false) {
  return new Promise((resolveChild) => {
    const proc = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", capture ? "pipe" : logFd, logFd],
    });
    let text = "";
    if (capture)
      proc.stdout.on("data", (data) => {
        if (text.length < 4096) text += data.toString("utf8");
      });
    proc.once("error", () => resolveChild({ code: 1, text: "" }));
    proc.once("exit", (code) => resolveChild({ code: code ?? 1, text }));
  });
}
async function required(command, args, sut, env) {
  const result = await child(command, args, sut, env);
  if (result.code !== 0) throw new Error("Private stage failed");
  console.log(`A4_DIAG_STAGE ${stage} PASS`);
}
async function phase() {
  // Same guard/TLS/child options and production config as the mandatory native phase.
  const sut = resolve(process.env.A4_DIAG_SUT ?? "");
  const { requireTestDatabase } = await import(
    pathToFileURL(join(sut, "tests/helpers/test-database.ts"))
  );
  const { nativeChildNodeOptions } = await import(
    pathToFileURL(join(sut, "scripts/native-child-options.ts"))
  );
  const { prepareNativeProductionTls } = await import(
    pathToFileURL(join(sut, "scripts/native-production-tls.ts"))
  );
  const phaseStageFile = join(
    process.env.A4_DIAG_PRIVATE_DIRECTORY ?? "",
    "phase-stage.txt",
  );
  writeFileSync(phaseStageFile, "native-guard", { mode: 0o600, flag: "wx" });
  requireTestDatabase();
  if (
    process.env.CI !== "true" ||
    process.env.GITHUB_RUN_ATTEMPT !== "1" ||
    process.env.TALEATLAS_TEST_NATIVE_SERVER_MODE !== "production" ||
    process.env.SMTP_PORT !== "1025" ||
    process.env.TEST_SMTP_PORT !== "1025" ||
    process.env.V4_COMMUNITIES_ENABLED !== "false" ||
    process.argv.length !== 3
  )
    throw new Error("Phase refused");
  const options = nativeChildNodeOptions(process.env);
  writeFileSync(phaseStageFile, "native-tls", { mode: 0o600 });
  const tls = await prepareNativeProductionTls();
  const reporter = join(
    dirname(fileURLToPath(import.meta.url)),
    "a4-legacy-diagnostic-reporter.mjs",
  );
  const env = {
    ...process.env,
    NODE_ENV: "development",
    V4_COMMUNITIES_ENABLED: "false",
    TALEATLAS_TEST_TLS_DIRECTORY: dirname(tls.certificatePath),
    TALEATLAS_TEST_TLS_SPKI: tls.spki,
    NODE_EXTRA_CA_CERTS: tls.caPath,
    ...(options === undefined ? {} : { NODE_OPTIONS: options }),
  };
  // ONLY deviation in the Playwright invocation: safe reporter replaces list/html.
  // No selection, retry, worker, timeout, trace, browser or test overrides.
  writeFileSync(phaseStageFile, "playwright-launch", { mode: 0o600 });
  const proc = spawn(
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
    { cwd: sut, env, stdio: "inherit" },
  );
  const code = await new Promise((resolveCode) => {
    proc.once("error", () => resolveCode(1));
    proc.once("exit", (value) => resolveCode(value ?? 1));
  });
  process.exitCode = code;
}
async function run() {
  if (
    process.platform !== "linux" ||
    process.env.CI !== "true" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_EVENT_NAME !== "push" ||
    process.env.GITHUB_REF !== BRANCH ||
    process.env.GITHUB_RUN_ATTEMPT !== "1" ||
    process.env.GITHUB_REPOSITORY !== "Tran-Nhat-Duy1206/TaleAtlas"
  )
    throw new Error("Execution refused");
  const workspace = realpathSync(process.env.GITHUB_WORKSPACE ?? "");
  const temporary = realpathSync(process.env.RUNNER_TEMP ?? "");
  const sut = join(workspace, "sut");
  if (realpathSync(sut) !== sut || lstatSync(sut).isSymbolicLink())
    throw new Error("SUT refused");
  summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (
    !summaryPath ||
    !isAbsolute(summaryPath) ||
    !resolve(summaryPath).startsWith(temporary + "/") ||
    lstatSync(summaryPath).isSymbolicLink()
  )
    throw new Error("Summary refused");
  if (
    process.env.DATABASE_URL ||
    process.env.TEST_DATABASE_URL ||
    process.env.NODE_EXTRA_CA_CERTS ||
    process.env.TALEATLAS_TEST_TLS_DIRECTORY ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  )
    throw new Error("Ambient service settings refused");
  process.umask(0o077);
  privateDirectory = mkdtempSync(join(temporary, "a4-legacy-private-"));
  chmodSync(privateDirectory, 0o700);
  logFd = openSync(join(privateDirectory, "private-output.log"), "wx", 0o600);
  const head = await child(
    "git",
    ["rev-parse", "HEAD"],
    sut,
    process.env,
    true,
  );
  const clean = await child(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    sut,
    process.env,
    true,
  );
  if (
    head.code ||
    head.text.trim() !== SUT_SHA ||
    clean.code ||
    clean.text.trim()
  )
    throw new Error("Exact source refused");
  const databasePassword = randomBytes(32).toString("hex");
  const databaseName = "taleatlas_a4_legacy_test";
  const databaseUser = "taleatlas_test";
  const databaseUrl = `postgresql://${databaseUser}:${databasePassword}@127.0.0.1:5432/${databaseName}`;
  const env = {
    ...process.env,
    POSTGRES_USER: databaseUser,
    POSTGRES_PASSWORD: databasePassword,
    POSTGRES_DB: databaseName,
    DATABASE_URL: databaseUrl,
    DATABASE_URL_DIRECT: databaseUrl,
    TEST_DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: randomBytes(48).toString("hex"),
    APP_ORIGIN: "http://127.0.0.1:3000",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "1025",
    TEST_SMTP_PORT: "1025",
    SMTP_FROM: "TaleAtlas <test@example.invalid>",
    V4_COMMUNITIES_ENABLED: "false",
    TALEATLAS_TEST_NATIVE_SERVER_MODE: "production",
    A4_DIAG_SUT: sut,
    A4_DIAG_PRIVATE_DIRECTORY: privateDirectory,
    A4_DIAG_RESULT_FILE: join(privateDirectory, "safe-result.json"),
  };
  const container = `taleatlas-a4-${process.env.GITHUB_RUN_ID}`;
  if (!/^taleatlas-a4-[0-9]+$/.test(container))
    throw new Error("Container identity refused");
  stage = "database-start";
  // Linux runner only: disposable local PG17. Password values are never CLI arguments/public env.
  await required("docker", ["pull", "postgres:17"], sut, env);
  await required(
    "docker",
    [
      "run",
      "--detach",
      "--name",
      container,
      "--publish",
      "127.0.0.1:5432:5432",
      "--env",
      "POSTGRES_USER",
      "--env",
      "POSTGRES_PASSWORD",
      "--env",
      "POSTGRES_DB",
      "postgres:17",
    ],
    sut,
    env,
  );
  stage = "database-ready";
  let ready = false;
  for (let i = 0; i < 50; i++) {
    if (
      (
        await child(
          "docker",
          [
            "exec",
            container,
            "pg_isready",
            "-U",
            databaseUser,
            "-d",
            databaseName,
          ],
          sut,
          env,
        )
      ).code === 0
    ) {
      ready = true;
      break;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  if (!ready) throw new Error("Disposable database unavailable");
  const preparation = [
    ["frozen-install", "pnpm", ["install", "--frozen-lockfile"]],
    ["migration-first", "pnpm", ["db:migrate"]],
    ["migration-repeat", "pnpm", ["db:migrate"]],
    ["migration-drift", "pnpm", ["db:generate"]],
    [
      "migration-drift",
      "git",
      ["diff", "--exit-code", "--", "packages/database/drizzle"],
    ],
    ["build", "pnpm", ["build"]],
    ["types", "pnpm", ["typecheck"]],
    [
      "chromium-install",
      "pnpm",
      ["exec", "playwright", "install", "--with-deps", "chromium"],
    ],
    ["sut-integrity", "git", ["diff", "--exit-code", "--"]],
  ];
  for (const [name, command, args] of preparation) {
    stage = name;
    await required(command, args, sut, env);
  }
  stage = "native-bootstrap";
  const fence = openSync(
    join(privateDirectory, "complete-suite.ONCE"),
    "wx",
    0o600,
  );
  closeSync(fence);
  stage = "complete-legacy";
  // Exactly one child invocation; startup failure cannot trigger a second attempt.
  const execution = await child(
    process.execPath,
    [
      "--import",
      join(sut, "node_modules/tsx/dist/loader.mjs"),
      fileURLToPath(import.meta.url),
      "phase",
    ],
    sut,
    { ...env, NODE_ENV: "development" },
  );
  stage = "safe-result";
  if (!existsSync(env.A4_DIAG_RESULT_FILE)) {
    const phaseFile = join(privateDirectory, "phase-stage.txt");
    if (existsSync(phaseFile)) {
      const phaseStat = lstatSync(phaseFile);
      if (
        phaseStat.isFile() &&
        !phaseStat.isSymbolicLink() &&
        phaseStat.size < 40
      ) {
        const value = readFileSync(phaseFile, "utf8");
        if (["native-guard", "native-tls", "playwright-launch"].includes(value))
          stage = value;
      }
    }
    publish(fixedSummary("FAIL", "startup; Playwright receipt unavailable"));
    process.exitCode = 1;
    return;
  }
  const stat = lstatSync(env.A4_DIAG_RESULT_FILE);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > 200000 ||
    (stat.mode & 0o077) !== 0
  )
    throw new Error("Receipt refused");
  const receipt = JSON.parse(readFileSync(env.A4_DIAG_RESULT_FILE, "utf8"));
  if (!validateReceipt(receipt)) {
    publish("## A4 exact-source Linux diagnostic\n\nSANITIZER REFUSED\n");
    process.exitCode = 1;
    return;
  }
  publish(
    `SUT: \`${SUT_SHA}\`\n\nDiagnostic-only difference: safe reporter replaces list/html. Complete selection, timeouts, workers, retries and fixtures unchanged.\n\n${renderSummary(receipt)}`,
  );
  console.log("A4_DIAG_SANITIZED_SUMMARY_WRITTEN");
  process.exitCode =
    execution.code === 0 &&
    receipt.status === "passed" &&
    receipt.sanitizer === "ok"
      ? 0
      : 1;
}
try {
  if (process.argv[2] === "phase") await phase();
  else if (process.argv.length === 2) await run();
  else throw new Error("Mode refused");
} catch (error) {
  // Errors are never echoed. Raw information remains restricted to this runner.
  if (logFd !== undefined)
    writeFileSync(logFd, String(error?.stack ?? "private stage failure"));
  if (process.argv[2] !== "phase") {
    try {
      publish(fixedSummary("FAIL", "startup-or-infrastructure"));
    } catch {
      /* fail closed */
    }
    console.log(
      `A4_DIAG_REFUSED_OR_FAILED ${stages.has(stage) ? stage : "guard"}`,
    );
  }
  process.exitCode = 1;
} finally {
  if (logFd !== undefined) closeSync(logFd);
  // No uploads or explicit deletion. Private data dies with the GitHub-hosted runner.
}
