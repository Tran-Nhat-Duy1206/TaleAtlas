// Explicitly authorized expanded passive diagnostic, never mandatory acceptance.
// Own workflow mirrors unchanged Quality pre-native commands and synthetic setup.
// Actual workflow steps must verify that expected prefix; this runner cannot.
// Matching preparation is NOT identical runner timing or causal proof.
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
// Export only validated records to the artifact directory. Raw child logs and
// private Playwright output never match the workflow's upload paths.
const nodeObservationKeys = new Set([
  "pid",
  "processKind",
  "role",
  "timeOriginMs",
  "atMs",
  "event",
  "connection",
  "request",
  "category",
  "reusedSocket",
  "idleAgeMs",
  "idleAtAssignmentMs",
  "idleAtStartMs",
  "requestAgeMs",
  "agentKeepAlive",
  "agentKeepAliveMsecs",
  "agentTimeoutMs",
  "agentKeepAliveTimeoutBufferMs",
  "socketTimeoutMs",
  "status",
  "complete",
  "keepAliveTimeoutMs",
  "keepAliveTimeoutBufferMs",
  "requestTimeoutMs",
  "headersTimeoutMs",
  "serverTimeoutMs",
  "hadError",
  "errorClass",
  "localPort",
  "remotePort",
  "loopback",
  "family",
  "tupleCapturedAtMs",
  "observedFrom",
]);
const nodeObservationEnums = {
  family: new Set(["IPv4", "IPv6", "unknown"]),
  observedFrom: new Set([
    "client-assignment",
    "server-http-request",
    "unknown",
  ]),
  processKind: new Set(["node-http"]),
  role: new Set(["client", "server"]),
  category: new Set([
    "private-library-sessions",
    "private-owned-request",
    "other",
  ]),
  event: new Set([
    "socket-observed",
    "socket-connected",
    "socket-error",
    "socket-close",
    "request-error",
    "request-start",
    "response-observed",
    "response-end",
    "response-finish",
  ]),
  errorClass: safeErrorCodes,
};
const nodeObservationBooleans = new Set([
  "reusedSocket",
  "agentKeepAlive",
  "complete",
  "hadError",
  "loopback",
]);
function validateNodeObservation(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  if (
    !nodeObservationEnums.role.has(row.role) ||
    row.processKind !== "node-http" ||
    !nodeObservationEnums.event.has(row.event) ||
    !Number.isSafeInteger(row.pid) ||
    row.pid < 1 ||
    typeof row.timeOriginMs !== "number" ||
    !Number.isFinite(row.timeOriginMs) ||
    row.timeOriginMs < 0 ||
    typeof row.atMs !== "number" ||
    !Number.isFinite(row.atMs) ||
    row.atMs < 0
  )
    return false;
  return Object.entries(row).every(([key, value]) => {
    if (!nodeObservationKeys.has(key)) return false;
    if (nodeObservationEnums[key]) return nodeObservationEnums[key].has(value);
    if (nodeObservationBooleans.has(key))
      return value === null || typeof value === "boolean";
    return (
      value === null ||
      (typeof value === "number" && Number.isFinite(value) && value >= 0)
    );
  });
}
const browserObservationKeys = [
  "v",
  "diagnosticOnly",
  "locale",
  "event",
  "atMs",
  "sourceAtMs",
  "phase",
  "route",
  "requestOrdinal",
  "status",
  "reason",
  "initiator",
  "hmrKind",
  "errorClass",
  "canceled",
  "mainFrame",
  "hmrInitiator",
  "success",
  "droppedRows",
];
const browserObservationEnums = {
  locale: new Set(["en", "vi"]),
  event: new Set([
    "fixture-ready",
    "work-goto",
    "work-loaded",
    "discussion-click",
    "discussion-click-complete",
    "heading-visible",
    "probe-error",
    "teardown",
    "probe-summary",
    "navigation-requested",
    "navigation-started",
    "navigation-committed",
    "request-start",
    "request-finished",
    "request-failed",
    "response",
    "hmr-connected",
    "hmr-message",
  ]),
  phase: new Set(["setup", "flow", "teardown"]),
  route: new Set([
    "public-work",
    "public-discussions",
    "framework-resource",
    "auth",
    "other",
    "unknown",
  ]),
  reason: new Set([
    "anchorClick",
    "formSubmissionGet",
    "formSubmissionPost",
    "httpHeaderRefresh",
    "initialFrameNavigation",
    "metaTagRefresh",
    "pageBlockInterstitial",
    "reload",
    "scriptInitiated",
    "differentDocument",
    "sameDocument",
    "Navigation",
    "BackForwardCacheRestore",
    "unknown",
  ]),
  initiator: new Set([
    "parser",
    "script",
    "preload",
    "preflight",
    "SignedExchange",
    "other",
    "unknown",
  ]),
  hmrKind: new Set([
    "building",
    "built",
    "reloadPage",
    "reload",
    "serverComponentChanges",
    "clientChanges",
    "pagesManifest",
    "middlewareChanges",
    "connected",
    "sync",
    "turbopack-connected",
    "turbopack-message",
    "TURBOPACK_MESSAGE",
    "update",
    "partial",
    "restart",
    "issues",
    "clear",
    "notFound",
    "unknown",
  ]),
  errorClass: new Set([
    "ERR_ABORTED",
    "ERR_CONNECTION_RESET",
    "ERR_CONNECTION_REFUSED",
    "ERR_EMPTY_RESPONSE",
    "ERR_FAILED",
    "OTHER",
    "unknown",
  ]),
};
const browserObservationBooleans = new Set([
  "canceled",
  "mainFrame",
  "hmrInitiator",
  "success",
]);
function validateBrowserObservation(row, locale) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  if (
    Object.keys(row).length !== browserObservationKeys.length ||
    !browserObservationKeys.every((key) => Object.hasOwn(row, key))
  )
    return false;
  if (row.v !== 1 || row.diagnosticOnly !== true || row.locale !== locale)
    return false;
  return Object.entries(row).every(([key, value]) => {
    if (["v", "diagnosticOnly"].includes(key)) return true;
    if (browserObservationEnums[key])
      return (
        (key === "errorClass" && value === null) ||
        browserObservationEnums[key].has(value)
      );
    if (browserObservationBooleans.has(key))
      return value === null || typeof value === "boolean";
    if (key === "atMs")
      return typeof value === "number" && Number.isFinite(value) && value >= 0;
    if (key === "sourceAtMs")
      return (
        value === null ||
        (typeof value === "number" && Number.isFinite(value) && value >= 0)
      );
    if (key === "status")
      return (
        value === null ||
        (Number.isInteger(value) && value >= 100 && value <= 599)
      );
    return value === null || (Number.isSafeInteger(value) && value >= 0);
  });
}
function parseBrowserProbeFooter(text) {
  const counts = {
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
    interrupted: 0,
    didNotRun: 0,
  };
  const seen = new Set();
  let ambiguous = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/(?:\u001b|\^\[)?\[[0-9;]*m/g, "");
    const match =
      /^\s*(\d+) (passed|failed|skipped|flaky|interrupted|did not run)(?:\s+\([0-9.]+(?:ms|s|m|h)\))?\s*$/.exec(
        line,
      );
    if (!match) continue;
    const key = match[2] === "did not run" ? "didNotRun" : match[2];
    if (seen.has(key) || !Number.isSafeInteger(Number(match[1])))
      ambiguous = true;
    seen.add(key);
    counts[key] = Number(match[1]);
  }
  return { counts, recognized: seen.size > 0 && !ambiguous };
}
const summary = {
  diagnosticOnly: true,
  productAcceptance: false,
  reproductionEstablished: false,
  fullOriginalDisabledDiscovery: true,
  expectedOriginalDisabledScenarios: 17,
  conditioning:
    "quality-pre-native-command-prefix-expected-not-identical-runner-timing",
  expectedPreNativeCommands: 12,
  preparationEvidenceRequiresActualWorkflowSteps: true,
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
  separateBrowserNavigationProbe: true,
  expectedBrowserNavigationProbeScenarios: 2,
  browserNavigationMetadataOnlyNotWireCauseCertificate: true,
  browserProbeDoesNotCertifyIdenticalFrozenSuiteTiming: true,
  browserProbeChildExitCode: null,
  browserProbeAll2PassedNoSkips: false,
  browserProbeReached: false,
  browserProbeRows: 0,
  sanitizedExportValidated: false,
};
let output, log, child, diagnosticEnvironment;
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
  diagnosticEnvironment = {
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
  };
  child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/test-e2e.ts", "--workers=1", "--retries=0"],
    {
      cwd: root,
      // No captured pipes or inline private console/trace output.
      stdio: ["ignore", log.fd, log.fd],
      env: diagnosticEnvironment,
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
      if (summary.originalDisabledAll17PassedNoSkips) {
        summary.browserProbeReached = true;
        let browserLog;
        try {
          browserLog = await open(
            join(output, "private-browser-child-output.log"),
            "wx",
            0o600,
          );
          const browserChild = spawn(
            process.execPath,
            [
              "--import",
              "tsx",
              "./node_modules/@playwright/test/cli.js",
              "test",
              "--config",
              "scripts/v4-browser-navigation-diagnostic.config.ts",
              "--workers=1",
              "--retries=0",
            ],
            {
              cwd: root,
              stdio: ["ignore", browserLog.fd, browserLog.fd],
              // New isolated diagnostic only. Original wrapper/configs stay frozen;
              // their selected-CLI branch deliberately remains default-off.
              env: { ...diagnosticEnvironment, V4_COMMUNITIES_ENABLED: "true" },
            },
          );
          const browserOutcome = await new Promise((done, reject) => {
            browserChild.once("error", reject);
            browserChild.once("exit", (code, signal) => done({ code, signal }));
          });
          summary.browserProbeChildExitCode = browserOutcome.code ?? 1;
          summary.browserProbeChildSignal = [
            "SIGTERM",
            "SIGINT",
            "SIGKILL",
          ].includes(browserOutcome.signal)
            ? browserOutcome.signal
            : browserOutcome.signal
              ? "OTHER"
              : null;
          const footer = parseBrowserProbeFooter(
            await readFile(
              join(output, "private-browser-child-output.log"),
              "utf8",
            ),
          );
          summary.browserProbeFooterCounts = footer.counts;
          summary.browserProbeFooterRecognized = footer.recognized;
          summary.browserProbeAll2PassedNoSkips =
            summary.browserProbeChildExitCode === 0 &&
            footer.recognized &&
            footer.counts.passed === 2 &&
            Object.entries(footer.counts).every(
              ([key, value]) => key === "passed" || value === 0,
            );
          if (!summary.browserProbeAll2PassedNoSkips)
            result = summary.browserProbeChildExitCode || 1;
        } catch {
          summary.browserProbeErrorClass = "CHILD_OR_IO_ERROR";
          result = 1;
        } finally {
          if (browserLog) await browserLog.close();
        }
      } else {
        summary.browserProbeNotReachedReason = "ORIGINAL_DISABLED_NOT_COMPLETE";
      }
      const sanitized = join(output, "sanitized");
      await mkdir(sanitized, { recursive: false, mode: 0o700 });
      const files = (await readdir(output)).filter((name) =>
        /^\d+-(?:client|server)\.jsonl$/.test(name),
      );
      summary.observedFiles = files.length;
      const validatedNodeFiles = [];
      for (const name of files) {
        // Only this run's WHITELISTED observations here; only owned child logs
        // are inspected above for the two separate numeric-footer projections.
        // No existing traces/artifacts or operator configuration files are read.
        const text = await readFile(join(output, name), "utf8");
        let validFile = true;
        const validatedRows = [];
        for (const line of text.split("\n")) {
          if (!line) continue;
          try {
            const record = JSON.parse(line);
            if (!validateNodeObservation(record))
              throw new Error("UNSAFE_OBSERVATION");
            validatedRows.push(record);
            summary.observedEvents++;
            if (safeErrorCodes.has(record.errorClass))
              summary.errorClasses[record.errorClass] =
                (summary.errorClasses[record.errorClass] ?? 0) + 1;
          } catch {
            validFile = false;
            summary.malformedObservationRows =
              (summary.malformedObservationRows ?? 0) + 1;
            result = 1;
          }
        }
        if (validFile && text.trim()) {
          // Canonicalize validated objects: never copy lexical source text,
          // which could hide a secret in an earlier duplicate JSON key.
          await writeFile(
            join(sanitized, name),
            validatedRows.map((row) => JSON.stringify(row)).join("\n") + "\n",
            {
              flag: "wx",
              mode: 0o600,
            },
          );
          validatedNodeFiles.push(name);
        }
      }
      let browserMetadataComplete = summary.browserProbeReached;
      if (summary.browserProbeReached) {
        for (const locale of ["en", "vi"]) {
          try {
            const name = `browser-${locale}.jsonl`;
            const text = await readFile(join(output, name), "utf8");
            const rows = text
              .split("\n")
              .filter(Boolean)
              .map((line) => JSON.parse(line));
            if (
              !rows.length ||
              rows.length > 10000 ||
              !rows.every((row) => validateBrowserObservation(row, locale))
            )
              throw new Error("UNSAFE_BROWSER_OBSERVATION");
            // Canonicalize only fully validated objects, not duplicate-key or
            // other discarded lexical input. Unvalidated leaves never upload.
            await writeFile(
              join(sanitized, name),
              rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
              {
                flag: "wx",
                mode: 0o600,
              },
            );
            summary.browserProbeRows += rows.length;
            const endings = rows.filter((row) => row.event === "probe-summary");
            if (
              endings.length !== 1 ||
              rows.at(-1) !== endings[0] ||
              endings[0].success !== true ||
              endings[0].droppedRows !== 0 ||
              !rows.some((row) => row.event === "heading-visible")
            )
              browserMetadataComplete = false;
          } catch {
            browserMetadataComplete = false;
            summary.browserMetadataMissingOrRejected = true;
          }
        }
        if (!browserMetadataComplete) {
          summary.browserProbeAll2PassedNoSkips = false;
          result = 1;
        }
      }
      summary.browserProbeMetadataComplete = browserMetadataComplete;
      summary.nodeHTTPObservationScope =
        "original17-and-isolated-browser-probe-when-reached";
      if (
        !validatedNodeFiles.some((name) => name.endsWith("-client.jsonl")) ||
        !validatedNodeFiles.some((name) => name.endsWith("-server.jsonl")) ||
        summary.observedEvents === 0
      ) {
        summary.instrumentationCoverageMissing = true;
        if (result === 0) result = 1;
      }
      summary.diagnosticExitCode = result;
      summary.ownedPrivateArtifactsRetained = true;
      summary.sanitizedExportValidated = true;
      const summaryText = JSON.stringify(summary, null, 2) + "\n";
      await writeFile(join(output, "safe-summary.json"), summaryText, {
        flag: "wx",
        mode: 0o600,
      });
      await writeFile(join(sanitized, "safe-summary.json"), summaryText, {
        flag: "wx",
        mode: 0o600,
      });
    } catch {
      summary.observationCollectionError = true;
      if (result === 0) result = 1;
    }
  }
  console.info(JSON.stringify(summary));
  // A failed selected test is never converted into a successful diagnostic run.
  process.exitCode = result;
}
