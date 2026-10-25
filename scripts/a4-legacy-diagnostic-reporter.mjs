import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Controlled source inventory: 5d9a40207ea6b5969296c17d072c4ab090eda245.
// No runtime source discovery, title interpolation, package imports or raw logging.
const definitions = [
  [
    "advanced-discovery",
    12,
    "advanced discovery composes exact public filters across bilingual native navigation",
    "en+vi",
  ],
  [
    "auth-safety",
    6,
    "auth forms cannot submit credentials before JavaScript hydration",
    "en+vi",
  ],
  [
    "catalog",
    10,
    "real verified catalog administrator lifecycle, localization, guards and optimistic conflict",
    "en+vi",
  ],
  [
    "community-disabled",
    6,
    "default-off EN/VI canonical works have no community link and every dedicated surface fails closed",
    "en+vi",
  ],
  [
    "community-moderation-disabled",
    7,
    "default-off report and moderator boundaries deny before malformed bodies, sessions or community state",
    "en+vi",
  ],
  [
    "community-reviews-disabled",
    7,
    "default-off public review API and document pages retain generic not-found with no community writes",
    "en+vi",
  ],
  [
    "edit-suggestions",
    12,
    "verified correction stays private until an attested exact-revision human review",
    "unspecified",
  ],
  [
    "foundation",
    4,
    "bilingual navigation, mobile layout and persisted accessible themes",
    "en+vi",
  ],
  [
    "foundation",
    41,
    "real registration, email verification, login, protected settings and logout",
    "en",
  ],
  [
    "foundation",
    85,
    "health, readiness, safe unsupported locale and private metadata",
    "unspecified",
  ],
  [
    "ingestion",
    13,
    "private submitted-metadata processing through the admin browser",
    "unspecified",
  ],
  [
    "library-pagination",
    13,
    "owner library native pagination and filters preserve unavailable facts without hidden metadata",
    "vi",
  ],
  [
    "library-personal",
    17,
    "real optional private ratings and entry notes never become catalog facts or reading activity",
    "unspecified",
  ],
  [
    "library-reading",
    13,
    "real private reading progress preserves attempts through completion, reread and unavailable editions",
    "unspecified",
  ],
  [
    "library",
    12,
    "verified personal library remains private through bilingual status, favorite, archive and restore",
    "en+vi",
  ],
  [
    "metadata-suggestions",
    17,
    "en: native single-operation metadata publication, exact retry and private review",
    "en",
  ],
  [
    "metadata-suggestions",
    17,
    "vi: native single-operation metadata publication, exact retry and private review",
    "vi",
  ],
  [
    "moderation",
    12,
    "human candidate review publishes a verified searchable Work without exposing private input",
    "unspecified",
  ],
  [
    "releases",
    12,
    "a manually evidenced exact release is public only while its reviewed Work is published",
    "unspecified",
  ],
  [
    "requests",
    441,
    "verified request ownership, reviewed equivalence, following and private lifecycle",
    "en+vi",
  ],
  [
    "requests",
    1024,
    "A4 progressive request form keyboard, validation and responsive geometry (en)",
    "en",
  ],
  [
    "requests",
    1024,
    "A4 progressive request form keyboard, validation and responsive geometry (vi)",
    "vi",
  ],
  [
    "requests",
    1316,
    "A3 My requests real layout, themes and focus order (en)",
    "en",
  ],
  [
    "requests",
    1316,
    "A3 My requests real layout, themes and focus order (vi)",
    "vi",
  ],
];
const CATALOG = Object.freeze(
  definitions.map(([name, line, title, locale], index) =>
    Object.freeze({
      id: `case-${String(index + 1).padStart(2, "0")}`,
      file: `tests/e2e/${name}.spec.ts`,
      line,
      title,
      locale,
    }),
  ),
);
export function getCatalog() {
  return Object.freeze(CATALOG.map((row) => Object.freeze({ ...row })));
}
const SOURCE_LIMITS = Object.freeze({
  "tests/e2e/advanced-discovery.spec.ts": 210,
  "tests/e2e/auth-safety.spec.ts": 66,
  "tests/e2e/catalog.spec.ts": 426,
  "tests/e2e/community-disabled.spec.ts": 57,
  "tests/e2e/community-moderation-disabled.spec.ts": 79,
  "tests/e2e/community-reviews-disabled.spec.ts": 65,
  "tests/e2e/edit-suggestions.spec.ts": 233,
  "tests/e2e/foundation.spec.ts": 97,
  "tests/e2e/ingestion.spec.ts": 444,
  "tests/e2e/library-pagination.spec.ts": 121,
  "tests/e2e/library-personal.spec.ts": 353,
  "tests/e2e/library-reading.spec.ts": 349,
  "tests/e2e/library.spec.ts": 275,
  "tests/e2e/metadata-suggestions.spec.ts": 556,
  "tests/e2e/moderation.spec.ts": 304,
  "tests/e2e/releases.spec.ts": 175,
  "tests/e2e/requests.spec.ts": 1507,
  "tests/helpers/browser-test.ts": 67,
  "tests/helpers/catalog-auth-fixture.ts": 135,
  "tests/helpers/community-browser-fixture.ts": 127,
  "tests/helpers/reading-auth-fixture.ts": 98,
  "tests/helpers/server-only.ts": 2,
  "tests/helpers/test-database.ts": 17,
  "tests/helpers/verified-browser-account.ts": 128,
});
const STATUS = ["passed", "failed", "timedout", "interrupted", "unknown"];
const OUTCOMES = [
  "not-run",
  "passed",
  "passed-after-retry",
  "failed",
  "timedOut",
  "skipped",
  "interrupted",
];
const CATEGORIES = [
  "none",
  "assertion",
  "timeout",
  "fixture",
  "startup",
  "infrastructure",
  "unknown",
];
const MAX_ERRORS = 1000;
const MAX_JSON = 32768;
const REFUSED = "SANITIZER REFUSED";
const integer = (value, min, max) =>
  Number.isSafeInteger(value) && value >= min && value <= max;
