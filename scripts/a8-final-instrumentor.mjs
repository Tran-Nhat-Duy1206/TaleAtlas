import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { types } from "node:util";
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

// Validate descriptors before reading values: options/environment accessors must
// never execute, and no public option can replace policy, files, platform or git.
function record(value, allowed) {
  if (!value || typeof value !== "object" || types.isProxy(value)) refuse();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) refuse();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (
      typeof key !== "string" ||
      (allowed && !allowed.includes(key)) ||
      !Object.hasOwn(descriptors[key], "value")
    )
      refuse();
  }
  return descriptors;
}
function optionsFor(options, allowed) {
  record(options, allowed);
  return options;
}
function intendedEnvironment(environment) {
  const descriptors = record(environment);
  for (const descriptor of Object.values(descriptors)) {
    if (typeof descriptor.value !== "string" || descriptor.value.includes("\0"))
      refuse();
  }
  for (const key of ["CI", "GITHUB_WORKSPACE", "A8_DIAG_SUT"]) {
    if (!Object.hasOwn(descriptors, key)) refuse();
  }
  if (environment.CI !== "true") refuse();
  // Copy all credentials unchanged; never log or return the environment.
  return Object.fromEntries(
    Object.entries(descriptors).map(([key, descriptor]) => [
      key,
      descriptor.value,
    ]),
  );
}
async function canonicalDirectory(value) {
  if (
    typeof value !== "string" ||
    !path.isAbsolute(value) ||
    /[\x00-\x1f\x7f]/.test(value) ||
    value !== path.resolve(value) ||
    (await fs.realpath(value)) !== value ||
    !(await fs.lstat(value)).isDirectory()
  )
    refuse();
  return value;
}
async function environmentIdentity(root, environment) {
  const env = intendedEnvironment(environment);
  await canonicalDirectory(root);
  await canonicalDirectory(env.GITHUB_WORKSPACE);
  await canonicalDirectory(env.A8_DIAG_SUT);
  if (
    root !== env.A8_DIAG_SUT ||
    root !== path.join(env.GITHUB_WORKSPACE, "sut") ||
    probePath.startsWith(root + path.sep)
  )
    refuse();
}
async function applyPolicy(root, environment, platform) {
  if (platform !== "linux") refuse();
  await environmentIdentity(root, environment);
}
function assertionFingerprint(ts, source) {
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
    if (ts.isExpressionStatement(node)) {
      const text = node.expression.getText(file);
      if (/^(?:await\s+)?expect\s*(?:\(|\.)/.test(text)) found.push(text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
async function planInstrumentation(root, ts) {
  await canonicalDirectory(root);
  const head = git(root, ["rev-parse", "HEAD"]).toString("utf8").trim();
  const top = git(root, ["rev-parse", "--show-toplevel"])
    .toString("utf8")
    .trim();
  if (head !== BASE || (await fs.realpath(top)) !== root) refuse();
  const planned = [];
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
    const before = ts ? cases(ts, source) : null;
    if (ts) {
      if (
        before.length !== (index === 0 ? 6 : 4) ||
        JSON.stringify(before) !== JSON.stringify(cases(ts, result.output)) ||
        JSON.stringify(assertionFingerprint(ts, source)) !==
          JSON.stringify(assertionFingerprint(ts, result.output))
      )
        refuse();
    }
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
      proof: result.proof,
      metadata: {
        path: relative,
        originalSHA256: sha(bytes),
        overlaySHA256: sha(result.output),
        lineCount: source.split("\n").length,
        ...(before
          ? {
              testDeclarationCount: before.length,
              sourceSpans: before.map(({ line, endLine }) => ({
                line,
                endLine,
              })),
              originalAssertionsPreserved: true,
            }
          : {}),
        changedLines: result.proof.map((p) => p.number),
        exactReversalProof: true,
      },
    });
  }
  return planned;
}
function metadataFor(planned, applied) {
  return {
    base: BASE,
    applied,
    lineCountPreserved: true,
    originalTestDeclarationsPreserved: true,
    originalAssertionsPreserved: true,
    files: planned.map((p) => p.metadata),
  };
}
async function writePlan(root, planned) {
  if (
    planned.length !== FILES.length ||
    planned.some((item, index) => item.relative !== FILES[index])
  )
    refuse();
  // Complete read-only planning and all-file revalidation precede any write.
  for (const item of planned) {
    if ((await guardedFile(root, item.relative)) !== item.full) refuse();
    if (sha(await fs.readFile(item.full)) !== sha(item.bytes)) refuse();
  }
  const opened = [];
  try {
    for (const item of planned)
      opened.push(
        await fs.open(item.full, constants.O_RDWR | constants.O_NOFOLLOW),
      );
    for (let i = 0; i < planned.length; i++) {
      const stat = await opened[i].stat();
      const named = await fs.lstat(
        await guardedFile(root, planned[i].relative),
      );
      if (
        !stat.isFile() ||
        stat.dev !== named.dev ||
        stat.ino !== named.ino ||
        sha(await opened[i].readFile()) !== sha(planned[i].bytes)
      )
        refuse();
    }
    for (let i = 0; i < planned.length; i++) {
      const buffer = Buffer.from(planned[i].output);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesWritten } = await opened[i].write(
          buffer,
          offset,
          buffer.length - offset,
          offset,
        );
        if (!bytesWritten) refuse();
        offset += bytesWritten;
      }
      await opened[i].truncate(buffer.length);
      await opened[i].sync();
    }
    for (const item of planned) {
      await guardedFile(root, item.relative);
      if (sha(await fs.readFile(item.full)) !== sha(item.output)) refuse();
    }
  } finally {
    await Promise.all(opened.map((handle) => handle.close()));
  }
}

