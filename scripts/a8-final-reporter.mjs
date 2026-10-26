import { createRequire } from "node:module";
import { lstat, readdir, readFile, realpath, open } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import {
  validateGeometry,
  validateAuth,
  validateEvidenceFile,
  selfTestEvidence,
} from "./a8-final-schema.mjs";

export const SUT_SHA = "061529828cf09dc00fd0e9291a256b74267bfcf1";
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
const ROOT_KEYS = [
  "schema",
  "sut",
  "stage",
  "playwrightStarted",
  "outcome",
  "passedTests",
  "failedTests",
  "tests",
  "geometry",
  "auth",
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
  "a8Code",
];
const CATEGORIES = [
  "startup",
  "fixture",
  "navigation",
  "assertion",
  "cleanup",
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
const A8_FILE = "tests/e2e/accessibility-responsive.spec.ts";
const PROFILE_GROUPS = [
  ["A8 Home A", "A8 Home B", "A8 Home C", "A8 Home D"],
  ["A8 Catalog A", "A8 Catalog B", "A8 Catalog C", "A8 Catalog D"],
  ["A8 Public routes A", "A8 Public routes C"],
  ["A8 Owner A", "A8 Owner C"],
  ["A8 System Home EN"],
  ["A8 Reduced motion"],
];
const PROFILE_IDS = [
  ["A8_HOME_A", "A8_HOME_B", "A8_HOME_C", "A8_HOME_D"],
  ["A8_CATALOG_A", "A8_CATALOG_B", "A8_CATALOG_C", "A8_CATALOG_D"],
  ["A8_PUBLIC_A", "A8_PUBLIC_C"],
  ["A8_OWNER_A", "A8_OWNER_C"],
  ["A8_SYSTEM_HOME_EN"],
  ["A8_REDUCED_MOTION"],
];
const fail = () => {
  throw new Error("A8_DIAG_REPORTER_SAFETY_FAILED");
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
// Runtime Playwright classes are permitted, but only own data descriptors are read.
// In particular no error message/stack/cause, params, attachments or titlePath access.
function own(value, key) {
  if (!value || (typeof value !== "object" && typeof value !== "function"))
    return undefined;
  const d = Object.getOwnPropertyDescriptor(value, key);
  return d && Object.hasOwn(d, "value") ? d.value : undefined;
}
function data(value, keys) {
  if (value === null || typeof value !== "object") fail();
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail();
  const keysFound = Reflect.ownKeys(value);
  if (
    keysFound.length !== keys.length ||
    keysFound.some((k) => !keys.includes(k))
  )
    fail();
  const out = Object.create(null);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !Object.hasOwn(d, "value") || !d.enumerable) fail();
    out[key] = d.value;
  }
  return out;
}
function arrayData(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    fail();
  const length = own(value, "length");
  if (
    !integer(length) ||
    length > MAX ||
    Reflect.ownKeys(value).length !== length + 1
  )
    fail();
  const out = [];
  for (let i = 0; i < length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !Object.hasOwn(d, "value") || !d.enumerable) fail();
    out.push(d.value);
  }
  return out;
}

/** Source inventory is descriptive; only the private WeakMap authorizes output.
 * .cases exposes the 14 fixed source-validated names for the parent's final mapping.
 * Legacy IDs retain sorted file/line/column declaration numbering, never titles.
 */
