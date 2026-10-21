#!/usr/bin/env node
/**
 * Opt-in V6A A1 DB-free Next App Router/Chromium presentation evidence.
 * Usage: node scripts/test-v6a-library-ui.mjs (no CLI targets/options).
 * Requires the already-installed frozen dependencies and Chromium; never installs.
 * Preserves a fresh .local/v6a-a1-ui-UUID fixture, JSON metrics and PNG evidence.
 * Actual page-source adapter changes ONLY its guard/service import declarations.
 * Synthetic authority/data are NOT real-account, SQL or production acceptance.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  writeFile,
  readFile,
  realpath,
  symlink,
} from "node:fs/promises";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "apps/web");
const appRequire = createRequire(path.join(app, "package.json"));
const rootRequire = createRequire(path.join(root, "package.json"));
const id = randomUUID();
const local = path.join(root, ".local");
const fixture = path.join(local, `v6a-a1-ui-${id}`);
const owner = `V6A-A1:${id}`;
const expected = {
  ssr: 2,
  hydration: 2,
  clientNavigation: 2,
  refresh: 2,
  geometry: 64,
  keyboard: 2,
};
const passed = Object.fromEntries(Object.keys(expected).map((key) => [key, 0]));
const limitations = [
  "actual browser UI 200% zoom (no CSS/DPR/CDP substitute)",
  "SQL, real authentication, providers, hosted acceptance and production-mode full-application browser verification",
  "theme persistence, manual contrast and assistive technology",
];
let browser,
  child,
  gateServer,
  phase = "setup",
  closing = false,
  cleanupPromise;
let nextOrigin, gateOrigin, childExit;
let interrupted = false;
function checkRunning() {
  if (interrupted || closing) throw new Error("Owned fixture interrupted");
}
const contexts = new Set();
const gates = new Map();
const errors = [];
const safeEnv = {};
// Allowlist, not a spread: DB/auth/SMTP/V4/operator/proxy/NODE_OPTIONS values
// are never read, copied or printed. These are OS/installed-browser facts only.
for (const key of [
  "PATH",
  "Path",
  "SystemRoot",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USERPROFILE",
  "HOME",
  "LOCALAPPDATA",
  "APPDATA",
  "LANG",
  "LC_ALL",
  "PLAYWRIGHT_BROWSERS_PATH",
]) {
  if (process.env[key] !== undefined) safeEnv[key] = process.env[key];
}
Object.assign(safeEnv, {
  NODE_ENV: "development",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_IGNORE_INCORRECT_LOCKFILE: "1",
  CI: "1",
});

function posix(value) {
  return value.replaceAll("\\", "/");
}
function loopback(value, allowed) {
  const url = new URL(value);
  assert.equal(
    url.protocol,
    "http:",
    "Only test-owned HTTP loopback is allowed",
  );
  assert.equal(url.hostname, "127.0.0.1", "Non-loopback target refused");
  assert.equal(url.username + url.password, "", "Credentials refused");
  if (allowed)
    assert(allowed.includes(url.origin), "Unowned loopback target refused");
  return url;
}
function deadline(promise, milliseconds, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Bounded wait exceeded: ${label}`)),
        milliseconds,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}
async function ownedWrite(relative, content) {
  assert.equal(await readFile(path.join(fixture, "OWNER"), "utf8"), owner);
  const target = path.resolve(fixture, relative);
  assert(target.startsWith(fixture + path.sep), "Fixture containment refused");
  assert(
    !relative.split(/[\\/]/).includes("node_modules"),
    "Dependency writes refused",
  );
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, { flag: "wx" }); // Never overwrite an artifact.
}
async function listen(server) {
  checkRunning();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("close", () => {
      if (interrupted || closing)
        reject(new Error("Owned listener interrupted"));
    });
    server.listen(0, "127.0.0.1", resolve);
  });
  if (interrupted || closing) {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    checkRunning();
  }
  const address = server.address();
  assert(address && typeof address !== "string");
  return loopback(`http://127.0.0.1:${address.port}`).origin;
}
function makeGate() {
  const key = randomUUID();
  let arrived;
  const arrival = new Promise((resolve) => {
    arrived = resolve;
  });
  const entry = { key, arrival, arrived, released: false, pending: new Set() };
  gates.set(key, entry);
  return entry;
}
function release(entry) {
  entry.released = true;
  for (const response of entry.pending) response.end("released");
  entry.pending.clear();
}
async function setGate(context, entry) {
  await context.addCookies([
    { name: "v6a_gate", value: entry.key, url: nextOrigin, sameSite: "Lax" },
  ]);
}
async function ready() {
  const end = Date.now() + 120_000;
  while (Date.now() < end) {
    checkRunning();
    if (childExit !== undefined)
      throw new Error("Owned Next exited during startup");
    try {
      const response = await fetch(`${nextOrigin}/api/ready`, {
        signal: AbortSignal.timeout(2_000),
        redirect: "error",
      });
      if (response.ok && (await response.text()) === owner) return;
    } catch {
      /* Startup-only polling; loading tests use explicit controlled gates. */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Owned Next startup deadline exceeded");
}
async function newContext(options = {}) {
  checkRunning();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ...options,
  });
  if (interrupted || closing) {
    await context.close();
    checkRunning();
  }
  contexts.add(context);
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(90_000);
  await context.route("**/*", async (route) => {
    const value = route.request().url();
    if (/^(data:|blob:|about:)/.test(value)) return route.continue();
    try {
      loopback(value, [nextOrigin]);
    } catch {
      errors.push("External or unowned browser request blocked");
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    // getRandomValues also works in non-secure about:blank init contexts.
    window.__v6aDocument = Array.from(
      crypto.getRandomValues(new Uint32Array(4)),
      (value) => value.toString(16).padStart(8, "0"),
    ).join("");
    window.__v6aStatuses = [];
    const collect = () => {
      for (const node of document.querySelectorAll('p[role="status"][lang]')) {
        window.__v6aStatuses.push({
          text: node.textContent,
          lang: node.lang,
          html: document.documentElement.lang,
        });
      }
    };
    new MutationObserver(collect).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["lang"],
    });
  });
  context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /hydrat|did not match|server rendered/i.test(message.text())
      )
        errors.push("Hydration console error");
    });
  });
  return context;
}
async function closeContext(context) {
  await context.close();
  contexts.delete(context);
}
async function hydration(page, locale) {
  try {
    await page.waitForFunction(
      (locale) => document.documentElement.dataset.v6aHydrated === locale,
      locale,
    );
  } catch (error) {
    // Preserve diagnostics without extending the 15s assertion or retrying it.
    // Only this owned synthetic fixture is inspected; no cookies/headers/data.
    let state = { diagnostic: "Renderer unavailable after hydration deadline" };
    try {
      state = await deadline(
        page.evaluate(() => ({
          readyState: document.readyState,
          visibility: document.visibilityState,
          locale: document.documentElement.lang,
          hydrated: document.documentElement.dataset.v6aHydrated ?? null,
          probePresent: Boolean(document.querySelector("[data-v6a-probe]")),
          scripts: document.scripts.length,
          status:
            document.querySelector('p[role="status"][lang]')?.textContent ??
            null,
        })),
        5_000,
        "synthetic hydration diagnostics",
      );
    } catch {
      /* The original test failure remains authoritative. */
    }
    await ownedWrite(
      `evidence/hydration-timeout-${randomUUID()}.json`,
      JSON.stringify({ phase, expectedLocale: locale, state }, null, 2),
    );
    throw error;
  }
}
async function status(page, locale, text) {
  const node = page.locator('p[role="status"][lang]');
  await node.waitFor({ state: "visible" });
  assert.equal(await node.count(), 1);
  assert.equal(await node.textContent(), text);
  assert.equal(await node.getAttribute("lang"), locale);
  assert.equal(await page.locator("html").getAttribute("lang"), locale);
}
async function noLanguageFlash(page, locale, text) {
  const observations = await page.evaluate(() => window.__v6aStatuses);
  assert(observations.length > 0, "No observed real loading status");
  for (const observation of observations)
    assert.deepEqual(observation, { text, lang: locale, html: locale });
}
async function complete(page, entry, locale, copy) {
  release(entry);
  await page.getByRole("heading", { name: copy.title, exact: true }).waitFor();
  await hydration(page, locale);
  await page.locator('p[role="status"][lang]').waitFor({ state: "detached" });
}
async function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    closing = true;
    for (const entry of gates.values()) release(entry);
    for (const context of contexts) await context.close().catch(() => {});
    contexts.clear();
    let cleanupError;
    try {
      if (browser) await browser.close();
    } catch (error) {
      cleanupError = error;
    }
    try {
      if (child && childExit === undefined) {
        assert(
          Number.isInteger(child.pid) && child.pid > 0,
          "Owned child PID required",
        );
        if (process.platform === "win32") {
          // Exact spawn PID only, never a process-name/port-wide kill.
          const killer = spawn(
            path.join(
              safeEnv.SystemRoot || "C:\\Windows",
              "System32/taskkill.exe",
            ),
            ["/PID", String(child.pid), "/T", "/F"],
            { env: safeEnv, stdio: "inherit", windowsHide: true },
          );
          await deadline(
            new Promise((resolve, reject) => {
              killer.once("error", reject);
              killer.once("exit", (code) =>
                code === 0 || childExit !== undefined
                  ? resolve()
                  : reject(new Error("Owned process tree termination failed")),
              );
            }),
            15_000,
            "owned Windows child termination",
          );
        } else {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch (error) {
            if (error.code !== "ESRCH") throw error;
          }
        }
        try {
          await deadline(
            new Promise((resolve) => {
              if (childExit !== undefined) return resolve();
              child.once("exit", resolve);
            }),
            15_000,
            "owned Next exit",
          );
        } catch (error) {
          if (process.platform !== "win32" && childExit === undefined) {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch (killError) {
              if (killError.code !== "ESRCH") throw killError;
            }
            await deadline(
              new Promise((resolve) => {
                if (childExit !== undefined) resolve();
                else child.once("exit", resolve);
              }),
              5_000,
              "owned forced exit",
            );
          } else throw error;
        }
      }
    } catch (error) {
      cleanupError ??= error;
    }
    if (gateServer) {
      gateServer.closeAllConnections();
      await new Promise((resolve) => gateServer.close(resolve));
    }
    if (cleanupError) throw cleanupError;
  })();
  return cleanupPromise;
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    interrupted = true;
    process.exitCode = 1;
    cleanup().catch(() => {
      process.exitCode = 1;
    });
  });

