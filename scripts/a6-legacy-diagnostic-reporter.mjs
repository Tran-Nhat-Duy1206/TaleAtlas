import { createRequire } from "node:module";
import { lstat, readdir, readFile, realpath, open } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

export const SUT_SHA = "2951947123005cb849b86367b87477b9690ff0d0";
export const STAGES = Object.freeze([
  "guard",
  "postgres",
  "frozen-install",
  "migrate-first",
  "migrate-second",
  "generate",
  "drift",
  "production-build",
  "typecheck",
  "chromium",
  "reporter-safety",
  "native-guard",
  "native-tls",
  "native-startup",
  "browser",
  "completed",
]);
const MAX = 20000;
const manifests = new WeakMap();
const RESULT_KEYS = [
  "schema",
  "sut",
  "stage",
  "playwrightStarted",
  "outcome",
  "passedTests",
  "failedTests",
  "tests",
];
const RECORD_KEYS = [
  "id",
  "file",
  "declarationLine",
  "assertionLine",
  "category",
  "retry",
  "finalOutcome",
  "outcome",
];
const CATEGORIES = [
  "assertion",
  "timeout",
  "fixture",
  "navigation",
  "startup",
  "unknown",
];
const FINAL = ["passed", "failed", "flaky", "skipped", "unknown"];
const ATTEMPT = [
  "passed",
  "failed",
  "timedOut",
  "skipped",
  "interrupted",
  "unknown",
];
const fail = () => {
  throw new Error("A6_DIAG_REPORTER_SAFETY_FAILED");
};
const integer = (n, min = 0) => Number.isSafeInteger(n) && n >= min;
const inside = (root, file) => {
  const rel = path.relative(root, file);
  return (
    rel !== "" &&
    !path.isAbsolute(rel) &&
    rel !== ".." &&
    !rel.startsWith(`..${path.sep}`)
  );
};

// Inspect descriptors before touching values: no getters, symbols, inherited fields,
// toJSON hooks, class instances, sparse arrays, or unbounded property collections.
function data(value, keys) {
  if (value === null || typeof value !== "object") fail();
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail();
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((k) => !keys.includes(k))) fail();
  const result = Object.create(null);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !Object.hasOwn(d, "value") || !d.enumerable) fail();
    result[key] = d.value;
  }
  return result;
}
function arrayData(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    fail();
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!integer(length) || length > MAX) fail();
  if (Reflect.ownKeys(value).length !== length + 1) fail();
  const out = [];
  for (let i = 0; i < length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !Object.hasOwn(d, "value") || !d.enumerable) fail();
    out.push(d.value);
  }
  return out;
}

/** Source-only inventory. IDs sort by relative file, declaration line and column.
 * Titles are never read. Only test(..., function) and test.skip/fixme/only qualify.
 * The returned inventory is descriptive; a private WeakMap is validation authority.
 */
