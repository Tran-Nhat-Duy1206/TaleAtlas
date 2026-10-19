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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  let receipt;
  try {
    receipt = summarize(
      JSON.parse(readFileSync(process.argv[2], "utf8")),
      Number(process.argv[3]),
    );
  } catch {
    receipt = unknown();
  }
  process.stdout.write(receipt);
}