try {
  assert.equal(
    process.argv.length,
    2,
    "No CLI targets/options accepted; owned loopback only",
  );
  assert.equal(
    (await realpath(root)).toLowerCase(),
    root.toLowerCase(),
    "Physical worktree required",
  );
  const nextPackage = appRequire("next/package.json");
  assert.equal(nextPackage.version, "16.4.0", "Expected frozen Next version");
  const { chromium } = rootRequire("@playwright/test");
  assert.equal(rootRequire("@playwright/test/package.json").version, "1.63.0");
  await mkdir(local, { recursive: true });
  assert.equal(
    (await realpath(local)).toLowerCase(),
    local.toLowerCase(),
    "Physical artifact parent required",
  );
  await mkdir(fixture); // Refuse an existing UUID directory; never delete anything.
  assert.equal((await realpath(fixture)).toLowerCase(), fixture.toLowerCase());
  await writeFile(path.join(fixture, "OWNER"), owner, { flag: "wx" });
  await ownedWrite(
    "package.json",
    JSON.stringify(
      {
        name: `v6a-a1-ui-${id}`,
        private: true,
        dependencies: {
          next: nextPackage.version,
          react: appRequire("react/package.json").version,
          "react-dom": appRequire("react-dom/package.json").version,
        },
      },
      null,
      2,
    ),
  );
  // An owned new resolution link, never a dependency copy/install/edit.
  await symlink(
    path.join(app, "node_modules"),
    path.join(fixture, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await ownedWrite(
    "tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["dom", "dom.iterable", "esnext"],
          strict: true,
          noEmit: true,
          jsx: "preserve",
          module: "esnext",
          moduleResolution: "bundler",
          esModuleInterop: true,
          resolveJsonModule: true,
          skipLibCheck: true,
          allowJs: true,
          baseUrl: ".",
          // Relative targets avoid drive-letter ambiguity in Next's paths plugin.
          paths: {
            "@/*": [
              `${posix(path.relative(fixture, path.join(app, "src")))}/*`,
            ],
          },
        },
        include: ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        exclude: ["node_modules"],
      },
      null,
      2,
    ),
  );
  await ownedWrite(
    "postcss.config.cjs",
    `module.exports = { plugins: { [${JSON.stringify(appRequire.resolve("@tailwindcss/postcss"))}]: {} } };\n`,
  );
  await ownedWrite(
    "next.config.mjs",
    `import { realpathSync } from 'node:fs';
import path from 'node:path';
const serverRoot = realpathSync(${JSON.stringify(path.join(app, "src/server"))});
const databaseRoot = realpathSync(${JSON.stringify(path.join(root, "packages/database"))});
const allowedLibraryTypes = realpathSync(${JSON.stringify(path.join(root, "packages/database/src/library-types.ts"))});
const inside = (base, file) => { const relative = path.relative(base, file); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
export default {
  poweredByHeader: false, devIndicators: false,
  logging: { incomingRequests: false },
  transpilePackages: ['@taleatlas/database'],
  outputFileTracingRoot: ${JSON.stringify(root)},
  experimental: { externalDir: true },
  webpack(config) {
    // Resolve actual source explicitly for this external fixture on Windows;
    // do not rely solely on Next's tsconfig paths plugin for drive-letter paths.
    config.resolve.alias = { ...config.resolve.alias, '@': ${JSON.stringify(path.join(app, "src"))} };
    // Fail closed if the adapter grows a server/DB/auth/SMTP dependency.
    config.plugins.push({ apply(compiler) {
      compiler.hooks.normalModuleFactory.tap('V6aNoDatabase', factory => {
        factory.hooks.beforeResolve.tap('V6aNoDatabase', data => {
          if (data && /^(?:@\\/server\\/|@taleatlas\\/database(?:$|\\/(?!library-types$))|postgres(?:$|\\/)|drizzle-orm(?:$|\\/)|better-auth(?:$|\\/)|nodemailer(?:$|\\/))/.test(data.request))
            throw new Error('V6A fixture refuses server, database, auth or SMTP imports');
        });
        factory.hooks.afterResolve.tap('V6aNoDatabase', data => {
          const resource = data?.createData?.resource?.split('?')[0];
          if (!resource || !path.isAbsolute(resource)) return;
          const file = realpathSync(resource);
          const normalized = file.replaceAll(path.sep, '/');
          if (inside(serverRoot, file) ||
              (inside(databaseRoot, file) && path.relative(allowedLibraryTypes, file) !== '') ||
              normalized.split('/').some((part, index, parts) => parts[index - 1] === 'node_modules' && ['postgres', 'drizzle-orm', 'better-auth', 'nodemailer'].includes(part)))
            throw new Error('V6A fixture refuses resolved server, database, auth or SMTP resources');
        });
      });
    }});
    return config;
  }
};\n`,
  );
  const source = await readFile(
    path.join(app, "src/app/[locale]/library/page.tsx"),
    "utf8",
  );
  let adapted = source;
  for (const [original, replacement] of [
    [
      'import { libraryGuard } from "@/server/library/guard";',
      'import { libraryGuard } from "./fixture-stubs";',
    ],
    [
      'import { listLibraryEntries } from "@/server/library/service";',
      'import { listLibraryEntries } from "./fixture-stubs";',
    ],
  ]) {
    assert.equal(
      adapted.split(original).length - 1,
      1,
      "Page server import replacement must match exactly once",
    );
    adapted = adapted.replace(original, replacement);
  }
  assert(!adapted.includes("@/server/"), "Unexpected remaining server import");
  await ownedWrite("app/[locale]/library/actual-page.tsx", adapted);
  await ownedWrite(
    "app/[locale]/library/fixture-stubs.ts",
    `// SYNTHETIC AUTHORITY/DATA; no account, DB or provider access.
import { cookies } from 'next/headers';
export async function libraryGuard(..._args: unknown[]) { return new Headers({ 'x-v6a-synthetic': 'true' }); }
export async function listLibraryEntries(input: { page: number; locale: string; status?: string; favorite?: boolean }, ..._args: unknown[]) {
  const populated = (await cookies()).get('v6a_population')?.value === 'populated';
  const items = populated ? [{ id: '10000000-0000-4000-8000-000000000001',
    status: input.status || 'READING', favorite: input.favorite ?? true,
    work: { available: true, slug: 'v6a-synthetic', displayTitle: input.locale === 'vi'
      ? 'Tác phẩm tổng hợp — Thư viện kiểm tra' : 'Synthetic work — Library test', cover: null } }] : [];
  return { items, page: input.page, pageSize: 50, total: items.length, hasNext: false };
}\n`,
  );
  await ownedWrite(
    "app/[locale]/library/loading.tsx",
    `export { default } from ${JSON.stringify(posix(path.join(app, "src/app/[locale]/library/loading")))};\n`,
  );
  await ownedWrite(
    "app/probe.tsx",
    `"use client";
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
export default function Probe() {
  const { locale } = useParams();
  useEffect(() => { document.documentElement.dataset.v6aHydrated = String(locale); }, [locale]);
  return <span hidden data-v6a-probe="outside-library-suspense" />;
}\n`,
  );
  await ownedWrite(
    "app/[locale]/layout.tsx",
    `import ${JSON.stringify(posix(path.join(app, "src/app/globals.css")))};
import { isLocale } from '@/lib/i18n';
import { notFound } from 'next/navigation';
import Probe from '../probe';
export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <html lang={locale} data-scroll-behavior="smooth"><body><Probe /><main>{children}</main></body></html>;
}\n`,
  );
  await ownedWrite(
    "app/[locale]/page.tsx",
    `import Link from 'next/link';
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <Link prefetch={false} href={'/' + locale + '/library'} data-v6a-link>Open synthetic Library</Link>;
}\n`,
  );
  await ownedWrite(
    "app/api/ready/route.ts",
    `export const dynamic = 'force-dynamic';\nexport function GET() { return new Response(${JSON.stringify(owner)}); }\n`,
  );
  // Actual globals currently use system fonts (no @font-face/url assets).
  const globals = await readFile(path.join(app, "src/app/globals.css"), "utf8");
  assert(
    !/@font-face|url\(/i.test(globals),
    "New CSS assets require explicit safe fixture copying",
  );
  await ownedWrite(
    "public/images/work-placeholder.svg",
    await readFile(path.join(app, "public/images/work-placeholder.svg")),
  );
  await ownedWrite(
    "app/api/copy/route.ts",
    `import { dictionary } from '@/lib/i18n';\nimport { libraryCopy, statuses } from '@/components/library/copy';\nexport function GET() { return Response.json({ loading: { en: dictionary('en').routeLoading, vi: dictionary('vi').routeLoading }, libraryCopy, statuses }); }\n`,
  );
  gateServer = createServer((request, response) => {
    if (closing || request.socket.remoteAddress !== "127.0.0.1") {
      response.writeHead(403).end();
      return;
    }
    let url;
    try {
      url = loopback(`http://${request.headers.host}${request.url}`, [
        gateOrigin,
      ]);
    } catch {
      response.writeHead(403).end();
      return;
    }
    const entry = gates.get(url.pathname.slice(1));
    if (request.method !== "GET" || !entry || url.search) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Cache-Control", "no-store");
    entry.arrived();
    if (entry.released) {
      response.end("released");
      return;
    }
    entry.pending.add(response);
    const timer = setTimeout(() => {
      entry.pending.delete(response);
      response.writeHead(504).end("gate deadline");
    }, 120_000);
    response.once("close", () => {
      clearTimeout(timer);
      entry.pending.delete(response);
    });
  });
  gateOrigin = await listen(gateServer);
  await ownedWrite(
    "app/[locale]/library/page.tsx",
    `import { cookies } from 'next/headers';
import ActualPage from './actual-page';
import styles from '@/components/library/library.module.css';
export { metadata } from './actual-page';
export const dynamic = 'force-dynamic';
export default async function Page(props: Parameters<typeof ActualPage>[0]) {
  const key = (await cookies()).get('v6a_gate')?.value;
  if (!key || !/^[a-f0-9-]{36}$/.test(key)) throw new Error('Owned test gate required');
  const response = await fetch(${JSON.stringify(gateOrigin)} + '/' + key, { cache: 'no-store', signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error('Owned test gate failed');
  await response.text();
  const rendered = await ActualPage(props);
  const completedQuery = JSON.stringify(await props.searchParams);
  return <>{rendered}
    <span hidden data-v6a-query-complete={completedQuery} />
    <aside aria-label="Representative CSS regression probes">
      <p>Representative unrelated global form and EntryControls-style div; not actual entry actions.</p>
      <form data-v6a-global-form><label>Probe<input disabled /></label></form>
      <div className={styles.controls} data-v6a-div-controls><label>Probe A<select disabled><option>Probe</option></select></label><label>Probe B<select disabled><option>Probe</option></select></label></div>
    </aside></>;
}\n`,
  );
  // Reserve then release an OS-selected loopback port. Owner response verifies
  // identity after bind, so a port race cannot silently target another service.
  const reservation = createServer();
  nextOrigin = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  checkRunning();
  child = spawn(
    process.execPath,
    [
      appRequire.resolve("next/dist/bin/next"),
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      new URL(nextOrigin).port,
    ],
    {
      cwd: fixture,
      env: safeEnv,
      stdio: "inherit",
      windowsHide: true,
      detached: process.platform !== "win32",
    },
  );
  child.once("error", (error) => {
    childExit = -1;
    errors.push(error.message);
  });
  child.once("exit", (code) => {
    childExit = code ?? -1;
  });
  await ready();
  checkRunning();
  const acquiredBrowser = await chromium.launch({
    headless: true,
    env: safeEnv,
  });
  if (interrupted || closing) {
    await acquiredBrowser.close();
    checkRunning();
  }
  browser = acquiredBrowser;
  const copyResponse = await fetch(`${nextOrigin}/api/copy`, {
    signal: AbortSignal.timeout(90_000),
    redirect: "error",
  });
  assert(copyResponse.ok);
  const { loading, libraryCopy, statuses } = await copyResponse.json();
  for (const locale of ["en", "vi"]) {
    const copy = libraryCopy[locale];
    phase = `ssr-${locale}`;
    const noJS = await newContext({ javaScriptEnabled: false });
    const noJSPage = await noJS.newPage();
    const ssrGate = makeGate();
    await setGate(noJS, ssrGate);
    const response = await noJSPage.goto(`${nextOrigin}/${locale}/library`, {
      waitUntil: "commit",
    });
    assert.equal(response.status(), 200);
    await deadline(ssrGate.arrival, 90_000, "SSR gate arrival");
    await status(noJSPage, locale, loading[locale]);
    assert.equal(ssrGate.released, false);
    assert.equal(
      await noJSPage.locator("html").getAttribute("data-v6a-hydrated"),
      null,
    );
    passed.ssr++;
    release(ssrGate);
    // With JS disabled React cannot swap streamed hidden content into view.
    // Assert actual streamed page arrival, not a fabricated no-JS completion UI.
    await noJSPage.locator("section h1").waitFor({ state: "attached" });
    assert.equal(
      await noJSPage.locator("section h1").textContent(),
      copy.title,
    );
    await closeContext(noJS);

    phase = `hydration-${locale}`;
    const context = await newContext();
    const page = await context.newPage();
    const initial = makeGate();
    await setGate(context, initial);
    await page.goto(`${nextOrigin}/${locale}/library`, { waitUntil: "commit" });
    await deadline(initial.arrival, 90_000, "hydration gate arrival");
    await status(page, locale, loading[locale]);
    await hydration(page, locale); // Outside the still-pending loading boundary.
    assert.equal(initial.released, false);
    await noLanguageFlash(page, locale, loading[locale]);
    passed.hydration++;
    await complete(page, initial, locale, copy);

    phase = `refresh-${locale}`;
    const oldDocument = await page.evaluate(() => window.__v6aDocument);
    const refresh = makeGate();
    await setGate(context, refresh);
    await page.reload({ waitUntil: "commit" });
    await deadline(refresh.arrival, 90_000, "refresh gate arrival");
    await status(page, locale, loading[locale]);
    await hydration(page, locale);
    assert.notEqual(
      await page.evaluate(() => window.__v6aDocument),
      oldDocument,
    );
    assert.equal(refresh.released, false);
    await noLanguageFlash(page, locale, loading[locale]);
    passed.refresh++;
    await complete(page, refresh, locale, copy);
    await closeContext(context);

    phase = `client-navigation-${locale}`;
    // Fresh context prevents a previous completed Library Router Cache entry
    // from bypassing the controlled pending client-navigation request.
    const linkContext = await newContext();
    const linkPage = await linkContext.newPage();
    await linkPage.goto(`${nextOrigin}/${locale}`, { waitUntil: "load" });
    await hydration(linkPage, locale);
    const documentBeforeLink = await linkPage.evaluate(
      () => window.__v6aDocument,
    );
    const navigation = makeGate();
    await setGate(linkContext, navigation);
    let rsc = false;
    linkPage.on("request", (request) => {
      if (
        new URL(request.url()).pathname === `/${locale}/library` &&
        request.headers().rsc === "1"
      )
        rsc = true;
    });
    await linkPage.locator("[data-v6a-link]").click(); // Actual prefetch=false Next Link.
    await deadline(navigation.arrival, 90_000, "client Link gate arrival");
    await status(linkPage, locale, loading[locale]);
    assert.equal(
      await linkPage.evaluate(() => window.__v6aDocument),
      documentBeforeLink,
    );
    assert.equal(rsc, true, "Actual RSC client navigation required");
    assert.equal(navigation.released, false);
    await noLanguageFlash(linkPage, locale, loading[locale]);
    passed.clientNavigation++;
    await complete(linkPage, navigation, locale, copy);
    await closeContext(linkContext);

    phase = `keyboard-${locale}`;
    const keysContext = await newContext();
    const keysPage = await keysContext.newPage();
    const keyGate = makeGate();
    release(keyGate);
    await setGate(keysContext, keyGate);
    await keysPage.goto(`${nextOrigin}/${locale}/library`, {
      waitUntil: "load",
    });
    await hydration(keysPage, locale);
    const form = keysPage.locator("section form");
    const selects = form.locator("select");
    const focused = async (locator) =>
      assert(await locator.evaluate((node) => node === document.activeElement));
    const chooseNext = async () => {
      await keysPage.keyboard.press("Space");
      await keysPage.keyboard.press("ArrowDown");
      await keysPage.keyboard.press("Enter");
    };
    await keysPage.keyboard.press("Tab");
    await focused(selects.nth(0));
    await chooseNext();
    assert.equal(await selects.nth(0).inputValue(), statuses[0]);
    await keysPage.keyboard.press("Tab");
    await focused(selects.nth(1));
    await chooseNext();
    assert.equal(await selects.nth(1).inputValue(), "true");
    await keysPage.keyboard.press("Tab");
    await focused(selects.nth(2));
    await chooseNext();
    assert.equal(await selects.nth(2).inputValue(), "ADDED_DESC");
    await keysPage.keyboard.press("Tab");
    await focused(form.getByRole("button", { name: copy.apply, exact: true }));
    assert(
      await keysPage.evaluate(() => {
        const style = getComputedStyle(document.activeElement);
        return (
          style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0
        );
      }),
      "Visible keyboard focus required",
    );
    await Promise.all([
      keysPage.waitForURL(
        (url) => url.searchParams.get("sort") === "ADDED_DESC",
      ),
      keysPage.keyboard.press("Enter"),
    ]);
    await keysPage
      .getByRole("heading", { name: copy.title, exact: true })
      .waitFor();
    const applied = new URL(keysPage.url());
    assert.equal(applied.searchParams.get("status"), statuses[0]);
    assert.equal(applied.searchParams.get("favorite"), "true");
    // A new document/tab avoids reload's platform-dependent focus restoration.
    // All control selection and reset activation still use real keyboard events.
    const resetPage = await keysContext.newPage();
    await resetPage.goto(keysPage.url(), { waitUntil: "load" });
    await hydration(resetPage, locale);
    const resetForm = resetPage.locator("section form");
    const resetSelects = resetForm.locator("select");
    assert.equal(await resetSelects.nth(0).inputValue(), statuses[0]);
    assert.equal(await resetSelects.nth(1).inputValue(), "true");
    assert.equal(await resetSelects.nth(2).inputValue(), "ADDED_DESC");
    assert.deepEqual(
      JSON.parse(
        await resetPage
          .locator("[data-v6a-query-complete]")
          .getAttribute("data-v6a-query-complete"),
      ),
      { status: statuses[0], favorite: "true", sort: "ADDED_DESC" },
    );
    for (let index = 0; index < 5; index++)
      await resetPage.keyboard.press("Tab");
    await focused(
      resetForm.getByRole("link", { name: copy.reset, exact: true }),
    );
    await Promise.all([
      resetPage.waitForURL((url) => !url.search),
      resetPage.keyboard.press("Enter"),
    ]);
    await resetPage
      .getByRole("heading", { name: copy.title, exact: true })
      .waitFor();
    // URL/history changes before the RSC model commits. This test-only server
    // marker is emitted AFTER the actual page render; do not mistake the old
    // heading/form for a completed reset. Keep the original control assertions.
    await resetPage.waitForFunction(
      () =>
        document
          .querySelector("[data-v6a-query-complete]")
          ?.getAttribute("data-v6a-query-complete") === "{}",
    );
    phase = `keyboard-${locale}-reset-model-committed`;
    assert.equal(await resetSelects.nth(0).inputValue(), "");
    assert.equal(await resetSelects.nth(1).inputValue(), "");
    assert.equal(await resetSelects.nth(2).inputValue(), "UPDATED_DESC");

    // Bare-URL unsent edits are a distinct reset contract: a same-URL client
    // Link can be a no-op, so prove an actual native GET document navigation.
    phase = `keyboard-${locale}-unsent-reset`;
    const unsentPage = await keysContext.newPage();
    const bareURL = `${nextOrigin}/${locale}/library`;
    await unsentPage.goto(bareURL, { waitUntil: "load" });
    await hydration(unsentPage, locale);
    const unsentForm = unsentPage.locator("section form");
    const unsentSelects = unsentForm.locator("select");
    assert.equal(await unsentSelects.nth(0).inputValue(), "");
    assert.equal(await unsentSelects.nth(1).inputValue(), "");
    assert.equal(await unsentSelects.nth(2).inputValue(), "UPDATED_DESC");
    assert.equal(
      await unsentPage
        .locator("[data-v6a-query-complete]")
        .getAttribute("data-v6a-query-complete"),
      "{}",
    );
    const beforeUnsentReset = await unsentPage.evaluate(
      () => window.__v6aDocument,
    );
    for (let index = 0; index < 3; index++) {
      await unsentPage.keyboard.press("Tab");
      await focused(unsentSelects.nth(index));
      await unsentPage.keyboard.press("Space");
      await unsentPage.keyboard.press("ArrowDown");
      await unsentPage.keyboard.press("Enter");
    }
    assert.equal(await unsentSelects.nth(0).inputValue(), statuses[0]);
    assert.equal(await unsentSelects.nth(1).inputValue(), "true");
    assert.equal(await unsentSelects.nth(2).inputValue(), "ADDED_DESC");
    assert.equal(
      unsentPage.url(),
      bareURL,
      "Unsubmitted edits must not change URL",
    );
    await unsentPage.keyboard.press("Tab");
    await focused(
      unsentForm.getByRole("button", { name: copy.apply, exact: true }),
    );
    await unsentPage.keyboard.press("Tab");
    await focused(
      unsentForm.getByRole("link", { name: copy.reset, exact: true }),
    );
    const [unsentNavigation] = await Promise.all([
      unsentPage.waitForNavigation({ waitUntil: "load" }),
      unsentPage.keyboard.press("Enter"),
    ]);
    assert(unsentNavigation, "Same-URL reset must perform a native navigation");
    assert.equal(unsentNavigation.status(), 200);
    assert.equal(unsentNavigation.request().method(), "GET");
    await hydration(unsentPage, locale);
    await unsentPage.waitForFunction(
      () =>
        document
          .querySelector("[data-v6a-query-complete]")
          ?.getAttribute("data-v6a-query-complete") === "{}",
    );
    assert.notEqual(
      await unsentPage.evaluate(() => window.__v6aDocument),
      beforeUnsentReset,
      "Same-URL reset must replace the document, not just retain the old model",
    );
    assert.equal(unsentPage.url(), bareURL);
    phase = `keyboard-${locale}-unsent-reset-model-committed`;
    assert.equal(await unsentSelects.nth(0).inputValue(), "");
    assert.equal(await unsentSelects.nth(1).inputValue(), "");
    assert.equal(await unsentSelects.nth(2).inputValue(), "UPDATED_DESC");
    passed.keyboard++;
    await closeContext(keysContext);

    for (const population of ["empty", "populated"])
      for (const width of [375, 768, 1280, 1440])
        for (const theme of ["light", "dark"])
          for (const motion of ["no-preference", "reduce"]) {
            phase = `geometry-${locale}-${population}-${width}-${theme}-${motion}`;
            const geometryContext = await newContext({
              viewport: { width, height: 1000 },
              colorScheme: theme,
              reducedMotion: motion,
            });
            await geometryContext.addCookies([
              { name: "v6a_population", value: population, url: nextOrigin },
            ]);
            const geometryGate = makeGate();
            release(geometryGate);
            await setGate(geometryContext, geometryGate);
            const geometryPage = await geometryContext.newPage();
            await geometryPage.goto(`${nextOrigin}/${locale}/library`, {
              waitUntil: "load",
            });
            await hydration(geometryPage, locale);
            // This is a CSS-token probe, not next-themes integration. Apply its
            // class only after hydration; mutating SSR HTML beforehand creates
            // a fixture-induced mismatch. Keep the zero-hydration-errors gate.
            await geometryPage.evaluate((theme) => {
              document.documentElement.classList.toggle(
                "dark",
                theme === "dark",
              );
            }, theme);
            await geometryPage
              .getByRole("heading", { name: copy.title, exact: true })
              .waitFor();
            await geometryPage.evaluate(async () => {
              await document.fonts.ready;
            });
            assert.equal(
              await geometryPage.locator("section ul > li").count(),
              population === "populated" ? 1 : 0,
            );
            if (population === "empty")
              await geometryPage
                .getByText(copy.empty, { exact: true })
                .waitFor();
            const geometry = await geometryPage.evaluate(() => {
              const form = document.querySelector("section form");
              const rect = (node) => {
                const r = node.getBoundingClientRect();
                return {
                  x: r.x,
                  y: r.y,
                  right: r.right,
                  bottom: r.bottom,
                  width: r.width,
                  height: r.height,
                };
              };
              const div = document.querySelector("[data-v6a-div-controls]");
              return {
                form: rect(form),
                children: [...form.children].map(rect),
                selects: [...form.querySelectorAll("select")].map(rect),
                direction: getComputedStyle(form).flexDirection,
                wrap: getComputedStyle(form).flexWrap,
                globalDirection: getComputedStyle(
                  document.querySelector("[data-v6a-global-form]"),
                ).flexDirection,
                div: {
                  direction: getComputedStyle(div).flexDirection,
                  wrap: getComputedStyle(div).flexWrap,
                  gap: getComputedStyle(div).gap,
                  align: getComputedStyle(div).alignItems,
                  labels: [...div.querySelectorAll("label")].map(
                    (node) => getComputedStyle(node).flexBasis,
                  ),
                },
                overflow:
                  document.documentElement.scrollWidth > innerWidth + 1 ||
                  document.body.scrollWidth > innerWidth + 1,
                scheme: getComputedStyle(document.documentElement).colorScheme,
                background: getComputedStyle(document.body).backgroundColor,
                motion: matchMedia("(prefers-reduced-motion: reduce)").matches,
                scrollBehavior: getComputedStyle(document.documentElement)
                  .scrollBehavior,
                lang: document.documentElement.lang,
              };
            });
            assert.equal(geometry.direction, "row");
            assert.equal(geometry.wrap, "wrap");
            assert.equal(geometry.globalDirection, "column");
            assert.deepEqual(geometry.div, {
              direction: "row",
              wrap: "wrap",
              gap: "16px",
              align: width <= 640 ? "stretch" : "end",
              labels: width <= 640 ? ["100%", "100%"] : ["auto", "auto"],
            });
            assert.equal(geometry.overflow, false);
            assert.equal(geometry.lang, locale);
            assert.equal(geometry.scheme, theme);
            assert.equal(geometry.motion, motion === "reduce");
            assert.equal(
              geometry.scrollBehavior,
              motion === "reduce" ? "auto" : "smooth",
            );
            assert.equal(
              geometry.background,
              theme === "dark" ? "rgb(23, 30, 25)" : "rgb(247, 245, 237)",
            );
            for (const box of [...geometry.children, ...geometry.selects]) {
              assert(
                box.x >= geometry.form.x - 1 &&
                  box.right <= geometry.form.right + 1,
                "Filter containment",
              );
              assert(
                box.width > 0 && box.height > 0,
                "Visible filter geometry",
              );
            }
            if (width === 375) {
              for (let index = 1; index < 3; index++)
                assert(
                  geometry.children[index].y >=
                    geometry.children[index - 1].bottom,
                  "Natural mobile label stack",
                );
            } else if (width >= 1280) {
              const bottoms = geometry.children
                .slice(0, 4)
                .map((box) => box.bottom);
              assert(
                Math.max(...bottoms) - Math.min(...bottoms) <= 1,
                "Desktop filters/button bottom alignment",
              );
              for (let index = 1; index < 4; index++)
                assert(
                  geometry.children[index].x > geometry.children[index - 1].x,
                  "Desktop horizontal filters",
                );
            }
            const filename = `evidence/${locale}-${population}-${width}-${theme}-${motion}`;
            await ownedWrite(
              `${filename}.json`,
              JSON.stringify(geometry, null, 2),
            );
            await ownedWrite(
              `${filename}.png`,
              await geometryPage.screenshot({ fullPage: true }),
            );
            passed.geometry++;
            await closeContext(geometryContext);
          }
  }
  assert.deepEqual(passed, expected);
  assert.deepEqual(errors, [], "Browser/network/hydration errors");
  phase = "cleanup";
  await cleanup();
  assert(!closing || process.exitCode !== 1, "Interrupted run cannot pass");
  await ownedWrite(
    "evidence/result.json",
    JSON.stringify(
      { status: "PASS", passed, expected, retries: 0, limitations },
      null,
      2,
    ),
  );
  console.log(
    `PASS ssr=${passed.ssr}/2 hydration=${passed.hydration}/2 clientNavigation=${passed.clientNavigation}/2 refresh=${passed.refresh}/2 geometry=${passed.geometry}/64 keyboard=${passed.keyboard}/2 retries=0`,
  );
  for (const limitation of limitations) console.log(`NOTRUN ${limitation}`);
} catch (error) {
  process.exitCode = 1;
  try {
    await ownedWrite(
      "evidence/failure.json",
      JSON.stringify(
        {
          status: "FAIL",
          phase,
          passed,
          expected,
          errors,
          error: String(error.stack || error),
          retries: 0,
          limitations,
        },
        null,
        2,
      ),
    );
  } catch {
    /* Setup may have refused ownership. */
  }
  try {
    await cleanup();
  } catch {
    console.error("FAIL owned-process cleanup");
  }
  console.error(
    `FAIL ssr=${passed.ssr}/2 hydration=${passed.hydration}/2 clientNavigation=${passed.clientNavigation}/2 refresh=${passed.refresh}/2 geometry=${passed.geometry}/64 keyboard=${passed.keyboard}/2 retries=0`,
  );
  for (const limitation of limitations) console.log(`NOTRUN ${limitation}`);
}
