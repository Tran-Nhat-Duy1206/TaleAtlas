import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Projection only: never execute tests, print report strings, or change their exit.
const suite = "V5B real PostgreSQL publication/erasure lock ordering";
const cases = [
  [
    "V5D-C01",
    "canonical Work update vs approval: CANONICAL_UPDATE owns Work first; stale loser leaves the committed winner byte-for-byte unchanged",
  ],
  [
    "V5D-C02",
    "canonical Work update vs approval: APPROVAL owns Work first; stale loser leaves the committed winner byte-for-byte unchanged",
  ],
  [
    "V5D-C03",
    "unpublish vs approval: UNPUBLISH owns Work first; no stale visibility or metadata overwrite",
  ],
  [
    "V5D-C04",
    "unpublish vs approval: APPROVAL owns Work first; no stale visibility or metadata overwrite",
  ],
  [
    "V5D-C05",
    "distinct remove/replace proposals target the exact same title UUID: TITLE_REMOVE wins, the other remains privately SUBMITTED",
  ],
  [
    "V5D-C06",
    "distinct remove/replace proposals target the exact same title UUID: TITLE_REPLACE wins, the other remains privately SUBMITTED",
  ],
];
const states = new Map([
  ["passed", "PASS"],
  ["failed", "FAIL"],
  ["skipped", "SKIPPED"],
  ["todo", "SKIPPED"],
  ["pending", "UNKNOWN"],
]);
const countKeys = [
  "numTotalTests",
  "numPassedTests",
  "numFailedTests",
  "numPendingTests",
  "numTodoTests",
];
const unknown = () =>
  [
    ...cases.map(([id]) => `${id} UNKNOWN`),
    "V5D_REPORT UNKNOWN",
    "V5D_COUNTS UNKNOWN",
    "V5D_FAILURE_SCOPE UNKNOWN",
    "V5D_CATEGORY UNKNOWN",
  ].join("\n") + "\n";

function category(messages) {
  // Inspected privately; no error text or frame is interpolated into output.
  const text = messages.join("\n").replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
  if (
    /^(?:Error: )?SQL delivery gate exceeded 4\.5 seconds(?:\n|$)/m.test(text)
  )
    return "DELIVERY_GATE_TIMEOUT";
  if (
    /^(?:Error: )?Owned PostgreSQL lock dependency did not materialize within 4\.5 seconds(?:\n|$)/m.test(
      text,
    )
  )
    return "WORK_LOCK_BARRIER_TIMEOUT";
  if (
    /^(?:Error: )?Owned lock barrier unexpectedly has multiple waiters(?:\n|$)/m.test(
      text,
    )
  )
    return "MULTIPLE_LOCK_WAITERS";
  if (/^(?:Error: )?Test timed out in \d+ms/m.test(text)) return "TEST_TIMEOUT";
  if (/^(?:Error: )?Hook timed out in \d+ms/m.test(text)) return "HOOK_TIMEOUT";
  if (/^AssertionError:/m.test(text)) {
    // Fixed sites in the unchanged, approved test; no stack frame is emitted.
    const site =
      /^\s+(?:at\b|❯).*metadata-concurrency\.test\.ts:(\d+):\d+/m.exec(text);
    const sites = new Map([
      [304, "WINNER_RESULT_ASSERTION"],
      [313, "LOSER_ROLLBACK_ASSERTION"],
      [379, "PUBLICATION_SOURCE_ASSERTION"],
      [404, "WORK_ROW_SEARCH_ASSERTION"],
      [412, "PROPOSAL_HEADER_ASSERTION"],
      [430, "APPROVAL_EVENT_ASSERTION"],
      [450, "AUDIT_ROW_ASSERTION"],
      [471, "TYPED_EVIDENCE_ASSERTION"],
      ...[500, 501, 506, 508].map((line) => [
        line,
        "TITLE_PRESERVATION_ASSERTION",
      ]),
    ]);
    if (site && sites.has(Number(site[1]))) return sites.get(Number(site[1]));
    if (/catalog-auth-fixture\.ts:\d+:\d+/.test(text))
      return "AUTH_FIXTURE_ASSERTION";
    return "ASSERTION_FAILURE";
  }
  if (/^TypeError:/m.test(text)) return "JAVASCRIPT_TYPE_ERROR";
  return "UNCLASSIFIED_FAILURE";
}

