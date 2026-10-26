import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { browserGeometryObserver, selfTestProbes } from "./a8-final-probes.mjs";

const BASE = "061529828cf09dc00fd0e9291a256b74267bfcf1";
const FILES = [
  "tests/e2e/accessibility-responsive.spec.ts",
  "tests/e2e/foundation.spec.ts",
];
const probePath = fileURLToPath(
  new URL("./a8-final-probes.mjs", import.meta.url),
);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const refuse = () => {
  throw new Error("A8_FINAL_INSTRUMENTATION_REFUSED");
};
function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: null,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
async function guardedFile(root, relative) {
  const canonical = await fs.realpath(root);
  if (canonical !== path.resolve(root)) refuse();
  let cursor = canonical;
  for (const component of relative.split("/")) {
    cursor = path.join(cursor, component);
    const stat = await fs.lstat(cursor);
    if (stat.isSymbolicLink()) refuse();
  }
  if (!(await fs.stat(cursor)).isFile()) refuse();
  return cursor;
}
function loadTypeScript(root) {
  const require = createRequire(path.join(root, "package.json"));
  try {
    return require("typescript");
  } catch {
    refuse();
  }
}
function cases(ts, source) {
  const file = ts.createSourceFile(
    "spec.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (file.parseDiagnostics.length) refuse();
  const found = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "test"
    ) {
      const first = node.arguments[0];
      found.push({
        line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
        endLine: file.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
        title: first?.getText(file) ?? null,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
function rewrite(source, changes) {
  const lines = source.split("\n"),
    proof = [];
  for (const [number, expected, replacement] of changes) {
    if (
      lines[number - 1] !== expected ||
      replacement.includes("\n") ||
      replacement.includes("\r")
    )
      refuse();
    lines[number - 1] = replacement;
    proof.push({ number, expected, replacement });
  }
  const output = lines.join("\n");
  if (output.split("\n").length !== source.split("\n").length) refuse();
  // Exact reversible source proof is stronger than a normalized AST comparison:
  // every byte outside the enumerated diagnostic insertion sites is identical.
  const restored = output.split("\n");
  for (const p of proof) {
    if (restored[p.number - 1] !== p.replacement) refuse();
    restored[p.number - 1] = p.expected;
  }
  if (restored.join("\n") !== source) refuse();
  return { output, proof };
}
function geometryChanges(source) {
  const lines = source.split("\n");
  const changes = [];
  const change = (n, expected, replacement) =>
    changes.push([n, expected, replacement]);
  const append = (n, expected, extra) => change(n, expected, expected + extra);
  append(
    1,
    'import { randomUUID } from "node:crypto";',
    ` import { recordGeometry as __a8RecordGeometry } from ${JSON.stringify(probePath)};`,
  );
  change(
    98,
    "async function geometry(page: Page) {",
    'async function geometry(page: Page, __a8Phase?: "LIBRARY_FILTER" | "MY_REQUESTS" | "REQUEST_FORM" | "SETTINGS") {',
  );
  change(
    99,
    "  const measured = await page.evaluate(() => {",
    "  const measured = await page.evaluate((__a8Phase) => {",
  );
  const serialized = browserGeometryObserver
    .toString()
    .replace(/[\r\n]+/g, " ");
  if (serialized.includes("//")) refuse();
  append(
    123,
    "    let peerOverlap = false;",
    ` const __a8Observer = (${serialized})(Boolean(__a8Phase));`,
  );
  change(
    135,
    "          peerOverlap = true;",
    "          { peerOverlap = true; __a8Observer.pair(i,j,ar,br); }",
  );
  append(
    210,
    "        }),",
    " __a8SafeGeometry: __a8Observer.result(peerOverlap, sampledControls),",
  );
  change(
    212,
    "  });",
    "  }, __a8Phase); if (__a8Phase) __a8RecordGeometry(__a8Phase, measured.__a8SafeGeometry, test.info());",
  );
  for (const [n, phase] of [
    [643, "LIBRARY_FILTER"],
    [694, "MY_REQUESTS"],
    [761, "REQUEST_FORM"],
    [775, "SETTINGS"],
  ]) {
    change(
      n,
      "          await geometry(page);",
      `          await geometry(page, ${JSON.stringify(phase)});`,
    );
  }
  if (lines.length !== 853 && lines.length !== 852) refuse();
  // Reject subtle changes to the original nested loop and original G05 assertion.
  if (
    lines[123] !== "    for (let i = 0; i < sampledControls.length; i++) {" ||
    lines[127] !== "        if (a.contains(b) || b.contains(a)) continue;" ||
    lines[131] !==
      "          Math.min(ar.right, br.right) - Math.max(ar.left, br.left) > 1 &&" ||
    lines[132] !==
      "          Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top) > 1" ||
    lines[231] !== '  expect(measured.peerOverlap, "A8-G05").toBe(false);'
  )
    refuse();
  return changes;
}
function authChanges(source) {
  const lines = source.split("\n"),
    changes = [];
  const append = (n, expected, extra) =>
    changes.push([n, expected, expected + extra]);
  const prepend = (n, expected, extra) =>
    changes.push([n, expected, extra + expected]);
  if (
    lines[446] !==
      'test("real registration, email verification, login, protected settings and logout", async ({' ||
    lines[496] !== "});"
  )
    refuse();
  // An explicit import is resolved from this diagnostic module, never from the SUT.
  append(
    1,
    lines[0],
    ` import { beginFoundationAuth as __a8Begin, setFoundationPhase as __a8Phase, captureFoundationAccount as __a8Account, finishFoundationAuth as __a8Finish } from ${JSON.stringify(probePath)};`,
  );
  append(
    451,
    "}) => {",
    " const __a8Auth = __a8Begin(page, test.info()); try {",
  );
  prepend(
    456,
    '  await page.goto("/en/register");',
    '  __a8Phase(__a8Auth,"REGISTER");',
  );
  prepend(
    463,
    '  await page.getByRole("button", { name: "Create account" }).click();',
    '  __a8Phase(__a8Auth,"SIGN_UP");',
  );
  append(
    464,
    "  await expect(page).toHaveURL(/\\/en\\/verify-email$/);",
    ' __a8Phase(__a8Auth,"VERIFY");',
  );
  prepend(
    483,
    '  await page.getByRole("button", { name: "Sign in" }).click();',
    '  __a8Phase(__a8Auth,"SIGN_IN");',
  );
  append(
    484,
    "  await expect(page).toHaveURL(/\\/en\\/settings$/);",
    ' __a8Phase(__a8Auth,"SETTINGS");',
  );
  for (const n of [485, 491]) {
    const original =
      "  await expect(page.getByText(email, { exact: true })).toBeVisible();";
    changes.push([
      n,
      original,
      `  try { ${original.trim()} } finally { await __a8Account(__a8Auth,page,email); }`,
    ]);
  }
  prepend(
    492,
    '  await page.getByRole("button", { name: "Sign out", exact: true }).click();',
    '  __a8Phase(__a8Auth,"LOGOUT");',
  );
  append(
    495,
    "  await expect(page).toHaveURL(/\\/en\\/login$/);",
    ' __a8Phase(__a8Auth,"DONE");',
  );
  append(
    496,
    '  expect(runtimeErrors, "No runtime or hydration error names").toEqual([]);',
    " } finally { await __a8Finish(__a8Auth,page); }",
  );
  return changes;
}

export async function instrumentTests(root, { apply = false } = {}) {
  root = path.resolve(root);
  const head = git(root, ["rev-parse", "HEAD"]).toString("utf8").trim();
  if (head !== BASE) refuse();
  const ts = loadTypeScript(root),
    planned = [];
  for (const [index, relative] of FILES.entries()) {
    const full = await guardedFile(root, relative);
    const bytes = await fs.readFile(full);
    const baseline = git(root, ["show", `${BASE}:${relative}`]);
    if (sha(bytes) !== sha(baseline)) refuse();
    const source = bytes.toString("utf8");
    const result = rewrite(
      source,
      index === 0 ? geometryChanges(source) : authChanges(source),
    );
    const before = cases(ts, source),
      after = cases(ts, result.output);
    if (
      before.length !== (index === 0 ? 6 : 4) ||
      JSON.stringify(before) !== JSON.stringify(after)
    )
      refuse();
    // All original action/assert/poll expression spellings are preserved literally;
    // only the four explicitly phase-tagged geometry calls have changed arguments.
    for (const p of result.proof) {
      if (
        [1, 98, 99, 135, 210, 212, 643, 694, 761, 775].includes(p.number) &&
        index === 0
      )
        continue;
      if (!p.replacement.includes(p.expected.trim())) refuse();
    }
    planned.push({
      relative,
      full,
      bytes,
      output: result.output,
      metadata: {
        path: relative,
        originalSHA256: sha(bytes),
        overlaySHA256: sha(result.output),
        lineCount: source.split("\n").length,
        testDeclarationCount: before.length,
        sourceSpans: before.map(({ line, endLine }) => ({ line, endLine })),
        changedLines: result.proof.map((p) => p.number),
        exactReversalProof: true,
      },
    });
  }
  if (apply) {
    if (
      process.platform !== "linux" ||
      process.env.CI !== "true" ||
      !process.env.GITHUB_WORKSPACE ||
      !process.env.A8_DIAG_SUT
    )
      refuse();
    if (
      root !== path.resolve(process.env.A8_DIAG_SUT) ||
      root !== path.resolve(process.env.GITHUB_WORKSPACE, "sut")
    )
      refuse();
    if (
      (await fs.realpath(root)) !== root ||
      probePath.startsWith(root + path.sep)
    )
      refuse();
    // Recheck both files before the first write. Never follow an output symlink.
    for (const item of planned) {
      await guardedFile(root, item.relative);
      if (sha(await fs.readFile(item.full)) !== sha(item.bytes)) refuse();
    }
    const opened = [];
    try {
      for (const item of planned)
        opened.push(
          await fs.open(item.full, constants.O_RDWR | constants.O_NOFOLLOW),
        );
      for (let i = 0; i < planned.length; i++) {
        const current = await opened[i].readFile();
        if (sha(current) !== sha(planned[i].bytes)) refuse();
      }
      for (let i = 0; i < planned.length; i++) {
        await opened[i].write(
          Buffer.from(planned[i].output),
          0,
          Buffer.byteLength(planned[i].output),
          0,
        );
        await opened[i].truncate(Buffer.byteLength(planned[i].output));
      }
    } finally {
      for (const handle of opened) await handle.close();
    }
  }
  return {
    base: BASE,
    applied: apply,
    lineCountPreserved: true,
    originalTestDeclarationsPreserved: true,
    files: planned.map((p) => p.metadata),
  };
}

export async function selfTestInstrumentation(root) {
  // Intentionally dry-run only, even on a CI host. Never launches original tests.
  const metadata = await instrumentTests(root);
  if (metadata.applied || metadata.files.length !== 2) refuse();
  await selfTestProbes();
  return { ...metadata, browserFreeSelfTests: true };
}