// Read data properties only. Accessors, class instances, symbols and extra keys fail closed.
function snapshot(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return null;
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length) return null;
  const copy = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !own.includes(key) ||
      !descriptor ||
      !Object.hasOwn(descriptor, "value")
    )
      return null;
    copy[key] = descriptor.value;
  }
  return copy;
}
function boundedArray(value, size) {
  if (!Array.isArray(value) || value.length !== size) return false;
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === size + 1 &&
    Array.from({ length: size }, (_, i) => String(i)).every((key) =>
      Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, "value"),
    )
  );
}
function validAssertion(value) {
  return (
    value === null ||
    (value &&
      typeof value.file === "string" &&
      Object.hasOwn(SOURCE_LIMITS, value.file) &&
      integer(value.line, 1, SOURCE_LIMITS[value.file]))
  );
}
function checkedReceipt(receipt) {
  receipt = snapshot(receipt, [
    "version",
    "status",
    "sanitizer",
    "categoryNote",
    "infrastructureErrors",
    "globalCategory",
    "tests",
  ]);
  if (
    !receipt ||
    receipt.version !== 1 ||
    !STATUS.includes(receipt.status) ||
    !["ok", "refused"].includes(receipt.sanitizer) ||
    !["unknown", "evidence"].includes(receipt.categoryNote) ||
    !integer(receipt.infrastructureErrors, 0, MAX_ERRORS) ||
    !["none", "startup", "infrastructure", "unknown"].includes(
      receipt.globalCategory,
    ) ||
    !boundedArray(receipt.tests, CATALOG.length)
  )
    return null;
  if (
    (receipt.infrastructureErrors === 0) !==
      (receipt.globalCategory === "none") ||
    (receipt.sanitizer === "refused" && receipt.status !== "failed") ||
    (receipt.status === "passed" && receipt.infrastructureErrors !== 0)
  )
    return null;
  const tests = [];
  for (let index = 0; index < CATALOG.length; index++) {
    const row = snapshot(
      Object.getOwnPropertyDescriptor(receipt.tests, String(index)).value,
      [
        "id",
        "title",
        "locale",
        "file",
        "line",
        "testBegan",
        "outcome",
        "category",
        "assertion",
      ],
    );
    const known = CATALOG[index];
    if (row && row.assertion !== null)
      row.assertion = snapshot(row.assertion, ["file", "line"]) ?? false;
    if (
      !row ||
      !["id", "title", "locale", "file", "line"].every(
        (key) => row[key] === known[key],
      ) ||
      typeof row.testBegan !== "boolean" ||
      !OUTCOMES.includes(row.outcome) ||
      !CATEGORIES.includes(row.category) ||
      !validAssertion(row.assertion)
    )
      return null;
    const failed = ["failed", "timedOut", "interrupted"].includes(row.outcome);
    if (
      (!failed && (row.category !== "none" || row.assertion !== null)) ||
      (failed && row.category === "none") ||
      (row.outcome === "not-run" && row.testBegan) ||
      ([
        "passed",
        "passed-after-retry",
        "failed",
        "timedOut",
        "interrupted",
      ].includes(row.outcome) &&
        !row.testBegan) ||
      (row.assertion !== null && row.category !== "assertion")
    )
      return null;
    tests.push({
      ...known,
      testBegan: row.testBegan,
      outcome: row.outcome,
      category: row.category,
      assertion:
        row.assertion === null
          ? null
          : { file: row.assertion.file, line: row.assertion.line },
    });
  }
  if (
    receipt.status === "passed" &&
    tests.some(
      (row) =>
        !["passed", "passed-after-retry", "skipped"].includes(row.outcome),
    )
  )
    return null;
  return {
    version: 1,
    status: receipt.status,
    sanitizer: receipt.sanitizer,
    categoryNote: receipt.categoryNote,
    infrastructureErrors: receipt.infrastructureErrors,
    globalCategory: receipt.globalCategory,
    tests,
  };
}
export function validateReceipt(receipt) {
  try {
    return checkedReceipt(receipt) !== null;
  } catch {
    return false;
  }
}
export function renderSummary(receipt) {
  try {
    const safe = checkedReceipt(receipt);
    if (!safe) return REFUSED;
    return [
      "## A4 legacy diagnostic",
      "",
      `Status: ${safe.status}; sanitizer: ${safe.sanitizer}.`,
      `Infrastructure errors: ${safe.infrastructureErrors}; category: ${safe.globalCategory}.`,
      `Category evidence: ${safe.categoryNote}.`,
      "",
      "| Test | Locale | Definition | Began | Outcome | Category | Assertion source |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      ...safe.tests.map(
        (row) =>
          `| ${row.title} | ${row.locale} | ${row.file}:${row.line} | ${row.testBegan ? "yes" : "no"} | ${row.outcome} | ${row.category} | ${row.assertion ? `${row.assertion.file}:${row.assertion.line}` : "unknown"} |`,
      ),
    ].join("\n");
  } catch {
    return REFUSED;
  }
}
function initialReceipt() {
  return {
    version: 1,
    status: "unknown",
    sanitizer: "ok",
    categoryNote: "unknown",
    infrastructureErrors: 0,
    globalCategory: "none",
    tests: CATALOG.map((row) => ({
      ...row,
      testBegan: false,
      outcome: "not-run",
      category: "none",
      assertion: null,
    })),
  };
}
function canonicalAbsolute(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 2048 &&
    !/[\x00-\x1f\x7f]/.test(value) &&
    path.isAbsolute(value) &&
    path.resolve(value) === value
  );
}
function realDirectory(value) {
  return (
    canonicalAbsolute(value) &&
    !fs.lstatSync(value).isSymbolicLink() &&
    fs.statSync(value).isDirectory() &&
    fs.realpathSync.native(value) === value
  );
}
function runtimePaths() {
  const sut = process.env.A4_DIAG_SUT,
    privateDir = process.env.A4_DIAG_PRIVATE_DIRECTORY;
  const result = process.env.A4_DIAG_RESULT_FILE;
  if (
    !realDirectory(sut) ||
    !realDirectory(privateDir) ||
    !canonicalAbsolute(result) ||
    path.dirname(result) !== privateDir ||
    result === sut ||
    fs.existsSync(result)
  )
    return null;
  return { sut, privateDir, result };
}
function sourceLocation(location, sut) {
  if (!location || typeof location !== "object") return null;
  const file = location.file,
    line = location.line,
    column = location.column;
  if (
    typeof file !== "string" ||
    file.length > 2048 ||
    /[\x00-\x1f\x7f]/.test(file) ||
    !integer(line, 1, 1507) ||
    !integer(column, 1, 10000)
  )
    return null;
  // Exact spelling only: never normalize an untrusted traversal, prefix or URL.
  const known = Object.keys(SOURCE_LIMITS).find(
    (name) => file === path.join(sut, ...name.split("/")),
  );
  return known && line <= SOURCE_LIMITS[known] ? { file: known, line } : null;
}
function errorSource(error, sut) {
  if (!error || typeof error !== "object") return null;
  if (error.location !== undefined) return sourceLocation(error.location, sut);
  const stack = error.stack;
  if (
    typeof stack !== "string" ||
    stack.length > 16384 ||
    /[\x00-\x08\x0b-\x1f\x7f]/.test(stack)
  )
    return null;
  const lines = stack.split("\n");
  if (lines.length > 64 || lines.some((line) => line.length > 4096))
    return null;
  for (const line of lines) {
    // Whole V8 callsite line, no prefix/suffix, arbitrary call labels or eval/URL syntax.
    const match =
      /^    at (?:[A-Za-z_$][A-Za-z0-9_$.<>]{0,120} \()?([^()\r\n]+):(\d{1,4}):(\d{1,5})(\)?)$/.exec(
        line,
      );
    if (!match || line.includes("(") !== (match[4] === ")")) continue;
    const found = sourceLocation(
      { file: match[1], line: Number(match[2]), column: Number(match[3]) },
      sut,
    );
    if (found) return found;
  }
  return null;
}
function failureEvidence(result, sut) {
  if (result.status === "timedOut")
    return { category: "timeout", assertion: null };
  const errors = result.errors;
  if (!Array.isArray(errors) || errors.length > 32)
    return { category: "unknown", assertion: null };
  for (const error of errors) {
    if (!error || typeof error !== "object") continue;
    const source = errorSource(error, sut);
    // Playwright TestError matcherResult is structural assertion evidence, never copied.
    if (error.matcherResult && typeof error.matcherResult === "object")
      return { category: "assertion", assertion: source };
    if (error.name === "TimeoutError")
      return { category: "timeout", assertion: null };
    if (source?.file.startsWith("tests/helpers/"))
      return { category: "fixture", assertion: null };
  }
  return { category: "unknown", assertion: null };
}