export async function buildManifest(root) {
  try {
    const resolved = await realpath(path.resolve(root));
    const ts = createRequire(path.join(resolved, "package.json"))("typescript");
    const base = path.join(resolved, "tests", "e2e");
    const files = [];
    async function walk(dir) {
      const info = await lstat(dir);
      if (
        info.isSymbolicLink() ||
        !info.isDirectory() ||
        !inside(resolved, await realpath(dir))
      )
        return;
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(file);
        else if (
          entry.isFile() &&
          entry.name.endsWith(".spec.ts") &&
          inside(base, await realpath(file))
        )
          files.push(file);
      }
    }
    if ((await lstat(path.join(resolved, "tests"))).isSymbolicLink()) fail();
    await walk(base);
    files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const declarations = [],
      spans = new Map(),
      operations = new Map(),
      cases = [];
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
      const ranges = [],
        ops = [],
        tests = [],
        arrays = new Map();
      spans.set(file, ranges);
      operations.set(file, ops);
      const pos = (offset) => {
        const p = source.getLineAndCharacterOfPosition(offset);
        return { line: p.line + 1, column: p.character + 1 };
      };
      const span = (node) => ({
        start: pos(node.getStart(source)),
        end: pos(node.getEnd() - 1),
      });
      function unwrap(node) {
        while (
          node &&
          (ts.isAsExpression(node) ||
            ts.isParenthesizedExpression(node) ||
            ts.isNonNullExpression(node))
        )
          node = node.expression;
        return node;
      }
      function literalList(node) {
        node = unwrap(node);
        if (
          !node ||
          !ts.isArrayLiteralExpression(node) ||
          !node.elements.every(ts.isStringLiteral)
        )
          return null;
        return node.elements.map((n) => n.text);
      }
      function isExpect(expr) {
        if (ts.isIdentifier(expr)) return expr.text === "expect";
        if (ts.isCallExpression(expr) || ts.isPropertyAccessExpression(expr))
          return isExpect(expr.expression);
        return false;
      }
      function cleanup(node) {
        for (let n = node; n.parent; n = n.parent) {
          if (ts.isTryStatement(n.parent) && n.parent.finallyBlock === n)
            return true;
        }
        return false;
      }
      function visit(node) {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
          const list = literalList(node.initializer);
          if (list) arrays.set(node.name.text, list);
        }
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
            const p = pos(node.getStart(source));
            const d = {
              file,
              declarationLine: p.line,
              declarationColumn: p.column,
            };
            declarations.push(d);
            tests.push({ d, title: node.arguments[0] });
          }
          // Outermost matcher call only: nested expect/poll calls cannot broaden provenance.
          const parentContinues =
            (ts.isPropertyAccessExpression(node.parent) &&
              node.parent.expression === node) ||
            (ts.isCallExpression(node.parent) &&
              node.parent.expression === node);
          if (isExpect(expr) && !parentContinues) {
            const codes = new Set();
            function messages(n) {
              if (ts.isCallExpression(n)) {
                const e = n.expression;
                if (
                  ts.isIdentifier(e) &&
                  e.text === "expect" &&
                  n.arguments[1] &&
                  ts.isStringLiteral(n.arguments[1])
                )
                  codes.add(n.arguments[1].text);
                if (
                  ts.isPropertyAccessExpression(e) &&
                  isExpect(e.expression)
                ) {
                  for (const arg of n.arguments)
                    if (ts.isObjectLiteralExpression(arg)) {
                      for (const prop of arg.properties)
                        if (
                          ts.isPropertyAssignment(prop) &&
                          prop.name.getText(source) === "message" &&
                          ts.isStringLiteral(prop.initializer)
                        )
                          codes.add(prop.initializer.text);
                    }
                }
              }
              ts.forEachChild(n, messages);
            }
            messages(node);
            const fixed = [...codes].filter((c) =>
              /^A8-(?:[A-Z][0-9]{2}|MEASUREMENT-LIMIT-NOT-VERIFIED)$/.test(c),
            );
            let helper = false;
            if (file === A8_FILE && pos(node.getStart(source)).line === 40) {
              // Exact source shape and caller validation below; never a general code-variable license.
              helper =
                node.getText(source) ===
                "expect.poll(() => target.isVisible(), { message: code }).toBe(true)";
              // Codes are populated from verified direct visible(...) callers below.
            }
            ranges.push({
              ...span(node),
              codes: file === A8_FILE ? fixed : [],
              helper,
            });
          }
          if (ts.isPropertyAccessExpression(expr)) {
            const method = expr.name.text;
            if (
              ["goto", "reload", "close", "end"].includes(method) ||
              cleanup(node)
            ) {
              ops.push({
                ...span(node),
                category:
                  cleanup(node) || ["close", "end"].includes(method)
                    ? "cleanup"
                    : "navigation",
              });
            }
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
      if (file === A8_FILE) {
        if (tests.length !== PROFILE_GROUPS.length) fail();
        for (let i = 0; i < tests.length; i++) {
          let title = unwrap(tests[i].title),
            names;
          if (ts.isStringLiteral(title)) names = [title.text];
          else if (ts.isElementAccessExpression(title)) {
            const target = unwrap(title.expression);
            names = ts.isIdentifier(target)
              ? arrays.get(target.text)
              : literalList(target);
            if (
              !ts.isIdentifier(unwrap(title.argumentExpression)) ||
              unwrap(title.argumentExpression).text !== "index"
            )
              fail();
          }
          if (
            !names ||
            JSON.stringify(names) !== JSON.stringify(PROFILE_GROUPS[i])
          )
            fail();
          names.forEach((title, j) =>
            cases.push({ ...tests[i].d, id: PROFILE_IDS[i][j], title }),
          );
        }
        const helperCodes = new Set();
        function caller(n) {
          if (
            ts.isCallExpression(n) &&
            ts.isIdentifier(n.expression) &&
            n.expression.text === "visible" &&
            n.arguments.length === 2 &&
            ts.isStringLiteral(n.arguments[1]) &&
            /^A8-[A-Z][0-9]{2}$/.test(n.arguments[1].text)
          )
            helperCodes.add(n.arguments[1].text);
          ts.forEachChild(n, caller);
        }
        caller(source);
        if (!helperCodes.has("A8-K02") || !ranges.some((r) => r.helper)) fail();
        for (const r of ranges) if (r.helper) r.codes.push(...helperCodes);
      }
    }
    if (declarations.length > 9999 || cases.length !== 14) fail();
    const byLocation = new Map(),
      byLine = new Map(),
      byId = new Map();
    declarations.forEach((d, i) => {
      d.id = `T${String(i + 1).padStart(4, "0")}`;
      Object.freeze(d);
      const entries =
        d.file === A8_FILE
          ? cases.filter(
              (c) =>
                c.declarationLine === d.declarationLine &&
                c.declarationColumn === d.declarationColumn,
            )
          : [d];
      byLocation.set(
        `${d.file}:${d.declarationLine}:${d.declarationColumn}`,
        entries,
      );
      const key = `${d.file}:${d.declarationLine}`;
      byLine.set(key, [...(byLine.get(key) || []), ...entries]);
      entries.forEach((e) => byId.set(e.id, e));
    });
    cases.forEach(Object.freeze);
    const manifest = Object.freeze({
      root: resolved,
      files: Object.freeze([...spans.keys()]),
      declarations: Object.freeze(declarations),
      cases: Object.freeze(cases),
    });
    manifests.set(manifest, {
      resolved,
      spans,
      operations,
      byLocation,
      byLine,
      byId,
    });
    return manifest;
  } catch {
    fail();
  }
}
const contains = (s, line, column) =>
  integer(line, 1) &&
  integer(column, 1) &&
  (line > s.start.line ||
    (line === s.start.line && column >= s.start.column)) &&
  (line < s.end.line || (line === s.end.line && column <= s.end.column));