export async function buildManifest(root) {
  try {
    const resolved = await realpath(path.resolve(root));
    const ts = createRequire(path.join(resolved, "package.json"))("typescript");
    const base = path.join(resolved, "tests", "e2e");
    const files = [];
    async function walk(dir) {
      const info = await lstat(dir);
      if (info.isSymbolicLink() || !info.isDirectory()) return;
      if (!inside(resolved, await realpath(dir))) return;
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(file);
        else if (entry.isFile() && entry.name.endsWith(".spec.ts")) {
          if (inside(base, await realpath(file))) files.push(file);
        }
      }
    }
    // Refuse a symlink in either directory component, including tests itself.
    if ((await lstat(path.join(resolved, "tests"))).isSymbolicLink()) fail();
    await walk(base);
    files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const declarations = [],
      spans = new Map(),
      byLocation = new Map(),
      byLine = new Map();
    for (const absolute of files) {
      const file = path.relative(resolved, absolute).split(path.sep).join("/");
      if (
        !/^tests\/e2e\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.spec\.ts$/.test(
          file,
        )
      )
        fail();
      const source = ts.createSourceFile(
        file,
        await readFile(absolute, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      if (source.parseDiagnostics.length) fail();
      const ranges = [];
      spans.set(file, ranges);
      function isExpect(expr) {
        if (ts.isIdentifier(expr)) return expr.text === "expect";
        if (ts.isCallExpression(expr)) return isExpect(expr.expression);
        if (ts.isPropertyAccessExpression(expr))
          return isExpect(expr.expression);
        return false;
      }
      function visit(node) {
        if (ts.isCallExpression(node)) {
          const expr = node.expression;
          const testCall = ts.isIdentifier(expr) && expr.text === "test";
          const modified =
            ts.isPropertyAccessExpression(expr) &&
            ts.isIdentifier(expr.expression) &&
            expr.expression.text === "test" &&
            ["skip", "fixme", "only"].includes(expr.name.text);
          const fn = node.arguments[1];
          if (
            (testCall || modified) &&
            fn &&
            (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))
          ) {
            const loc = source.getLineAndCharacterOfPosition(
              node.getStart(source),
            );
            declarations.push({
              file,
              declarationLine: loc.line + 1,
              declarationColumn: loc.character + 1,
            });
          }
          if (isExpect(expr)) {
            const start =
              source.getLineAndCharacterOfPosition(node.getStart(source)).line +
              1;
            const end =
              source.getLineAndCharacterOfPosition(node.getEnd() - 1).line + 1;
            ranges.push([start, end]);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    if (declarations.length > 9999) fail();
    declarations.forEach((item, i) => {
      item.id = `T${String(i + 1).padStart(4, "0")}`;
      Object.freeze(item);
      byLocation.set(
        `${item.file}:${item.declarationLine}:${item.declarationColumn}`,
        item,
      );
      const key = `${item.file}:${item.declarationLine}`;
      byLine.set(key, [...(byLine.get(key) || []), item]);
    });
    const manifest = Object.freeze({
      root: resolved,
      files: Object.freeze([...spans.keys()]),
      declarations: Object.freeze(declarations),
    });
    manifests.set(manifest, {
      resolved,
      spans,
      byLocation,
      byLine,
      byId: new Map(declarations.map((d) => [d.id, d])),
    });
    return manifest;
  } catch {
    fail();
  }
}

export function blankResult(stage, outcome = "unknown") {
  return {
    schema: 1,
    sut: SUT_SHA,
    stage,
    playwrightStarted: false,
    outcome,
    passedTests: null,
    failedTests: null,
    tests: [],
  };
}

/** Reject rather than sanitize arbitrary metadata. Always return new plain data.
 * Only inventories produced by this module can authorize non-null identities.
 */
export function validateResult(result, manifest) {
  try {
    const r = data(result, RESULT_KEYS);
    if (
      r.schema !== 1 ||
      r.sut !== SUT_SHA ||
      !STAGES.includes(r.stage) ||
      typeof r.playwrightStarted !== "boolean" ||
      !["pass", "fail", "unknown"].includes(r.outcome)
    )
      fail();
    if (![r.passedTests, r.failedTests].every((n) => n === null || integer(n)))
      fail();
    const authority = manifests.get(manifest);
    const tests = arrayData(r.tests).map((record) => {
      const t = data(record, RECORD_KEYS);
      if (
        !CATEGORIES.includes(t.category) ||
        !integer(t.retry) ||
        t.retry > 1 ||
        !FINAL.includes(t.finalOutcome) ||
        !ATTEMPT.includes(t.outcome)
      )
        fail();
      let declaration = null;
      if (t.id === null) {
        if (
          t.file !== null ||
          t.declarationLine !== null ||
          t.assertionLine !== null
        )
          fail();
      } else {
        if (typeof t.id !== "string") fail();
        declaration = authority?.byId.get(t.id);
        if (
          !declaration ||
          t.file !== declaration.file ||
          t.declarationLine !== declaration.declarationLine
        )
          fail();
        if (
          t.assertionLine !== null &&
          (!integer(t.assertionLine, 1) ||
            !authority.spans
              .get(declaration.file)
              .some(([a, b]) => t.assertionLine >= a && t.assertionLine <= b))
        )
          fail();
      }
      return {
        id: declaration?.id ?? null,
        file: declaration?.file ?? null,
        declarationLine: declaration?.declarationLine ?? null,
        assertionLine: t.assertionLine,
        category: t.category,
        retry: t.retry,
        finalOutcome: t.finalOutcome,
        outcome: t.outcome,
      };
    });
    return {
      schema: 1,
      sut: SUT_SHA,
      stage: r.stage,
      playwrightStarted: r.playwrightStarted,
      outcome: r.outcome,
      passedTests: r.passedTests,
      failedTests: r.failedTests,
      tests,
    };
  } catch {
    fail();
  }
}

const unknownRecord = () => ({
  id: null,
  file: null,
  declarationLine: null,
  assertionLine: null,
  category: "unknown",
  retry: 0,
  finalOutcome: "unknown",
  outcome: "unknown",
});

export default class DiagnosticReporter {
  constructor() {
    this.result = blankResult("native-startup");
    this.manifest = null;
    this.pending = [];
    this.broken = false;
    // Attach rejection handler immediately; never emit unhandled exception text.
    this.ready = (
      process.env.A6_DIAG_SUT && path.isAbsolute(process.env.A6_DIAG_SUT)
        ? buildManifest(process.env.A6_DIAG_SUT)
        : Promise.reject(new Error("A6_DIAG_REPORTER_SAFETY_FAILED"))
    )
      .then((m) => {
        this.manifest = m;
      })
      .catch(() => {
        this.broken = true;
        process.exitCode = 1;
      });
  }
  printsToStdio() {
    return true;
  }
  onBegin(_config, suite) {
    try {
      this.suite = suite;
      this.result.stage = "browser";
      this.result.playwrightStarted = true;
    } catch {
      this.broken = true;
      process.exitCode = 1;
    }
  }
  onTestEnd(test, result) {
    try {
      if (result.status !== "passed" || result.retry > 0) {
        if (this.pending.length >= MAX) fail();
        this.pending.push({ test, result });
      }
    } catch {
      this.broken = true;
      process.exitCode = 1;
    }
  }
  onError() {
    // Never access error.message, title, snippet, attachments or arbitrary values.
    if (this.result.tests.length < MAX) this.result.tests.push(unknownRecord());
    else this.broken = true;
    this.hadError = true;
  }
  sourceFile(file) {
    if (
      typeof file !== "string" ||
      file.length > 4096 ||
      /[\x00-\x1f\x7f]/.test(file)
    )
      return null;
    const authority = manifests.get(this.manifest);
    if (!authority) return null;
    const absolute = path.resolve(authority.resolved, file);
    if (!inside(authority.resolved, absolute)) return null;
    const relative = path
      .relative(authority.resolved, absolute)
      .split(path.sep)
      .join("/");
    return authority.spans.has(relative) ? relative : null;
  }
  identity(location) {
    if (!location) return null;
    const file = this.sourceFile(location.file);
    if (!file || !integer(location.line, 1)) return null;
    const a = manifests.get(this.manifest);
    const exact = a.byLocation.get(
      `${file}:${location.line}:${location.column}`,
    );
    if (exact) return exact;
    const candidates = a.byLine.get(`${file}:${location.line}`);
    return candidates?.length === 1 ? candidates[0] : null;
  }
  assertion(error, declaration) {
    if (!error || !declaration) return null;
    let location = error.location;
    if (
      !location &&
      typeof error.stack === "string" &&
      error.stack.length <= 1000000
    ) {
      // Only first SUT frame; never skip a non-assertion SUT frame to find a later one.
      for (const line of error.stack.split("\n").slice(1)) {
        const match = /^\s*at (?:.*? \()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line);
        if (match && this.sourceFile(match[1])) {
          location = { file: match[1], line: Number(match[2]) };
          break;
        }
        // A SUT frame outside inventory also precludes attribution to a later frame.
        if (
          match &&
          path.isAbsolute(match[1]) &&
          inside(this.manifest.root, match[1])
        )
          return null;
      }
    }
    if (
      !location ||
      this.sourceFile(location.file) !== declaration.file ||
      !integer(location.line, 1)
    )
      return null;
    return manifests
      .get(this.manifest)
      .spans.get(declaration.file)
      .some(([a, b]) => location.line >= a && location.line <= b)
      ? location.line
      : null;
  }
  async onEnd(fullResult) {
    try {
      await this.ready;
      if (this.broken) fail();
      const all = this.suite ? this.suite.allTests() : [];
      if (!Array.isArray(all) || all.length > MAX) fail();
      const finals = new Map();
      let passed = 0,
        failed = 0;
      for (const test of all) {
        const outcome = test.outcome();
        const final =
          outcome === "expected"
            ? "passed"
            : outcome === "unexpected"
              ? "failed"
              : outcome === "flaky"
                ? "flaky"
                : outcome === "skipped"
                  ? "skipped"
                  : "unknown";
        finals.set(test, final);
        if (final === "passed" || final === "flaky") passed++;
        if (final === "failed") failed++;
      }
      for (const { test, result } of this.pending) {
        const d = this.identity(test.location);
        const errors = result.errors?.length
          ? result.errors
          : result.error
            ? [result.error]
            : [];
        let assertionLine = null;
        for (const error of errors) {
          assertionLine = this.assertion(error, d);
          if (assertionLine !== null) break;
        }
        this.result.tests.push({
          id: d?.id ?? null,
          file: d?.file ?? null,
          declarationLine: d?.declarationLine ?? null,
          assertionLine,
          category:
            result.status === "timedOut"
              ? "timeout"
              : assertionLine !== null
                ? "assertion"
                : "unknown",
          retry: result.retry,
          finalOutcome: finals.get(test) || "unknown",
          outcome: ATTEMPT.includes(result.status) ? result.status : "unknown",
        });
      }
      this.result.passedTests = this.suite ? passed : null;
      this.result.failedTests = this.suite ? failed : null;
      this.result.outcome =
        fullResult.status === "passed" && !this.hadError && failed === 0
          ? "pass"
          : "fail";
      await this.persist(validateResult(this.result, this.manifest));
    } catch {
      this.broken = true;
      process.exitCode = 1;
      try {
        await this.persist(
          validateResult(blankResult("reporter-safety", "fail"), this.manifest),
        );
      } catch {
        /* Deliberately silent, including permission/path errors. */
      }
    }
    if (this.broken || this.result.outcome === "fail")
      return { status: "failed" };
  }
  async persist(result) {
    const directory = process.env.A6_DIAG_PRIVATE;
    if (
      !directory ||
      !path.isAbsolute(directory) ||
      (await lstat(directory)).isSymbolicLink() ||
      !(await lstat(directory)).isDirectory()
    )
      fail();
    const safe = validateResult(result, this.manifest);
    const handle = await open(
      path.join(directory, "safe-result.json"),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_TRUNC |
        (constants.O_NOFOLLOW || 0),
      0o600,
    );
    try {
      await handle.chmod(0o600);
      await handle.writeFile(`${JSON.stringify(safe)}\n`, "utf8");
    } finally {
      await handle.close();
    }
  }
}

/** Pure adversarial schema checks plus source inventory; does not launch Playwright. */
export async function selfTest(root) {
  try {
    const manifest = await buildManifest(root);
    const fresh = () => blankResult("guard");
    const record = () => ({ ...fresh(), tests: [unknownRecord()] });
    const sentinel =
      "A6_HOSTILE_https://user:password@example.invalid/token?secret=xyz\nSTACK";
    const reject = (value) => {
      let rejected = false;
      try {
        validateResult(value, manifest);
      } catch {
        rejected = true;
      }
      if (!rejected) fail();
    };
    const output = [
      validateResult(fresh(), manifest),
      validateResult(record(), manifest),
      validateResult(blankResult("frozen-install", "fail"), undefined),
    ];
    for (const [key, value] of [
      ["schema", 2],
      ["sut", sentinel],
      ["stage", sentinel],
      ["playwrightStarted", null],
      ["outcome", sentinel],
      ["passedTests", NaN],
      ["failedTests", Infinity],
      ["passedTests", undefined],
      ["tests", null],
      ["title", sentinel],
    ]) {
      reject({ ...fresh(), [key]: value });
    }
    for (const value of [
      null,
      undefined,
      () => {},
      Object.create({}),
      JSON.parse('{"__proto__":{"polluted":true}}'),
    ])
      reject(value);
    reject(Object.assign(Object.create({ polluted: true }), fresh()));
    let touched = false;
    const getter = fresh();
    Object.defineProperty(getter, "stage", {
      enumerable: true,
      get() {
        touched = true;
        return "guard";
      },
    });
    reject(getter);
    if (touched) fail();
    const hostileArray = [unknownRecord()];
    Object.defineProperty(hostileArray, "0", {
      enumerable: true,
      get() {
        touched = true;
        return unknownRecord();
      },
    });
    reject({ ...fresh(), tests: hostileArray });
    if (touched) fail();
    output.push(
      validateResult(Object.assign(Object.create(null), fresh()), manifest),
    );
    reject({ ...fresh(), tests: new Array(MAX + 1).fill(unknownRecord()) });
    reject({ ...fresh(), tests: new Array(1) });
    for (const [key, value] of [
      ["id", "T99999"],
      ["file", "../escape.spec.ts"],
      ["file", "tests/e2e/foreign.spec.ts"],
      ["file", sentinel],
      ["declarationLine", 1],
      ["assertionLine", 1],
      ["category", sentinel],
      ["retry", -1],
      ["retry", 2],
      ["retry", NaN],
      ["retry", Infinity],
      ["retry", null],
      ["outcome", undefined],
      ["finalOutcome", null],
      ["title", sentinel],
      ["stack", sentinel],
      ["url", sentinel],
      ["email", sentinel],
      ["credentials", sentinel],
      ["dynamicTitle", sentinel],
    ]) {
      const r = record();
      r.tests[0][key] = value;
      reject(r);
    }
    const r = record();
    Object.defineProperty(r.tests[0], "category", {
      enumerable: true,
      get() {
        touched = true;
        return "unknown";
      },
    });
    reject(r);
    if (touched) fail();
    const f = record();
    f.tests[0].outcome = () => sentinel;
    reject(f);
    const d = manifest.declarations[0];
    if (d) {
      const known = {
        ...unknownRecord(),
        id: d.id,
        file: d.file,
        declarationLine: d.declarationLine,
      };
      output.push(
        validateResult({ ...fresh(), tests: [known, { ...known }] }, manifest),
      );
      for (const change of [
        { id: null },
        { file: null },
        { declarationLine: 0 },
        { declarationLine: -1 },
        { declarationLine: undefined },
        { assertionLine: 0 },
        { assertionLine: Number.MAX_SAFE_INTEGER },
        { file: `${d.file}\u0000` },
      ]) {
        reject({ ...fresh(), tests: [{ ...known, ...change }] });
      }
      const nonSource = Array.from({ length: 100 }, (_, i) => i + 1).find(
        (line) =>
          !manifests
            .get(manifest)
            .spans.get(d.file)
            .some(([a, b]) => line >= a && line <= b),
      );
      if (nonSource)
        reject({ ...fresh(), tests: [{ ...known, assertionLine: nonSource }] });
    }
    const sourceDeclaration = manifest.declarations.find(
      (item) => manifests.get(manifest).spans.get(item.file).length,
    );
    if (sourceDeclaration) {
      const d = sourceDeclaration;
      const assertionLine = manifests.get(manifest).spans.get(d.file)[0][0];
      const absolute = path.join(manifest.root, ...d.file.split("/"));
      // Use the real implementation without its constructor, env, filesystem writes or Playwright.
      const reporter = Object.assign(
        Object.create(DiagnosticReporter.prototype),
        {
          manifest,
          ready: Promise.resolve(),
          result: blankResult("native-startup"),
          pending: [],
          broken: false,
          persist: async (value) => {
            output.push(validateResult(value, manifest));
          },
        },
      );
      const fakeTest = {
        location: {
          file: absolute,
          line: d.declarationLine,
          column: d.declarationColumn,
        },
        outcome: () => "flaky",
      };
      Object.defineProperty(fakeTest, "title", {
        get() {
          touched = true;
          return sentinel;
        },
      });
      const fakeError = {
        location: { file: absolute, line: assertionLine },
        message: sentinel,
        stack: `${sentinel}\n    at assertion (${absolute}:${assertionLine}:1)`,
      };
      if (reporter.assertion(fakeError, d) !== assertionLine) fail();
      if (
        reporter.assertion(
          { stack: `Error\n    at assertion (${absolute}:${assertionLine}:1)` },
          d,
        ) !== assertionLine
      )
        fail();
      if (
        reporter.assertion(
          {
            location: {
              file: path.join(manifest.root, "foreign.ts"),
              line: assertionLine,
            },
          },
          d,
        ) !== null
      )
        fail();
      if (
        reporter.assertion(
          {
            location: {
              file: path.resolve(manifest.root, "..", "foreign.ts"),
              line: assertionLine,
            },
          },
          d,
        ) !== null
      )
        fail();
      const nonSource = Array.from({ length: 100 }, (_, i) => i + 1).find(
        (line) =>
          !manifests
            .get(manifest)
            .spans.get(d.file)
            .some(([a, b]) => line >= a && line <= b),
      );
      if (
        nonSource &&
        reporter.assertion(
          { location: { file: absolute, line: nonSource } },
          d,
        ) !== null
      )
        fail();
      const foreign = manifest.files.find((file) => file !== d.file);
      if (
        foreign &&
        reporter.assertion(
          {
            location: {
              file: path.join(manifest.root, ...foreign.split("/")),
              line: assertionLine,
            },
          },
          d,
        ) !== null
      )
        fail();
      const helper = path.join(
        manifest.root,
        "tests",
        "helpers",
        "not-an-assertion.ts",
      );
      if (
        reporter.assertion(
          {
            stack: `Error\n    at helper (${helper}:1:1)\n    at assertion (${absolute}:${assertionLine}:1)`,
          },
          d,
        ) !== null
      )
        fail();
      reporter.onBegin({}, { allTests: () => [fakeTest] });
      reporter.onTestEnd(fakeTest, {
        status: "failed",
        retry: 0,
        errors: [fakeError],
      });
      reporter.onTestEnd(fakeTest, { status: "passed", retry: 1, errors: [] });
      await reporter.onEnd({ status: "passed" });
      const safe = output.at(-1);
      if (
        reporter.broken ||
        touched ||
        safe.passedTests !== 1 ||
        safe.failedTests !== 0 ||
        safe.tests.length !== 2 ||
        safe.tests[0].assertionLine !== assertionLine ||
        safe.tests.some((t) => t.id !== d.id || t.finalOutcome !== "flaky")
      )
        fail();
    }
    const serialized = JSON.stringify(output);
    if (
      /A6_HOSTILE|https?:|example\.invalid|password|STACK|secret=|polluted|dynamicTitle|credentials/.test(
        serialized,
      )
    )
      fail();
    return true;
  } catch {
    fail();
  }
}