export function summarize(report, exitCode, root = process.cwd()) {
  try {
    if (!Number.isInteger(exitCode) || exitCode < 0 || exitCode > 255)
      return unknown();
    if (
      !report ||
      typeof report.success !== "boolean" ||
      !Array.isArray(report.testResults)
    )
      return unknown();
    const counts = countKeys.map((key) => report[key]);
    if (
      !counts.every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 10000000)
    )
      return unknown();
    const [total, passed, failed, pending, todo] = counts;
    if (total !== passed + failed + pending + todo) return unknown();
    const rows = [];
    for (const file of report.testResults) {
      if (
        typeof file.name !== "string" ||
        !["passed", "failed"].includes(file.status) ||
        !Array.isArray(file.assertionResults) ||
        typeof file.message !== "string"
      )
        return unknown();
      for (const test of file.assertionResults) {
        if (
          typeof test.title !== "string" ||
          !Array.isArray(test.ancestorTitles) ||
          !test.ancestorTitles.every((s) => typeof s === "string") ||
          !states.has(test.status) ||
          !Array.isArray(test.failureMessages) ||
          !test.failureMessages.every((s) => typeof s === "string")
        )
          return unknown();
        if (test.status !== "failed" && test.failureMessages.length)
          return unknown();
        rows.push({ file, test });
      }
    }
    if (
      rows.length !== total ||
      rows.filter(({ test }) => test.status === "passed").length !== passed ||
      rows.filter(({ test }) => test.status === "failed").length !== failed ||
      rows.filter(({ test }) => ["pending", "skipped"].includes(test.status))
        .length !== pending ||
      rows.filter(({ test }) => test.status === "todo").length !== todo
    )
      return unknown();
    if (
      report.success &&
      (failed || report.testResults.some((file) => file.status === "failed"))
    )
      return unknown();
    const target = resolve(
      root,
      "tests/integration/metadata-concurrency.test.ts",
    );
    const matched = new Set();
    const output = [];
    const categories = new Set();
    let complete = true;
    let newFailure = false;
    for (const [id, title] of cases) {
      const hits = rows.filter(
        ({ file, test }) =>
          resolve(file.name) === target &&
          test.title === title &&
          test.ancestorTitles.at(-1) === suite,
      );
      const state =
        hits.length === 1 ? states.get(hits[0].test.status) : "UNKNOWN";
      output.push(`${id} ${state}`);
      if (state === "UNKNOWN") complete = false;
      if (hits.length === 1) matched.add(hits[0].test);
      if (state === "FAIL") {
        newFailure = true;
        const value = category(hits[0].test.failureMessages);
        output.push(`V5D_CATEGORY ${id} ${value}`);
        categories.add(value);
      }
    }
    let outsideFailure = rows.some(
      ({ test }) => test.status === "failed" && !matched.has(test),
    );
    let sharedSuiteFailure = false;
    for (const file of report.testResults) {
      if (
        file.status === "failed" &&
        (file.message.length > 0 ||
          !file.assertionResults.some((test) => test.status === "failed"))
      ) {
        categories.add("SUITE_OR_HOOK_FAILURE");
        if (resolve(file.name) === target) sharedSuiteFailure = true;
        else outsideFailure = true;
      }
    }
    for (const { test } of rows)
      if (test.status === "failed" && !matched.has(test))
        categories.add(category(test.failureMessages));
    const unattributed = exitCode !== 0 && report.success;
    if (unattributed) categories.add("UNATTRIBUTED_PROCESS_FAILURE");
    // Scope locates reported failures, not every possible unhandled process error.
    // COMPLETE means six uniquely reported states; it is not an integration PASS.
    const scope =
      !complete ||
      sharedSuiteFailure ||
      unattributed ||
      (!report.success && !newFailure && !outsideFailure)
        ? "UNKNOWN"
        : newFailure && outsideFailure
          ? "BOTH"
          : newFailure
            ? "SIX_CASES"
            : outsideFailure
              ? "OUTSIDE_SIX"
              : "NONE";
    output.push(`V5D_REPORT ${complete ? "COMPLETE" : "UNKNOWN"}`);
    output.push(
      `V5D_COUNTS TOTAL ${total} PASSED ${passed} FAILED ${failed} SKIPPED ${rows.filter(({ test }) => test.status === "skipped").length} PENDING ${rows.filter(({ test }) => test.status === "pending").length} TODO ${todo}`,
    );
    output.push(`V5D_FAILURE_SCOPE ${scope}`);
    for (const value of [...categories].sort())
      output.push(`V5D_CATEGORY ${value}`);
    if (!categories.size)
      output.push(`V5D_CATEGORY ${report.success ? "NONE" : "UNKNOWN"}`);
    return output.join("\n") + "\n";
  } catch {
    return unknown();
  }
}

