// Explicitly authorized expanded passive diagnostic, never mandatory acceptance.
// Full original-disabled discovery follows the unchanged build in its own workflow.
// This development workload is NOT identical first-12-Quality-gate conditioning.
// CLI arguments intentionally retain the wrapper's single disabled phase.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const safeErrorCodes = new Set([
  "ECONNRESET",
  "EPIPE",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ECONNABORTED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ERR_STREAM_PREMATURE_CLOSE",
  "ERR_HTTP_REQUEST_TIMEOUT",
  "ERR_SOCKET_CLOSED",
  "OTHER",
]);
const summary = {
  diagnosticOnly: true,
  productAcceptance: false,
  reproductionEstablished: false,
  fullOriginalDisabledDiscovery: true,
  expectedOriginalDisabledScenarios: 17,
  conditioning: "build-preceded-development-not-identical-full-quality-gates",
  serverSocketsBeforeFirstHTTPRequestNotObserved: true,
  numericSocketFactsDoNotEstablishPairingOrWireCause: true,
  workers: 1,
  retries: 0,
  serverMode: "development",
  originalConfigTestsDeadlinesAndTransportDefaultsUnchanged: true,
  childExitCode: null,
  childSignal: null,
  observedFiles: 0,
  observedEvents: 0,
  errorClasses: {},
  errorCountersAreObservationsNotUniqueIncidentsOrRetries: true,
  nodeHTTPOnlyNotBrowserUndiciOrPostgresCoverage: true,
  crossProcessSocketPairingNotEstablished: true,
  ownedPrivateArtifactsRetained: false,
};
let output, log, child;
let result = 1;
try {
  // Diagnostic workflow only; never silently reuse a local operator fixture.
  if (process.env.CI !== "true" || process.platform !== "linux")
    throw new Error("DIAGNOSTIC_CI_LINUX_REQUIRED");
  const databaseValue = process.env.TEST_DATABASE_URL;
  if (!databaseValue) throw new Error("GUARDED_SYNTHETIC_DATABASE_REQUIRED");
  const database = new URL(databaseValue);
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) ||
    !/^\/[a-zA-Z0-9_]+_test$/.test(database.pathname)
  )
    throw new Error("GUARDED_SYNTHETIC_DATABASE_REQUIRED");
  if (
    process.env.DATABASE_URL !== databaseValue ||
    process.env.DATABASE_URL_DIRECT !== databaseValue
  )
    throw new Error("MATCHING_SYNTHETIC_DATABASES_REQUIRED");
  if (
    (process.env.APP_ORIGIN !== undefined &&
      process.env.APP_ORIGIN !== "http://127.0.0.1:3000") ||
    (process.env.E2E_PORT !== undefined && process.env.E2E_PORT !== "3000") ||
    (process.env.TEST_SMTP_PORT !== undefined &&
      process.env.TEST_SMTP_PORT !== "1025")
  )
    throw new Error("ORIGINAL_DIAGNOSTIC_LOOPBACK_PORTS_REQUIRED");
  if (process.env.TALEATLAS_TEST_NATIVE_HEAP_MB !== undefined)
    throw new Error("NO_NEW_DIAGNOSTIC_HEAP_OPT_IN");
  const existingOptions = process.env.NODE_OPTIONS ?? "";
  // Preserve any supplied, safely composable existing options byte-for-byte.
  // Refuse unknown preload/eval/quoted grammar rather than stripping options.
  if (
    existingOptions &&
    !/^(?:--(?:max[-_]old[-_]space[-_]size=\d+|tls-min-v1\.[23]|tls-max-v1\.[23]|use-system-ca|use-bundled-ca|use-openssl-ca|enable-source-maps)(?: +|$))+$/.test(
      existingOptions,
    )
  )
    throw new Error("UNEXPECTED_DIAGNOSTIC_NODE_OPTIONS");
  output = join(root, ".local", "v4-http-transport-diagnostic", randomUUID());
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output, { recursive: false, mode: 0o700 });
  log = await open(join(output, "private-child-output.log"), "wx", 0o600);
  const observer = join(root, "scripts", "v4-http-transport-observer.cjs");
  const options = `${existingOptions ? existingOptions + " " : ""}--require ${JSON.stringify(observer)}`;
  child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/test-e2e.ts", "--workers=1", "--retries=0"],
    {
      cwd: root,
      // No captured pipes or inline private console/trace output.
      stdio: ["ignore", log.fd, log.fd],
      env: {
        ...process.env,
        TEST_DATABASE_URL: databaseValue,
        APP_ORIGIN: "http://127.0.0.1:3000",
        E2E_PORT: "3000",
        NODE_ENV: "development",
        TALEATLAS_TEST_NATIVE_SERVER_MODE: "development",
        V4_COMMUNITIES_ENABLED: "false",
        NODE_OPTIONS: options,
        TALEATLAS_V4_HTTP_DIAGNOSTIC_ONLY: "true",
        TALEATLAS_V4_HTTP_DIAGNOSTIC_DIRECTORY: output,
      },
    },
  );
  const outcome = await new Promise((done, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => done({ code, signal }));
  });
  result = outcome.code ?? 1;
  summary.childExitCode = result;
  summary.childSignal = ["SIGTERM", "SIGINT", "SIGKILL"].includes(
    outcome.signal,
  )
    ? outcome.signal
    : outcome.signal
      ? "OTHER"
      : null;
} catch {
  // Never emit an exception message/stack containing DB URLs or private paths.
  summary.runnerErrorClass = child
    ? "CHILD_OR_IO_ERROR"
    : "PRECONDITION_OR_IO_ERROR";
  result = 1;
} finally {
  if (log) await log.close();
  if (output) {
    try {
      // Read ONLY this invocation's owned child log. Emit numeric footer facts,
      // never raw lines, test names, traces, URLs, exception messages or bodies.
      const childText = await readFile(
        join(output, "private-child-output.log"),
        "utf8",
      );
      const counts = {
        passed: 0,
        failed: 0,
        skipped: 0,
        flaky: 0,
        interrupted: 0,
        didNotRun: 0,
      };
      const seen = new Set();
      let ambiguousFooter = false;
      for (const rawLine of childText.split(/\r?\n/)) {
        const line = rawLine.replace(/\u001b\[[0-9;]*m|\^\[\[[0-9;]*m/g, "");
        const match =
          /^\s*(\d+) (passed|failed|skipped|flaky|interrupted|did not run)(?:\s+\([0-9.]+(?:ms|s|m|h)\))?\s*$/.exec(
            line,
          );
        if (!match) continue;
        const key = match[2] === "did not run" ? "didNotRun" : match[2];
        const value = Number(match[1]);
        if (seen.has(key) || !Number.isSafeInteger(value))
          ambiguousFooter = true;
        seen.add(key);
        counts[key] = value;
      }
      summary.originalDisabledFooterCounts = counts;
      summary.originalDisabledFooterRecognized =
        seen.size > 0 && !ambiguousFooter;
      summary.originalDisabledAll17PassedNoSkips =
        summary.childExitCode === 0 &&
        summary.originalDisabledFooterRecognized &&
        counts.passed === 17 &&
        counts.failed === 0 &&
        counts.skipped === 0 &&
        counts.flaky === 0 &&
        counts.interrupted === 0 &&
        counts.didNotRun === 0;
      if (
        summary.childExitCode === 0 &&
        !summary.originalDisabledAll17PassedNoSkips
      ) {
        summary.originalDisabledFooterRejected = true;
        if (result === 0) result = 1;
      }
      const files = (await readdir(output)).filter((name) =>
        /^\d+-(?:client|server)\.jsonl$/.test(name),
      );
      summary.observedFiles = files.length;
      for (const name of files) {
        // Only this run's WHITELISTED observations here; the owned numeric-footer
        // projection above is the sole raw-log read. No existing traces/artifacts
        // or operator configuration/env files are inspected.
        const text = await readFile(join(output, name), "utf8");
        for (const line of text.split("\n")) {
          if (!line) continue;
          try {
            const record = JSON.parse(line);
            summary.observedEvents++;
            if (safeErrorCodes.has(record.errorClass))
              summary.errorClasses[record.errorClass] =
                (summary.errorClasses[record.errorClass] ?? 0) + 1;
          } catch {
            summary.malformedObservationRows =
              (summary.malformedObservationRows ?? 0) + 1;
          }
        }
      }
      if (
        !files.some((name) => name.endsWith("-client.jsonl")) ||
        !files.some((name) => name.endsWith("-server.jsonl")) ||
        summary.observedEvents === 0
      ) {
        summary.instrumentationCoverageMissing = true;
        if (result === 0) result = 1;
      }
      summary.diagnosticExitCode = result;
      summary.ownedPrivateArtifactsRetained = true;
      await writeFile(
        join(output, "safe-summary.json"),
        JSON.stringify(summary, null, 2) + "\n",
        { flag: "wx", mode: 0o600 },
      );
    } catch {
      summary.observationCollectionError = true;
      if (result === 0) result = 1;
    }
  }
  console.info(JSON.stringify(summary));
  // A failed selected test is never converted into a successful diagnostic run.
  process.exitCode = result;
}