const lineIn = (s, line) =>
  integer(line, 1) && line >= s.start.line && line <= s.end.line;
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
    geometry: [],
    auth: [],
  };
}
export function validateResult(result, manifest) {
  try {
    const r = data(result, ROOT_KEYS);
    if (
      r.schema !== 1 ||
      r.sut !== SUT_SHA ||
      !STAGES.includes(r.stage) ||
      typeof r.playwrightStarted !== "boolean" ||
      !["pass", "fail", "unknown"].includes(r.outcome)
    )
      fail();
    if (
      ![r.passedTests, r.failedTests].every(
        (n) => n === null || (integer(n) && n <= MAX),
      )
    )
      fail();
    if (
      !r.playwrightStarted &&
      (r.passedTests !== null || r.failedTests !== null)
    )
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
      let d = null;
      if (t.id === null) {
        if (
          t.file !== null ||
          t.declarationLine !== null ||
          t.assertionLine !== null ||
          t.a8Code !== null
        )
          fail();
      } else {
        if (typeof t.id !== "string") fail();
        d = authority?.byId.get(t.id);
        if (!d || t.file !== d.file || t.declarationLine !== d.declarationLine)
          fail();
        if (
          t.assertionLine !== null &&
          (!authority.spans
            .get(d.file)
            .some((s) => lineIn(s, t.assertionLine)) ||
            (d.file === A8_FILE && t.a8Code === null))
        )
          fail();
        if (
          t.a8Code !== null &&
          (d.file !== A8_FILE ||
            typeof t.a8Code !== "string" ||
            t.category !== "assertion" ||
            t.assertionLine === null ||
            !authority.spans
              .get(d.file)
              .some(
                (s) => lineIn(s, t.assertionLine) && s.codes.includes(t.a8Code),
              ))
        )
          fail();
      }
      if (t.assertionLine !== null && t.category !== "assertion") fail();
      if (t.category === "assertion" && t.assertionLine === null) fail();
      return {
        id: d?.id ?? null,
        file: d?.file ?? null,
        declarationLine: d?.declarationLine ?? null,
        assertionLine: t.assertionLine,
        category: t.category,
        retry: t.retry,
        finalOutcome: t.finalOutcome,
        outcome: t.outcome,
        a8Code: t.a8Code,
      };
    });
    const geometryInput = arrayData(r.geometry);
    const authInput = arrayData(r.auth);
    if (geometryInput.length > 64 || authInput.length > 16) fail();
    const geometry = geometryInput.map(validateGeometry);
    const auth = authInput.map(validateAuth);
    const seenGeometry = new Set(),
      seenAuth = new Set();
    for (const g of geometry) {
      const declaration = authority?.byId.get(g.id);
      const key = `${g.id}:${g.retry}:${g.site}`;
      if (
        !r.playwrightStarted ||
        declaration?.file !== A8_FILE ||
        seenGeometry.has(key)
      )
        fail();
      seenGeometry.add(key);
    }
    for (const a of auth) {
      const declaration = authority?.byId.get(a.id);
      const key = `${a.id}:${a.retry}`;
      if (
        !r.playwrightStarted ||
        declaration?.file !== "tests/e2e/foundation.spec.ts" ||
        declaration.declarationLine !== 447 ||
        seenAuth.has(key)
      )
        fail();
      seenAuth.add(key);
    }
    return {
      schema: 1,
      sut: SUT_SHA,
      stage: r.stage,
      playwrightStarted: r.playwrightStarted,
      outcome: r.outcome,
      passedTests: r.passedTests,
      failedTests: r.failedTests,
      tests,
      geometry,
      auth,
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
  a8Code: null,
});
const snapshotLocation = (loc) => ({
  file: own(loc, "file"),
  line: own(loc, "line"),
  column: own(loc, "column"),
});