// Independent, temporary SQL fingerprint. V5D summarize/classification above is
// unchanged. IDs and source bounds are reviewed against B2a head 565c6d36.
// CASE is the one-based assertionResults (test-case) ordinal, not an inner
// expect() ordinal. LOCATION is only an unambiguous reported source frame.
const sqlFiles = [
  ["F01", "auth-fixture-rate-limit.test.ts", 37],
  ["F02", "authentication.test.ts", 306],
  ["F03", "catalog-discovery-filters.test.ts", 821],
  ["F04", "catalog-provenance.test.ts", 950],
  ["F05", "catalog.test.ts", 750],
  ["F06", "community-budget-erasure.test.ts", 346],
  ["F07", "community-erasure.test.ts", 659],
  ["F08", "community-http.test.ts", 790],
  ["F09", "community-migration.test.ts", 529],
  ["F10", "community-moderation-http.test.ts", 1012],
  ["F11", "community-moderation.test.ts", 977],
  ["F12", "community-owned.test.ts", 545],
  ["F13", "community-review-http.test.ts", 723],
  ["F14", "community-reviews.test.ts", 457],
  ["F15", "community.test.ts", 1291],
  ["F16", "database.test.ts", 59],
  ["F17", "discovery.test.ts", 187],
  ["F18", "edit-suggestions.test.ts", 433],
  ["F19", "ingestion-http.test.ts", 350],
  ["F20", "ingestion-jobs.test.ts", 352],
  ["F21", "ingestion-moderation.test.ts", 512],
  ["F22", "ingestion-processing.test.ts", 696],
  ["F23", "ingestion-requests.test.ts", 353],
  ["F24", "library-event-batch-replan.test.ts", 498],
  ["F25", "library-http.test.ts", 959],
  ["F26", "library-personal-http.test.ts", 978],
  ["F27", "library-reading-http.test.ts", 1090],
  ["F28", "library.test.ts", 1964],
  ["F29", "metadata-citation.test.ts", 313],
  ["F30", "metadata-compatibility.test.ts", 301],
  ["F31", "metadata-concurrency.test.ts", 1345],
  ["F32", "metadata-persistence.test.ts", 574],
  ["F33", "metadata-preservation.test.ts", 908],
  ["F34", "metadata-suggestions.test.ts", 706],
  ["F35", "reader-profile-erasure.test.ts", 261],
  ["F36", "reader-profile-migration.test.ts", 421],
  ["F37", "reader-profile.test.ts", 553],
];
const sqlUnknown = () => "SQL_DIAG_REPORT UNKNOWN\n";
const sqlStatuses = ["passed", "failed", "skipped", "pending", "todo"];
function sqlOwn(record, key) {
  if (!record || typeof record !== "object") throw Error();
  const proto = Object.getPrototypeOf(record);
  if (proto !== Object.prototype && proto !== null) throw Error();
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !("value" in descriptor)) throw Error();
  return descriptor.value;
}
function sqlArray(value) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > 100000
  )
    throw Error();
  const result = [];
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !("value" in descriptor)) throw Error();
    result.push(descriptor.value);
  }
  return result;
}
function sqlStrings(value) {
  const result = sqlArray(value);
  if (!result.every((item) => typeof item === "string")) throw Error();
  return result;
}
function sqlCategory(messages) {
  if (messages.some((m) => m.length > 1000000)) return "UNKNOWN";
  const text = messages.join("\n").replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
  if (/^AssertionError:/m.test(text)) return "ASSERTION_FAILURE";
  if (/^(?:Error: )?Hook timed out in \d+ms/m.test(text)) return "HOOK_TIMEOUT";
  if (/^(?:Error: )?Test timed out in \d+ms/m.test(text)) return "TEST_TIMEOUT";
  if (/^TypeError:/m.test(text)) return "JAVASCRIPT_TYPE_ERROR";
  if (/^PostgresError:/m.test(text)) return "SQL_ERROR";
  return "UNKNOWN";
}
function sqlLocation(messages, paths, maxLine) {
  if (messages.some((m) => m.length > 1000000)) return "LOCATION UNKNOWN";
  const sites = new Set();
  const normalized = paths.map((p) => p.replaceAll("\\", "/"));
  for (const message of messages) {
    for (const raw of message.split("\n")) {
      const frame = raw
        .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
        .replaceAll("\\", "/")
        .trim();
      if (!/^(?:at\s|❯\s)/u.test(frame)) continue;
      for (const path of normalized) {
        const offset = frame.lastIndexOf(path + ":");
        if (offset < 0) continue;
        const prefix = frame.slice(0, offset);
        if (!/^(?:❯\s+|at\s+(?:[^()]*\()?)$/u.test(prefix)) continue;
        const numbers = /^(\d{1,6}):(\d{1,4})\)?$/u.exec(
          frame.slice(offset + path.length + 1),
        );
        if (!numbers) continue;
        const line = Number(numbers[1]),
          column = Number(numbers[2]);
        if (line >= 1 && line <= maxLine && column >= 1 && column <= 4096)
          sites.add(`${line} COLUMN ${column}`);
      }
    }
  }
  return sites.size === 1
    ? `LOCATION REPORTED LINE ${[...sites][0]}`
    : "LOCATION UNKNOWN";
}
function sqlCounts(rows) {
  return sqlStatuses.map(
    (status) => rows.filter((row) => row.status === status).length,
  );
}
function sqlCountText(rows) {
  const [passed, failed, skipped, pending, todo] = sqlCounts(rows);
  return `TOTAL ${rows.length} PASSED ${passed} FAILED ${failed} SKIPPED ${skipped} PENDING ${pending} TODO ${todo}`;
}
function sqlResult(rows, suiteFailure, expected) {
  if (expected !== undefined && rows.length !== expected) return "UNKNOWN";
  if (suiteFailure || rows.some((row) => row.status === "failed"))
    return "FAIL";
  if (!rows.length || rows.some((row) => row.status !== "passed"))
    return "INCOMPLETE";
  return "PASS";
}
export function summarizeSqlFingerprint(
  report,
  exitCode,
  root = process.cwd(),
) {
  try {
    if (
      !Number.isInteger(exitCode) ||
      exitCode < 0 ||
      exitCode > 255 ||
      typeof root !== "string" ||
      !root
    )
      return sqlUnknown();
    const success = sqlOwn(report, "success"),
      counts = countKeys.map((key) => sqlOwn(report, key));
    if (
      typeof success !== "boolean" ||
      !counts.every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 100000)
    )
      return sqlUnknown();
    const byPath = new Map();
    for (const [id, name, maxLine] of sqlFiles) {
      const relative = `tests/integration/${name}`,
        absolute = resolve(root, relative);
      const entry = {
        id,
        maxLine,
        paths: [relative, absolute, pathToFileURL(absolute).href],
      };
      for (const path of entry.paths) byPath.set(path, entry);
    }
    const files = new Map(),
      rows = [],
      failures = [];
    for (const file of sqlArray(sqlOwn(report, "testResults"))) {
      const name = sqlOwn(file, "name"),
        status = sqlOwn(file, "status"),
        message = sqlOwn(file, "message");
      const entry = typeof name === "string" ? byPath.get(name) : undefined;
      if (
        !entry ||
        files.has(entry.id) ||
        !["passed", "failed"].includes(status) ||
        typeof message !== "string"
      )
        return sqlUnknown();
      const assertions = [];
      for (const test of sqlArray(sqlOwn(file, "assertionResults"))) {
        const state = sqlOwn(test, "status"),
          messages = sqlStrings(sqlOwn(test, "failureMessages"));
        if (
          !sqlStatuses.includes(state) ||
          typeof sqlOwn(test, "title") !== "string"
        )
          return sqlUnknown();
        sqlStrings(sqlOwn(test, "ancestorTitles"));
        if (state !== "failed" && messages.length) return sqlUnknown();
        assertions.push({ status: state });
        if (state === "failed")
          failures.push(
            `SQL_DIAG_FAILURE FILE ${entry.id} CASE ${assertions.length} KIND ASSERTION CATEGORY ${sqlCategory(messages)} ${sqlLocation(messages, entry.paths, entry.maxLine)}`,
          );
      }
      const failed = assertions.some((row) => row.status === "failed");
      if (status === "passed" && (failed || message.length))
        return sqlUnknown();
      const suiteFailure =
        status === "failed" && (message.length > 0 || !failed);
      if (suiteFailure)
        failures.push(
          `SQL_DIAG_FAILURE FILE ${entry.id} CASE 0 KIND SUITE_HOOK CATEGORY ${sqlCategory([message])} ${sqlLocation([message], entry.paths, entry.maxLine)}`,
        );
      files.set(entry.id, { rows: assertions, suiteFailure });
      rows.push(...assertions);
    }
    const [total, passed, failed, pending, todo] = counts;
    const actual = sqlCounts(rows);
    if (
      total !== passed + failed + pending + todo ||
      rows.length !== total ||
      actual[0] !== passed ||
      actual[1] !== failed ||
      actual[2] + actual[3] !== pending ||
      actual[4] !== todo
    )
      return sqlUnknown();
    const fileFailure = [...files.values()].some((file) => file.suiteFailure);
    if (success !== !(failed || fileFailure) || (exitCode === 0) !== success)
      return sqlUnknown();
    const output = [
      `SQL_DIAG_REPORT ${files.size === sqlFiles.length ? "COMPLETE" : "UNKNOWN"}`,
      `SQL_DIAG_COUNTS ${sqlCountText(rows)}`,
      ...failures,
    ];
    for (const [id] of sqlFiles) {
      const file = files.get(id);
      output.push(
        file
          ? `SQL_DIAG_FILE ${id} ${sqlCountText(file.rows)} SUITE_FAILURES ${Number(file.suiteFailure)} RESULT ${sqlResult(file.rows, file.suiteFailure)}`
          : `SQL_DIAG_FILE ${id} UNKNOWN`,
      );
    }
    const expected = [
      ["F35", 2],
      ["F36", 3],
      ["F37", 8],
    ];
    const b2a = expected.map(([id]) => files.get(id));
    const complete = expected.every(
      ([id, count]) => files.get(id)?.rows.length === count,
    );
    const b2aRows = b2a.flatMap((file) => file?.rows ?? []);
    output.push(
      `SQL_DIAG_B2A EXPECTED 13 ${sqlCountText(b2aRows)} RESULT ${
        complete
          ? sqlResult(
              b2aRows,
              b2a.some((file) => file.suiteFailure),
              13,
            )
          : "UNKNOWN"
      }`,
    );
    return output.join("\n") + "\n";
  } catch {
    return sqlUnknown();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const fingerprint = process.argv[4] === "--sql-fingerprint";
  let receipt;
  try {
    const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
    const exitCode = Number(process.argv[3]);
    receipt = fingerprint
      ? summarizeSqlFingerprint(report, exitCode)
      : summarize(report, exitCode);
  } catch {
    receipt = fingerprint ? sqlUnknown() : unknown();
  }
  process.stdout.write(receipt);
}