export default class A4LegacyDiagnosticReporter {
  constructor() {
    this.receipt = initialReceipt();
    this.paths = null;
    this.ended = false;
    this.failedExpectSteps = new Map();
    try {
      this.paths = runtimePaths();
    } catch {
      /* Never expose path/OS errors. */
    }
    if (!this.paths) this.refuse();
  }
  printsToStdio() {
    return false;
  }
  refuse() {
    this.receipt.sanitizer = "refused";
    this.receipt.status = "failed";
  }
  identify(test) {
    if (!this.paths || !test || typeof test !== "object") return null;
    const location = sourceLocation(test.location, this.paths.sut);
    return (
      location &&
      CATALOG.find(
        (row) =>
          row.file === location.file &&
          row.line === location.line &&
          row.title === test.title,
      )
    );
  }
  onBegin(_config, suite) {
    try {
      const tests = suite.allTests();
      if (!Array.isArray(tests) || tests.length !== CATALOG.length) {
        this.refuse();
        return;
      }
      const ids = tests.map((test) => this.identify(test)?.id);
      if (ids.includes(undefined) || new Set(ids).size !== CATALOG.length)
        this.refuse();
    } catch {
      this.refuse();
    }
  }
  onTestBegin(test) {
    try {
      const known = this.identify(test);
      if (!known) {
        this.refuse();
        return;
      }
      this.receipt.tests.find((row) => row.id === known.id).testBegan = true;
      this.failedExpectSteps.delete(known.id);
    } catch {
      this.refuse();
    }
  }
  onStepEnd(test, _result, step) {
    try {
      const known = this.identify(test);
      if (!known) {
        this.refuse();
        return;
      }
      if (
        !step ||
        step.category !== "expect" ||
        !step.error ||
        this.failedExpectSteps.has(known.id)
      )
        return;
      const source = sourceLocation(step.location, this.paths.sut);
      if (source) this.failedExpectSteps.set(known.id, source);
    } catch {
      this.refuse();
    }
  }
  onTestEnd(test, result) {
    try {
      const known = this.identify(test);
      if (
        !known ||
        !result ||
        !OUTCOMES.includes(result.status) ||
        ["not-run", "passed-after-retry"].includes(result.status) ||
        (result.retry !== undefined && !integer(result.retry, 0, 1000))
      ) {
        this.refuse();
        return;
      }
      const row = this.receipt.tests.find((item) => item.id === known.id);
      if (result.status !== "skipped" && !row.testBegan) {
        this.refuse();
        return;
      }
      row.outcome =
        result.status === "passed" && result.retry > 0
          ? "passed-after-retry"
          : result.status;
      row.category = "none";
      row.assertion = null;
      if (["failed", "timedOut", "interrupted"].includes(result.status)) {
        const stepSource = this.failedExpectSteps.get(known.id);
        Object.assign(
          row,
          stepSource
            ? { category: "assertion", assertion: stepSource }
            : failureEvidence(result, this.paths.sut),
        );
        if (row.category !== "unknown") this.receipt.categoryNote = "evidence";
      }
      this.failedExpectSteps.delete(known.id);
    } catch {
      this.refuse();
    }
  }
  onError(_error) {
    try {
      this.receipt.infrastructureErrors = Math.min(
        MAX_ERRORS,
        this.receipt.infrastructureErrors + 1,
      );
      this.receipt.globalCategory = this.receipt.tests.some(
        (row) => row.testBegan,
      )
        ? "infrastructure"
        : "startup";
      this.receipt.categoryNote = "evidence";
    } catch {
      this.refuse();
    }
  }
  // Intentionally discard all output and attachments. Parent privately captures CLI output.
  onStdOut() {}
  onStdErr() {}
  onEnd(result) {
    let fd;
    try {
      if (this.ended) return { status: "failed" };
      this.ended = true;
      try {
        if (
          !result ||
          !STATUS.includes(result.status) ||
          result.status === "unknown"
        )
          this.refuse();
        else if (this.receipt.sanitizer === "ok")
          this.receipt.status = result.status;
      } catch {
        this.refuse();
      }
      if (
        this.receipt.status === "passed" &&
        (this.receipt.infrastructureErrors ||
          this.receipt.tests.some(
            (row) =>
              !["passed", "passed-after-retry", "skipped"].includes(
                row.outcome,
              ),
          ))
      )
        this.refuse();
      let safe = checkedReceipt(this.receipt);
      if (!safe) {
        safe = initialReceipt();
        safe.sanitizer = "refused";
        safe.status = "failed";
      }
      const text = JSON.stringify(safe);
      // Revalidate all path boundaries immediately before exclusive, no-follow creation.
      if (
        !this.paths ||
        !realDirectory(this.paths.sut) ||
        !realDirectory(this.paths.privateDir) ||
        path.dirname(this.paths.result) !== this.paths.privateDir ||
        text.length > MAX_JSON
      ) {
        this.refuse();
        return { status: "failed" };
      }
      fd = fs.openSync(
        this.paths.result,
        fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          fs.constants.O_WRONLY |
          (fs.constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      fs.fchmodSync(fd, 0o600);
      fs.writeFileSync(fd, text, "utf8");
      return safe.sanitizer === "refused" || safe.status === "failed"
        ? { status: "failed" }
        : undefined;
    } catch {
      this.refuse();
      return { status: "failed" };
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {
          /* No raw errors. */
        }
      }
    }
  }
}

async function selfTest() {
  const { default: assert } = await import("node:assert/strict");
  const { tmpdir } = await import("node:os");
  const saved = Object.fromEntries(
    ["A4_DIAG_SUT", "A4_DIAG_PRIVATE_DIRECTORY", "A4_DIAG_RESULT_FILE"].map(
      (key) => [key, process.env[key]],
    ),
  );
  // This is the only recursive cleanup target: freshly created and owned here.
  const owned = fs.mkdtempSync(path.join(tmpdir(), "a4-reporter-selftest-"));
  try {
    const sut = path.join(owned, "sut"),
      privateDir = path.join(owned, "private");
    fs.mkdirSync(sut, { mode: 0o700 });
    fs.mkdirSync(privateDir, { mode: 0o700 });
    process.env.A4_DIAG_SUT = sut;
    process.env.A4_DIAG_PRIVATE_DIRECTORY = privateDir;
    let serial = 0;
    const reporter = () => {
      process.env.A4_DIAG_RESULT_FILE = path.join(
        privateDir,
        `receipt-${serial++}.json`,
      );
      return new A4LegacyDiagnosticReporter();
    };
    const testFor = (row) => ({
      title: row.title,
      location: {
        file: path.join(sut, ...row.file.split("/")),
        line: row.line,
        column: 1,
      },
    });
    const allTests = () => CATALOG.map(testFor);
    const finish = (instance) => {
      const answer = instance.onEnd({ status: "failed" });
      assert.equal(answer.status, "failed");
      const text = fs.readFileSync(instance.paths.result, "utf8");
      assert.ok(text.length <= MAX_JSON);
      const receipt = JSON.parse(text);
      assert.equal(validateReceipt(receipt), true);
      if (process.platform !== "win32")
        assert.equal(fs.statSync(instance.paths.result).mode & 0o777, 0o600);
      return { text, receipt, summary: renderSummary(receipt) };
    };
    const valid = initialReceipt();
    assert.equal(getCatalog().length, 24);
    assert.ok(Object.isFrozen(getCatalog()));
    assert.ok(Object.isFrozen(getCatalog()[0]));
    assert.equal(validateReceipt(valid), true);
    assert.ok(renderSummary(valid).includes(CATALOG[20].title));
    const hostile = [
      "HOSTILE_SENTINEL",
      "\u001b[31mHOSTILE_SENTINEL",
      "\nHOSTILE_SENTINEL",
      "https://user:password@example.invalid/?token=HOSTILE_SENTINEL",
      "Cookie: session=HOSTILE_SENTINEL",
      "Authorization: Bearer HOSTILE_SENTINEL",
      "postgres://user:HOSTILE_SENTINEL@host/db",
    ];
    const noHostile = (value) => {
      for (const marker of hostile) assert.ok(!value.includes(marker));
      assert.ok(!value.includes("HOSTILE_SENTINEL"));
    };
    for (const payload of hostile) {
      for (const key of [
        "title",
        "locale",
        "file",
        "line",
        "outcome",
        "category",
        "testBegan",
        "id",
      ]) {
        const bad = structuredClone(valid);
        bad.tests[0][key] = payload;
        assert.equal(validateReceipt(bad), false);
        assert.equal(renderSummary(bad), REFUSED);
        noHostile(renderSummary(bad));
      }
      for (const key of [
        "status",
        "sanitizer",
        "categoryNote",
        "globalCategory",
        "infrastructureErrors",
        "version",
      ]) {
        const bad = structuredClone(valid);
        bad[key] = payload;
        assert.equal(validateReceipt(bad), false);
        assert.equal(renderSummary(bad), REFUSED);
      }
      const bad = structuredClone(valid);
      bad.rawError = { message: payload, stack: payload };
      assert.equal(validateReceipt(bad), false);
      assert.equal(renderSummary(bad), REFUSED);
    }
    for (const mutate of [
      (r) => {
        r.tests[0].message = "HOSTILE_SENTINEL";
      },
      (r) => {
        r.tests[0].assertion = {
          file: CATALOG[0].file,
          line: 1,
          raw: "HOSTILE_SENTINEL",
        };
      },
      (r) => {
        r.tests[0].line = 1e100;
      },
      (r) => {
        r.infrastructureErrors = Infinity;
      },
      (r) => {
        r.tests.push(r.tests[0]);
      },
      (r) => {
        delete r.tests[0];
      },
      (r) => {
        r.tests[0].outcome = "unexpected";
      },
      (r) => {
        r.tests[0].category = "credential";
      },
      (r) => {
        r.tests[0].testBegan = 1;
      },
      (r) => {
        r.tests[0].assertion = {
          file: "tests/e2e/../helpers/browser-test.ts",
          line: 1,
        };
      },
      (r) => {
        Object.defineProperty(r, "status", {
          get() {
            throw new Error("HOSTILE_SENTINEL");
          },
        });
      },
    ]) {
      const bad = structuredClone(valid);
      mutate(bad);
      assert.equal(validateReceipt(bad), false);
      assert.equal(renderSummary(bad), REFUSED);
    }
    assert.equal(
      validateReceipt(
        new Proxy(
          {},
          {
            ownKeys() {
              throw new Error("HOSTILE_SENTINEL");
            },
          },
        ),
      ),
      false,
    );
    const coercion = structuredClone(valid);
    coercion.tests[0].outcome = "failed";
    coercion.tests[0].testBegan = true;
    coercion.tests[0].category = "assertion";
    coercion.tests[0].assertion = {
      file: {
        toString() {
          return "HOSTILE_SENTINEL";
        },
      },
      line: 1,
    };
    assert.equal(validateReceipt(coercion), false);
    assert.equal(renderSummary(coercion), REFUSED);
    const proxyReceipt = new Proxy(valid, {
      get() {
        return "HOSTILE_SENTINEL";
      },
    });
    assert.equal(validateReceipt(proxyReceipt), true);
    noHostile(renderSummary(proxyReceipt));
    const r = reporter();
    r.onBegin({}, { allTests });
    for (const row of CATALOG) {
      const test = testFor(row);
      r.onTestBegin(test);
      r.onTestEnd(
        test,
        row.id === "case-21"
          ? {
              status: "failed",
              errors: [
                {
                  message: hostile.join(" "),
                  stack: hostile.join("\n"),
                  matcherResult: { actual: hostile },
                  location: { file: test.location.file, line: 1190, column: 9 },
                },
              ],
              attachments: hostile,
              stdout: hostile,
              stderr: hostile,
            }
          : { status: "passed", errors: [] },
      );
    }
    r.onError({
      message: hostile.join(" "),
      stack: hostile.join("\n"),
      location: { file: hostile[0] },
    });
    r.onStdOut(hostile);
    r.onStdErr(hostile);
    const actual = finish(r);
    noHostile(actual.text);
    noHostile(actual.summary);
    assert.deepEqual(actual.receipt.tests[20].assertion, {
      file: "tests/e2e/requests.spec.ts",
      line: 1190,
    });
    assert.ok(actual.summary.includes("requests.spec.ts:1190"));
    assert.equal(actual.receipt.tests[20].category, "assertion");
    assert.equal(actual.receipt.tests[20].locale, "en");
    assert.equal(actual.receipt.globalCategory, "infrastructure");
    const startup = reporter();
    startup.onError(hostile);
    assert.equal(finish(startup).receipt.globalCategory, "startup");
    const source = testFor(CATALOG[0]).location.file;
    const stacks = [
      [
        `Error: HOSTILE_SENTINEL\n    at ${source}:20:3`,
        { file: CATALOG[0].file, line: 20 },
      ],
      [
        `Error: HOSTILE_SENTINEL\n    at Object.check (${source}:21:4)`,
        { file: CATALOG[0].file, line: 21 },
      ],
      [`    at ${sut}-evil/tests/e2e/advanced-discovery.spec.ts:20:3`, null],
      [
        `    at ${sut}${path.sep}tests${path.sep}e2e${path.sep}..${path.sep}e2e${path.sep}advanced-discovery.spec.ts:20:3`,
        null,
      ],
      [`    at ${source}:9999:3`, null],
      [`    at ${source}:20:99999`, null],
      [`    at ${source}:20:3 HOSTILE_SENTINEL`, null],
      [`prefix    at ${source}:20:3`, null],
      [`    at file://${source}:20:3`, null],
      [`    at https://HOSTILE_SENTINEL:20:3`, null],
      [`\u001b[31m\n    at ${source}:20:3`, null],
      ["HOSTILE_SENTINEL".repeat(2000), null],
      [Array(66).fill(`    at ${source}:20:3`).join("\n"), null],
      [
        `    at ${sut}${path.sep}tests${path.sep}e2e${path.sep}unknown.spec.ts:20:3`,
        null,
      ],
    ];
    for (const [stack, expected] of stacks) {
      assert.deepEqual(errorSource({ stack }, sut), expected);
      const instance = reporter(),
        test = testFor(CATALOG[0]);
      instance.onTestBegin(test);
      instance.onTestEnd(test, {
        status: "failed",
        errors: [{ matcherResult: {}, stack, message: hostile }],
      });
      const output = finish(instance);
      assert.deepEqual(output.receipt.tests[0].assertion, expected);
      noHostile(output.text);
      noHostile(output.summary);
    }
    assert.equal(
      errorSource(
        {
          location: {
            file: `${sut}-evil/${CATALOG[0].file}`,
            line: 1,
            column: 1,
          },
          stack: `    at ${source}:20:3`,
        },
        sut,
      ),
      null,
    );
    for (const location of [
      { file: source, line: -1, column: 1 },
      { file: source, line: 1e100, column: 1 },
      { file: `${source}\nHOSTILE_SENTINEL`, line: 1, column: 1 },
      { file: source, line: 1, column: 10001 },
    ]) {
      assert.equal(sourceLocation(location, sut), null);
    }
    for (const kind of [
      "title",
      "file",
      "line",
      "throwing",
      "status",
      "errors",
    ]) {
      const instance = reporter(),
        test = testFor(CATALOG[0]);
      if (kind === "title") test.title += hostile[0];
      if (kind === "file")
        test.location.file = `${sut}-evil/${CATALOG[0].file}`;
      if (kind === "line") test.location.line = 999999;
      if (kind === "throwing")
        Object.defineProperty(test, "title", {
          get() {
            throw new Error(hostile[0]);
          },
        });
      instance.onTestBegin(test);
      instance.onTestEnd(
        test,
        kind === "status"
          ? { status: hostile[0] }
          : kind === "errors"
            ? {
                status: "failed",
                get errors() {
                  throw new Error(hostile[0]);
                },
              }
            : { status: "failed", errors: [hostile] },
      );
      const output = finish(instance);
      assert.equal(output.receipt.sanitizer, "refused");
      noHostile(output.text);
      noHostile(output.summary);
    }
    const missing = reporter();
    missing.onBegin({}, { allTests: () => [] });
    assert.equal(finish(missing).receipt.sanitizer, "refused");
    const timeout = reporter(),
      timeoutTest = testFor(CATALOG[0]);
    timeout.onTestBegin(timeoutTest);
    timeout.onTestEnd(timeoutTest, { status: "timedOut", errors: hostile });
    assert.equal(finish(timeout).receipt.tests[0].category, "timeout");
    const fixture = reporter(),
      fixtureTest = testFor(CATALOG[0]);
    fixture.onTestBegin(fixtureTest);
    fixture.onTestEnd(fixtureTest, {
      status: "failed",
      errors: [
        {
          location: {
            file: path.join(sut, "tests", "helpers", "browser-test.ts"),
            line: 5,
            column: 1,
          },
        },
      ],
    });
    assert.equal(finish(fixture).receipt.tests[0].category, "fixture");
    process.env.A4_DIAG_RESULT_FILE = path.join(owned, "outside.json");
    const invalidPaths = new A4LegacyDiagnosticReporter();
    assert.equal(invalidPaths.onEnd({ status: "passed" }).status, "failed");
    assert.equal(fs.existsSync(process.env.A4_DIAG_RESULT_FILE), false);
    process.env.A4_DIAG_RESULT_FILE = actual.receipt ? r.paths.result : "";
    const existing = new A4LegacyDiagnosticReporter();
    assert.equal(existing.onEnd({ status: "passed" }).status, "failed");
    assert.equal(fs.readFileSync(r.paths.result, "utf8"), actual.text);
    const invalidEnd = reporter();
    const endPath = invalidEnd.paths.result;
    assert.equal(
      invalidEnd.onEnd({
        get status() {
          throw new Error(hostile[0]);
        },
      }).status,
      "failed",
    );
    // Invalid input still produces a safe failed receipt if the destination was validated.
    const failedEndReceipt = JSON.parse(fs.readFileSync(endPath, "utf8"));
    assert.equal(validateReceipt(failedEndReceipt), true);
    assert.equal(failedEndReceipt.sanitizer, "refused");
    noHostile(renderSummary(failedEndReceipt));
    for (const finalStatus of ["failed", "passed"]) {
      const steps = reporter(),
        test = testFor(CATALOG[20]);
      steps.onTestBegin(test);
      steps.onStepEnd(
        test,
        {},
        {
          category: "expect",
          title: hostile[0],
          error: { message: hostile },
          location: { file: test.location.file, line: 1184, column: 7 },
        },
      );
      steps.onStepEnd(
        test,
        {},
        {
          category: "expect",
          error: { stack: hostile },
          location: { file: test.location.file, line: 1190, column: 7 },
        },
      );
      steps.onTestEnd(test, {
        status: finalStatus,
        errors: [{ message: hostile }],
      });
      const output = finish(steps);
      noHostile(output.text);
      noHostile(output.summary);
      assert.deepEqual(
        output.receipt.tests[20].assertion,
        finalStatus === "failed"
          ? { file: CATALOG[20].file, line: 1184 }
          : null,
      );
    }
    const retry = reporter(),
      retryTest = testFor(CATALOG[20]);
    retry.onTestBegin(retryTest);
    retry.onStepEnd(
      retryTest,
      {},
      {
        category: "expect",
        error: {},
        location: { ...retryTest.location, line: 1184 },
      },
    );
    retry.onTestEnd(retryTest, { status: "failed", errors: [] });
    retry.onTestBegin(retryTest);
    retry.onTestEnd(retryTest, { status: "passed", retry: 1, errors: [] });
    const retried = finish(retry);
    assert.equal(retried.receipt.tests[20].assertion, null);
    assert.equal(retried.receipt.tests[20].outcome, "passed-after-retry");
    noHostile(retried.summary);
    const passingRetry = reporter();
    passingRetry.onBegin({}, { allTests });
    for (const row of CATALOG) {
      const test = testFor(row);
      passingRetry.onTestBegin(test);
      passingRetry.onTestEnd(test, {
        status: "passed",
        retry: row.id === "case-01" ? 1 : 0,
        errors: [],
      });
    }
    assert.equal(passingRetry.onEnd({ status: "passed" }), undefined);
    const passingReceipt = JSON.parse(
      fs.readFileSync(passingRetry.paths.result, "utf8"),
    );
    assert.equal(validateReceipt(passingReceipt), true);
    assert.equal(passingReceipt.status, "passed");
    assert.equal(passingReceipt.tests[0].outcome, "passed-after-retry");
    assert.ok(renderSummary(passingReceipt).includes("passed-after-retry"));
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    // owned is the exact absolute mkdtemp return value, never an environment-derived path.
    if (
      path.isAbsolute(owned) &&
      path.basename(owned).startsWith("a4-reporter-selftest-")
    )
      fs.rmSync(owned, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length === 3 && process.argv[2] === "--self-test") {
    try {
      await selfTest();
      process.stdout.write("SANITIZER_SELF_TEST_PASS\n");
    } catch {
      process.stdout.write("SANITIZER_SELF_TEST_FAIL\n");
      process.exitCode = 1;
    }
  } else {
    process.exitCode = 1;
  }
}