export async function preflightInstrumentation(root, options = {}) {
  const { environment } = optionsFor(options, ["environment"]);
  await applyPolicy(root, environment, process.platform);
  const planned = await planInstrumentation(root, null);
  // No TypeScript/module resolution occurs here. Do not claim AST validation yet.
  return {
    base: BASE,
    applied: false,
    preflightPassed: true,
    lineCountPreserved: true,
    files: planned.map((item) => item.metadata),
  };
}

export async function instrumentTests(root, options = {}) {
  const { apply = false, environment } = optionsFor(options, [
    "apply",
    "environment",
  ]);
  if (typeof apply !== "boolean") refuse();
  if (apply) await applyPolicy(root, environment, process.platform);
  else if (environment !== undefined)
    await environmentIdentity(root, environment);
  // Dry runs remain local, read-only and need no CI environment.
  const canonical = apply ? root : path.resolve(root);
  const planned = await planInstrumentation(
    canonical,
    loadTypeScript(canonical),
  );
  if (apply) {
    await applyPolicy(root, environment, process.platform);
    await writePlan(root, planned);
  }
  return metadataFor(planned, apply);
}

// This private capability is created only here from mkdtemp. It cannot be
// supplied through any export/options, and every fixture mutation is confined.
async function fixtureRegressionChecks(actualRoot, ts) {
  const owner = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "a8-instrumentor-")),
  );
  if (owner === actualRoot || actualRoot.startsWith(owner + path.sep)) refuse();
  const workspace = path.join(owner, "workspace");
  const sut = path.join(workspace, "sut");
  const results = {};
  const owned = async (target) => {
    const absolute = path.resolve(target);
    if (absolute === owner || !absolute.startsWith(owner + path.sep)) refuse();
    const parent = await fs.realpath(path.dirname(absolute));
    if (parent !== owner && !parent.startsWith(owner + path.sep)) refuse();
    return absolute;
  };
  const writeOwned = async (target, bytes) =>
    fs.writeFile(await owned(target), bytes);
  // Snapshot every non-git fixture entry, not just the two expected outputs.
  const snapshot = async () => {
    const entries = [];
    const walk = async (directory) => {
      for (const name of (await fs.readdir(directory)).sort()) {
        if (name === ".git" || name === "node_modules") continue;
        const full = path.join(directory, name);
        const relative = path.relative(sut, full);
        const stat = await fs.lstat(full);
        if (stat.isSymbolicLink())
          entries.push([relative, "link", await fs.readlink(full)]);
        else if (stat.isDirectory()) {
          entries.push([relative, "dir"]);
          await walk(full);
        } else entries.push([relative, sha(await fs.readFile(full))]);
      }
    };
    await walk(sut);
    return entries;
  };
  const rejectWithoutWrites = async (name, action) => {
    const before = JSON.stringify(await snapshot());
    let rejected = false;
    try {
      await action();
    } catch {
      rejected = true;
    }
    if (!rejected || before !== JSON.stringify(await snapshot())) refuse();
    results[name] = true;
  };
  try {
    await fs.mkdir(await owned(workspace));
    await owned(sut);
    // Local, network-free clone: real pinned commit and real git HEAD, no fake git.
    execFileSync(
      "git",
      ["clone", "--shared", "--no-checkout", "--", actualRoot, sut],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    git(sut, ["-c", "core.autocrlf=false", "checkout", "--detach", BASE]);
    await canonicalDirectory(sut);
    const environment = {
      CI: "true",
      GITHUB_WORKSPACE: workspace,
      A8_DIAG_SUT: sut,
    };
    // Linux exercises the actual public apply API; elsewhere only this lexical
    // closure simulates Linux, and still uses real git/files/guards/AST/writer.
    const applyFixture = async (
      root = sut,
      env = environment,
      options = {},
    ) => {
      await owned(root);
      if (process.platform === "linux")
        return instrumentTests(root, {
          apply: true,
          environment: env,
          ...options,
        });
      optionsFor(options, []);
      await applyPolicy(root, env, "linux");
      const planned = await planInstrumentation(root, ts);
      await applyPolicy(root, env, "linux");
      await writePlan(root, planned);
      return metadataFor(planned, true);
    };
    // Prove the bootstrap path works before the fixture has any dependencies.
    let dependencyPresent = false;
    try {
      await fs.lstat(path.join(sut, "node_modules"));
      dependencyPresent = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (dependencyPresent) refuse();
    if (process.platform === "linux") {
      const preflight = await preflightInstrumentation(sut, { environment });
      if (!preflight.preflightPassed || preflight.applied) refuse();
      results.realPublicPreflightPassed = true;
    } else {
      await owned(sut);
      await applyPolicy(sut, environment, "linux");
      const earlyPlan = await planInstrumentation(sut, null);
      if (earlyPlan.length !== 2) refuse();
    }
    results.preflightWithoutDependencies = true;
    if (process.platform === "linux") {
      // Resolve the existing parser, without installing or copying dependencies.
      const dependency = await fs.realpath(
        path.join(actualRoot, "node_modules"),
      );
      await fs.symlink(
        dependency,
        await owned(path.join(sut, "node_modules")),
        "dir",
      );
    }
    const originals = await Promise.all(
      FILES.map((relative) => fs.readFile(path.join(sut, relative))),
    );
    const originalSnapshot = await snapshot();
    await rejectWithoutWrites("missingSUTRejected", () =>
      applyFixture(sut, {
        CI: "true",
        GITHUB_WORKSPACE: workspace,
      }),
    );
    await rejectWithoutWrites("wrongSUTRejected", () =>
      applyFixture(sut, {
        ...environment,
        A8_DIAG_SUT: workspace,
      }),
    );
    await rejectWithoutWrites("wrongWorkspaceRejected", () =>
      applyFixture(sut, {
        ...environment,
        GITHUB_WORKSPACE: owner,
      }),
    );
    await rejectWithoutWrites("rootMismatchRejected", () =>
      applyFixture(workspace),
    );
    await rejectWithoutWrites("noncanonicalRootRejected", () =>
      applyFixture(sut + path.sep + "."),
    );
    const alias = path.join(workspace, "sut-alias");
    await fs.symlink(
      sut,
      await owned(alias),
      process.platform === "win32" ? "junction" : "dir",
    );
    await rejectWithoutWrites("symlinkRootRejected", () =>
      applyFixture(alias, {
        ...environment,
        A8_DIAG_SUT: alias,
      }),
    );
    await rejectWithoutWrites("unauthorizedFilesRejected", () =>
      applyFixture(sut, environment, {
        files: [FILES[0], "tests/e2e/unauthorized.spec.ts"],
      }),
    );
    for (const key of ["platformOverride", "baseline", "platform", "head"]) {
      await rejectWithoutWrites("unknownOverridesRejected", () =>
        instrumentTests(sut, { [key]: "ignored" }),
      );
    }
    // Corrupt the second file: the first must remain untouched on failed planning.
    const second = path.join(sut, FILES[1]);
    await writeOwned(
      second,
      Buffer.concat([originals[1], Buffer.from("\n// mismatch\n")]),
    );
    await rejectWithoutWrites("sourceHashMismatchRejected", () =>
      applyFixture(),
    );
    await writeOwned(second, originals[1]);
    let getterCalls = 0;
    const getterEnvironment = { ...environment };
    Object.defineProperty(getterEnvironment, "A8_DIAG_SUT", {
      get() {
        getterCalls++;
        return sut;
      },
      enumerable: true,
    });
    const proxyEnvironment = new Proxy(
      { ...environment },
      {
        get() {
          getterCalls++;
          refuse();
        },
        ownKeys() {
          getterCalls++;
          refuse();
        },
      },
    );
    const symbolEnvironment = {
      ...environment,
      [Symbol("invalid")]: "invalid",
    };
    for (const env of [
      undefined,
      null,
      [],
      Object.create(environment),
      getterEnvironment,
      proxyEnvironment,
      symbolEnvironment,
      { ...environment, CI: "false" },
      { ...environment, CI: true },
      { ...environment, A8_DIAG_SUT: sut + path.sep + "." },
      { ...environment, GITHUB_WORKSPACE: workspace + path.sep + ".." },
    ]) {
      // Explicit undefined must not activate applyFixture's default parameter.
      await rejectWithoutWrites("invalidEnvironmentNoWrites", async () => {
        if (process.platform === "linux")
          return instrumentTests(sut, { apply: true, environment: env });
        await applyPolicy(sut, env, "linux");
      });
    }
    if (getterCalls) refuse();
    if (process.platform !== "linux") {
      await rejectWithoutWrites("publicNonLinuxApplyRejected", () =>
        instrumentTests(sut, { apply: true, environment }),
      );
      await rejectWithoutWrites("publicNonLinuxPreflightRejected", () =>
        preflightInstrumentation(sut, { environment }),
      );
    }
    // Parent directory junctions/symlinks are rejected without writing through them.
    const parent = path.join(sut, "tests", "e2e");
    const moved = path.join(sut, "tests", "e2e-original");
    await fs.rename(await owned(parent), await owned(moved));
    await fs.symlink(
      moved,
      await owned(parent),
      process.platform === "win32" ? "junction" : "dir",
    );
    await rejectWithoutWrites("sourceParentSymlinkRejected", () =>
      applyFixture(),
    );
    await fs.unlink(await owned(parent));
    await fs.rename(await owned(moved), await owned(parent));
    // An actual successful write, not a reported boolean or dry-run stand-in.
    const applied = await applyFixture();
    if (!applied.applied || applied.files.length !== 2) refuse();
    results.validExplicitEnvironmentPropagation = true;
    const after = await snapshot();
    const originalMap = new Map(
      originalSnapshot.map((entry) => [entry[0], JSON.stringify(entry)]),
    );
    const changed = after.filter(
      (entry) => originalMap.get(entry[0]) !== JSON.stringify(entry),
    );
    if (
      after.length !== originalSnapshot.length ||
      changed.length !== 2 ||
      JSON.stringify(changed.map((entry) => entry[0]).sort()) !==
        JSON.stringify(
          FILES.map((relative) => relative.split("/").join(path.sep)).sort(),
        )
    )
      refuse();
    results.validEnvironmentOnlyTwoOverlayWrites = true;
    for (const [index, relative] of FILES.entries()) {
      const output = await fs.readFile(path.join(sut, relative), "utf8");
      const original = originals[index].toString("utf8");
      if (
        JSON.stringify(cases(ts, original)) !==
          JSON.stringify(cases(ts, output)) ||
        JSON.stringify(assertionFingerprint(ts, original)) !==
          JSON.stringify(assertionFingerprint(ts, output))
      )
        refuse();
      const proof = rewrite(
        original,
        index === 0 ? geometryChanges(original) : authChanges(original),
      ).proof;
      const restored = output.split("\n");
      for (const change of proof) {
        if (restored[change.number - 1] !== change.replacement) refuse();
        restored[change.number - 1] = change.expected;
      }
      const recovered = Buffer.from(restored.join("\n"));
      const pinned = git(sut, ["show", `${BASE}:${relative}`]);
      if (!recovered.equals(pinned) || !recovered.equals(originals[index]))
        refuse();
      await writeOwned(path.join(sut, relative), recovered);
    }
    if (JSON.stringify(originalSnapshot) !== JSON.stringify(await snapshot()))
      refuse();
    results.originalDeclarationsAndAssertionsPreserved = true;
    results.exactSourceRecoveryFromPinnedSHA = true;
    return {
      ...results,
      platformSimulation: process.platform !== "linux",
      realPublicLinuxApply: process.platform === "linux",
      ownedTempFixtureWrites: true,
    };
  } finally {
    // Never clean a worktree supplied by the caller. Verify the exact owned
    // mkdtemp root and canonical parent immediately before recursive removal.
    const realOwner = await fs.realpath(owner);
    const tempParent = await fs.realpath(os.tmpdir());
    if (
      realOwner !== owner ||
      path.dirname(owner) !== tempParent ||
      !path.basename(owner).startsWith("a8-instrumentor-") ||
      owner === actualRoot ||
      actualRoot.startsWith(owner + path.sep)
    )
      refuse();
    await fs.rm(owner, { recursive: true, force: true });
  }
}

export async function selfTestInstrumentation(root, options = {}) {
  const { environment } = optionsFor(options, ["environment"]);
  if (environment !== undefined) await environmentIdentity(root, environment);
  // Existing dry checks/probe checks stay browser-free. Actual apply regression
  // writes happen exclusively in the newly owned disposable local clone.
  const metadata = await instrumentTests(root);
  if (metadata.applied || metadata.files.length !== 2) refuse();
  await selfTestProbes();
  const actualRoot = await fs.realpath(root);
  const regressionChecks = await fixtureRegressionChecks(
    actualRoot,
    loadTypeScript(actualRoot),
  );
  return { ...metadata, browserFreeSelfTests: true, regressionChecks };
}