export default class DiagnosticReporter {
  constructor() {
    this.result = blankResult("native-startup");
    this.manifest = null;
    this.pending = [];
    this.steps = new Map();
    this.stepCount = 0;
    this.broken = false;
    this.ready = (
      process.env.A8_DIAG_SUT && path.isAbsolute(process.env.A8_DIAG_SUT)
        ? buildManifest(process.env.A8_DIAG_SUT)
        : Promise.reject(new Error("A8_DIAG_REPORTER_SAFETY_FAILED"))
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
    this.suite = suite;
    this.result.stage = "browser";
    this.result.playwrightStarted = true;
  }
  onStepEnd(test, result, step) {
    try {
      // Error presence only. Never dereference the error, even for a location.
      if (!own(step, "error")) return;
      if (++this.stepCount > MAX) fail();
      const record = {
        test,
        category: own(step, "category"),
        title: own(step, "title"),
        location: snapshotLocation(own(step, "location")),
      };
      const list = this.steps.get(result) || [];
      list.push(record);
      this.steps.set(result, list);
    } catch {
      this.broken = true;
      process.exitCode = 1;
    }
  }
  onTestEnd(test, result) {
    try {
      const status = own(result, "status"),
        retry = own(result, "retry");
      if (status !== "passed" || retry > 0) {
        if (this.pending.length >= MAX) fail();
        this.pending.push({
          test,
          result,
          status,
          retry,
          location: snapshotLocation(own(test, "location")),
          title: own(test, "title"),
        });
      }
    } catch {
      this.broken = true;
      process.exitCode = 1;
    }
  }
  onError() {
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
    const a = manifests.get(this.manifest);
    if (!a) return null;
    const absolute = path.resolve(a.resolved, file);
    if (!inside(a.resolved, absolute)) return null;
    const relative = path
      .relative(a.resolved, absolute)
      .split(path.sep)
      .join("/");
    return a.spans.has(relative) ? relative : null;
  }
  identity(location, title) {
    const file = this.sourceFile(location.file);
    if (!file || !integer(location.line, 1) || !integer(location.column, 1))
      return null;
    const a = manifests.get(this.manifest);
    const candidates =
      a.byLocation.get(`${file}:${location.line}:${location.column}`) ||
      a.byLine.get(`${file}:${location.line}`);
    if (file === A8_FILE)
      return candidates?.find((d) => d.title === title) || null;
    return candidates?.length === 1 ? candidates[0] : null;
  }
  observe(steps, declaration, test) {
    let fallback = null;
    for (const step of steps) {
      if (step.test !== test) continue;
      if (step.category === "fixture") {
        fallback ||= { category: "fixture", assertionLine: null, a8Code: null };
        continue;
      }
      if (
        !declaration ||
        this.sourceFile(step.location.file) !== declaration.file
      )
        continue;
      const a = manifests.get(this.manifest),
        { line, column } = step.location;
      if (step.category === "expect") {
        const spans = a.spans
          .get(declaration.file)
          .filter((s) => contains(s, line, column));
        if (!spans.length) continue;
        if (declaration.file === A8_FILE) {
          // Exact equality against AST-derived fixed codes, not substring/error matching.
          if (
            typeof step.title !== "string" ||
            !spans.some((s) => s.codes.includes(step.title))
          )
            continue;
          return {
            category: "assertion",
            assertionLine: line,
            a8Code: step.title,
          };
        }
        return { category: "assertion", assertionLine: line, a8Code: null };
      }
      if (step.category === "pw:api") {
        const op = a.operations
          .get(declaration.file)
          .find((s) => contains(s, line, column));
        if (op)
          fallback ||= {
            category: op.category,
            assertionLine: null,
            a8Code: null,
          };
      }
    }
    return (
      fallback || { category: "unknown", assertionLine: null, a8Code: null }
    );
  }
  async onEnd(fullResult) {
    try {
      await this.ready;
      if (this.broken) fail();
      // These are the documented Playwright aggregation methods, not title methods.
      const all = this.suite ? arrayData(this.suite.allTests()) : [];
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
      for (const p of this.pending) {
        const d = this.identity(p.location, p.title);
        this.result.tests.push({
          id: d?.id ?? null,
          file: d?.file ?? null,
          declarationLine: d?.declarationLine ?? null,
          ...this.observe(this.steps.get(p.result) || [], d, p.test),
          retry: p.retry,
          finalOutcome: finals.get(p.test) || "unknown",
          outcome: ATTEMPT.includes(p.status) ? p.status : "unknown",
        });
      }
      this.result.passedTests = this.suite ? passed : null;
      this.result.failedTests = this.suite ? failed : null;
      this.result.outcome =
        own(fullResult, "status") === "passed" &&
        this.suite &&
        !this.hadError &&
        failed === 0
          ? "pass"
          : "fail";
      await this.collectEvidence();
      await this.persist(validateResult(this.result, this.manifest));
    } catch {
      this.broken = true;
      process.exitCode = 1;
      try {
        await this.persist(
          validateResult(blankResult("reporter-safety", "fail"), this.manifest),
        );
      } catch {
        /* Never output raw failures. */
      }
    }
    if (this.broken || this.result.outcome === "fail")
      return { status: "failed" };
  }
  async privateDirectory() {
    const directory = process.env.A8_DIAG_PRIVATE;
    if (!directory || !path.isAbsolute(directory)) fail();
    const temp = await realpath(process.env.RUNNER_TEMP || "");
    const stat = await lstat(directory);
    if (
      stat.isSymbolicLink() ||
      !stat.isDirectory() ||
      path.dirname(directory) !== temp ||
      (await realpath(directory)) !== directory ||
      !/^a8-legacy-[a-f0-9-]{36}$/.test(path.basename(directory)) ||
      (stat.mode & 0o777) !== 0o700
    )
      fail();
    return directory;
  }
  async collectEvidence() {
    const directory = await this.privateDirectory();
    const geometry = [],
      auth = [];
    for (const name of (await readdir(directory)).sort()) {
      if (!/^a8-final-evidence-\d+-\d+\.json$/.test(name)) continue;
      const file = path.join(directory, name);
      const stat = await lstat(file);
      if (
        stat.isSymbolicLink() ||
        !stat.isFile() ||
        stat.size > 32768 ||
        (stat.mode & 0o777) !== 0o600
      )
        fail();
      const handle = await open(
        file,
        constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
      );
      let evidence;
      try {
        const opened = await handle.stat();
        if (
          !opened.isFile() ||
          opened.size > 32768 ||
          (opened.mode & 0o777) !== 0o600 ||
          opened.dev !== stat.dev ||
          opened.ino !== stat.ino
        )
          fail();
        // Bound the read itself, not just the preceding stat (files may grow).
        const raw = Buffer.alloc(32769);
        let length = 0;
        while (length < raw.length) {
          const { bytesRead } = await handle.read(
            raw,
            length,
            raw.length - length,
            length,
          );
          if (bytesRead === 0) break;
          length += bytesRead;
        }
        if (length > 32768) fail();
        evidence = validateEvidenceFile(
          JSON.parse(raw.subarray(0, length).toString("utf8")),
        );
      } finally {
        await handle.close();
      }
      const target = evidence.kind === "geometry" ? geometry : auth;
      target.push(evidence.value);
      if (geometry.length > 64 || auth.length > 16) fail();
    }
    this.result.geometry = geometry;
    this.result.auth = auth;
  }
  async persist(result) {
    const directory = await this.privateDirectory();
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

/** Pure source/schema and fake-callback checks only; no browser or services. */
export async function selfTest(root) {
  try {
    if (selfTestEvidence() !== true) fail();
    const manifest = await buildManifest(root);
    const fresh = () => blankResult("guard");
    const sentinel =
      "A8_HOSTILE_https://user:password@example.invalid/token?secret=xyz\nSTACK";
    let touched = false;
    const poison = {
      get() {
        touched = true;
        throw new Error(sentinel);
      },
      enumerable: true,
    };
    const reject = (value, authority = manifest) => {
      let rejected = false;
      try {
        validateResult(value, authority);
      } catch {
        rejected = true;
      }
      if (!rejected) fail();
    };
    const observed = () => ({ ...fresh(), playwrightStarted: true });
    const geometry = {
      id: "A8_OWNER_A",
      retry: 0,
      site: "LIBRARY_FILTER",
      overlap: false,
      eligibility: null,
      pair: null,
    };
    const auth = {
      id: "T0016",
      retry: 0,
      phase: "BOOT",
      sessionTransport: "NOT_OBSERVED",
      signUp: { status: null, result: "NOT_ATTEMPTED" },
      signIn: { status: null, result: "NOT_ATTEMPTED" },
      verificationReached: false,
      settingsReached: false,
      headerState: "unknown",
      settingsState: "UNKNOWN",
      accountVisible: null,
      accountMatch: "UNKNOWN",
      snapshot: "NONE",
      observationError: false,
    };
    const extras = validateResult(
      { ...observed(), geometry: [geometry], auth: [auth] },
      manifest,
    );
    for (const key of ["geometry", "auth"]) {
      for (const value of [null, {}, sentinel, new Array(1)])
        reject({ ...fresh(), [key]: value });
      const rootGetter = fresh();
      Object.defineProperty(rootGetter, key, poison);
      reject(rootGetter);
    }
    reject({ ...observed(), geometry: new Array(65).fill(geometry) });
    reject({ ...observed(), auth: new Array(17).fill(auth) });
    reject({ ...observed(), geometry: [geometry, geometry] });
    reject({ ...observed(), auth: [auth, auth] });
    reject({ ...fresh(), geometry: [geometry] });
    reject({ ...fresh(), auth: [auth] });
    reject({ ...observed(), geometry: [geometry] }, { ...manifest });
    reject({ ...observed(), auth: [auth] }, { ...manifest });
    for (const change of [
      { id: "A8_HOME_A" },
      { site: sentinel },
      { retry: 2 },
      { category: sentinel },
      { url: sentinel },
      { pair: { a: { index: -1 } } },
    ])
      reject({ ...observed(), geometry: [{ ...geometry, ...change }] });
    for (const change of [
      { id: "T0015" },
      { phase: sentinel },
      { headerState: sentinel },
      { retry: 2 },
      { url: sentinel },
    ])
      reject({ ...observed(), auth: [{ ...auth, ...change }] });
    const geometryGetter = { ...geometry };
    Object.defineProperty(geometryGetter, "pair", poison);
    reject({ ...observed(), geometry: [geometryGetter] });
    const output = [
      extras,
      validateResult(fresh(), manifest),
      validateResult({ ...fresh(), tests: [unknownRecord()] }, manifest),
    ];
    for (const [key, value] of [
      ["schema", 2],
      ["sut", sentinel],
      ["stage", sentinel],
      ["outcome", sentinel],
      ["passedTests", NaN],
      ["failedTests", Infinity],
      ["tests", null],
      ["title", sentinel],
      ["playwrightStarted", null],
    ])
      reject({ ...fresh(), [key]: value });
    for (const value of [
      null,
      undefined,
      () => {},
      Object.create({}),
      JSON.parse('{"__proto__":{"polluted":true}}'),
    ])
      reject(value);
    const getter = fresh();
    Object.defineProperty(getter, "stage", poison);
    reject(getter);
    const symbol = fresh();
    symbol[Symbol("secret")] = sentinel;
    reject(symbol);
    const sparse = new Array(1);
    reject({ ...fresh(), tests: sparse });
    reject({ ...fresh(), tests: new Array(MAX + 1).fill(unknownRecord()) });
    const arr = [unknownRecord()];
    Object.defineProperty(arr, "0", poison);
    reject({ ...fresh(), tests: arr });
    for (const [key, value] of [
      ["id", sentinel],
      ["file", "../escape.spec.ts"],
      ["declarationLine", 1],
      ["assertionLine", 1],
      ["category", "timeout"],
      ["retry", 2],
      ["retry", -1],
      ["retry", NaN],
      ["a8Code", "A8-K02"],
      ["stack", sentinel],
      ["params", sentinel],
      ["finalOutcome", null],
      ["outcome", sentinel],
    ])
      reject({ ...fresh(), tests: [{ ...unknownRecord(), [key]: value }] });
    const authority = manifests.get(manifest);
    const a8 = manifest.cases[0];
    const absolute = path.join(manifest.root, ...A8_FILE.split("/"));
    const codeSpan = authority.spans
      .get(A8_FILE)
      .find((s) => s.codes.includes("A8-F01"));
    const helper = authority.spans.get(A8_FILE).find((s) => s.helper);
    if (
      !codeSpan ||
      !helper ||
      new Set(manifest.cases.map((d) => d.id)).size !== 14
    )
      fail();
    const location = (d) => ({
      file: path.join(manifest.root, ...d.file.split("/")),
      line: d.declarationLine,
      column: d.declarationColumn,
    });
    const reporter = Object.assign(
      Object.create(DiagnosticReporter.prototype),
      {
        manifest,
        ready: Promise.resolve(),
        result: blankResult("native-startup"),
        pending: [],
        steps: new Map(),
        stepCount: 0,
        broken: false,
        collectEvidence: async () => {},
        persist: async (value) => {
          output.push(validateResult(value, manifest));
        },
      },
    );
    const all = manifest.cases.map((d) => ({
      title: d.title,
      location: location(d),
      outcome: () => "flaky",
    }));
    all.forEach((test, i) => {
      if (
        reporter.identity(test.location, test.title)?.id !==
        manifest.cases[i].id
      )
        fail();
    });
    if (reporter.identity(location(a8), sentinel) !== null) fail();
    const malicious = { location: location(a8), outcome: () => "unexpected" };
    Object.defineProperty(malicious, "title", poison);
    Object.defineProperty(malicious, "titlePath", poison);
    const makeStep = (title, loc, category = "expect") => {
      const error = {};
      for (const key of ["message", "stack", "cause", "location"])
        Object.defineProperty(error, key, poison);
      const step = { title, category, location: loc, error };
      Object.defineProperty(step, "params", poison);
      return step;
    };
    const first = { status: "failed", retry: 0 };
    Object.defineProperty(first, "error", poison);
    Object.defineProperty(first, "errors", poison);
    reporter.onBegin({}, { allTests: () => [...all, malicious] });
    reporter.onStepEnd(
      all[0],
      first,
      makeStep("A8-F01", { file: absolute, ...codeSpan.start }),
    );
    // Outer bounded A8-HOME error is deliberately uninspectable, as is cleanup.
    reporter.onStepEnd(
      all[0],
      first,
      makeStep("A8-HOME", location(a8), "test.step"),
    );
    reporter.onTestEnd(all[0], first);
    reporter.onTestEnd(all[0], { status: "passed", retry: 1 });
    const helperResult = { status: "failed", retry: 0 };
    reporter.onStepEnd(
      all[4],
      helperResult,
      makeStep("A8-K02", { file: absolute, ...helper.start }),
    );
    reporter.onTestEnd(all[4], helperResult);
    for (const [title, loc] of [
      ["A8-F01" + sentinel, { file: absolute, ...codeSpan.start }],
      ["A8-F01", { file: absolute, line: 1, column: 1 }],
      ["A8-F01", { file: "foreign.spec.ts", ...codeSpan.start }],
      ["A8-F01", null],
    ]) {
      const attempt = { status: "failed", retry: 0 };
      reporter.onStepEnd(all[1], attempt, makeStep(title, loc));
      reporter.onTestEnd(all[1], attempt);
    }
    reporter.onTestEnd(malicious, { status: "timedOut", retry: 0 });
    await reporter.onEnd({ status: "passed" });
    const safe = output.at(-1);
    if (
      reporter.broken ||
      touched ||
      safe.passedTests !== 14 ||
      safe.failedTests !== 1 ||
      safe.tests.length !== 8 ||
      safe.tests[0].a8Code !== "A8-F01" ||
      safe.tests[0].assertionLine !== codeSpan.start.line ||
      safe.tests[1].finalOutcome !== "flaky" ||
      safe.tests[2].a8Code !== "A8-K02" ||
      safe.tests
        .slice(3)
        .some(
          (t) =>
            t.a8Code !== null ||
            t.assertionLine !== null ||
            t.category !== "unknown",
        )
    )
      fail();
    const known = safe.tests[0];
    for (const change of [
      { a8Code: "A8-F01" + sentinel },
      { assertionLine: 1 },
      { file: "../escape.spec.ts" },
      { id: null },
      { declarationLine: 1 },
      { a8Code: "A8-K02" },
    ])
      reject({ ...fresh(), tests: [{ ...known, ...change }] });
    reject({ ...fresh(), tests: [known] }, { ...manifest });
    const recordGetter = { ...known };
    Object.defineProperty(recordGetter, "a8Code", poison);
    reject({ ...fresh(), tests: [recordGetter] });
    if (
      touched ||
      /A8_HOSTILE|https?:|example\.invalid|password|STACK|secret=|polluted/.test(
        JSON.stringify(output),
      )
    )
      fail();
    return true;
  } catch {
    fail();
  }
}
