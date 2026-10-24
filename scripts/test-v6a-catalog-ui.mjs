#!/usr/bin/env node
/** Opt-in, DB-free actual PublicCatalog App Router fixture. No installs or arbitrary targets.
 * node scripts/test-v6a-catalog-ui.mjs [--baseline]
 * Baseline is measurement only, NEVER final PASS. Every run preserves a fresh UUID.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
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
const ar = createRequire(path.join(app, "package.json")),
  rr = createRequire(path.join(root, "package.json"));
const id = randomUUID(),
  owner = `V6A-A2:${id}`,
  local = path.join(root, ".local");
const fixture = path.join(local, `v6a-a2-ui-${id}`);
const baseline = process.argv.length === 3 && process.argv[2] === "--baseline";
const env = {};
for (const k of [
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
])
  if (process.env[k] !== undefined) env[k] = process.env[k];
Object.assign(env, {
  NODE_ENV: "development",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_IGNORE_INCORRECT_LOCKFILE: "1",
  CI: "1",
});
let child,
  browser,
  origin,
  exit,
  interrupted = false,
  closing = false,
  cleanupPromise,
  phase = "setup";
const contexts = new Set(),
  errors = [],
  findings = [],
  measurements = [],
  checks = [];
const limitations = [
  "DB/auth/SMTP/providers/hosted and production full application NOT RUN",
  "Actual browser UI 200% zoom and assistive technology NOT RUN",
  "Dark class is post-hydration CSS only; theme integration/persistence NOT RUN",
];
const posix = (p) => p.replaceAll("\\", "/");
function running() {
  assert(!interrupted && !closing, "Fixture interrupted");
}
function loopback(value) {
  const u = new URL(value);
  assert.equal(u.protocol, "http:");
  assert.equal(u.hostname, "127.0.0.1");
  assert.equal(u.username + u.password, "");
  if (origin) assert.equal(u.origin, origin);
  return u;
}
async function owned(relative, content) {
  assert.equal(await readFile(path.join(fixture, "OWNER"), "utf8"), owner);
  const p = path.resolve(fixture, relative);
  assert(p.startsWith(fixture + path.sep));
  assert(!relative.split(/[\\/]/).includes("node_modules"));
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, content, { flag: "wx" });
}
function deadline(p, ms, label) {
  let timer;
  return Promise.race([
    p,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
async function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    closing = true;
    const cleanupErrors = [];
    for (const c of contexts)
      try {
        await c.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    contexts.clear();
    try {
      if (browser) await browser.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (child && exit === undefined) {
        assert(
          Number.isInteger(child.pid) && child.pid > 0,
          "Exact owned child PID required",
        );
        if (process.platform === "win32") {
          const k = spawn(
            path.join(env.SystemRoot || "C:\\Windows", "System32/taskkill.exe"),
            ["/PID", String(child.pid), "/T", "/F"],
            { env, stdio: "inherit", windowsHide: true },
          );
          await deadline(
            new Promise((resolve, reject) => {
              k.once("error", reject);
              k.once("exit", (code) =>
                code === 0 || exit !== undefined
                  ? resolve()
                  : reject(new Error("Owned PID cleanup failed")),
              );
            }),
            15000,
            "Cleanup budget",
          );
        } else {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch (error) {
            if (error.code !== "ESRCH") throw error;
          }
        }
        const exited = () =>
          new Promise((resolve) => {
            if (exit !== undefined) resolve();
            else child.once("exit", resolve);
          });
        try {
          await deadline(exited(), 15000, "Owned child exit budget");
        } catch (error) {
          if (process.platform === "win32" || exit !== undefined) throw error;
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch (killError) {
            if (killError.code !== "ESRCH") throw killError;
          }
          await deadline(exited(), 5000, "Owned forced child exit budget");
        }
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length)
      throw new AggregateError(cleanupErrors, "Owned fixture cleanup failed");
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
async function context(options = {}) {
  running();
  const c = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    ...options,
  });
  if (interrupted || closing) {
    await c.close();
    running();
  }
  contexts.add(c);
  c.setDefaultTimeout(15000);
  c.setDefaultNavigationTimeout(90000);
  await c.route("**/*", (route) => {
    const value = route.request().url();
    if (/^(data:|blob:|about:)/.test(value)) return route.continue();
    try {
      loopback(value);
    } catch {
      errors.push("Blocked non-owned request");
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  await c.addInitScript(() => {
    window.__v6aDocument = Array.from(
      crypto.getRandomValues(new Uint32Array(4)),
    ).join("-");
  });
  c.on("page", (p) => {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (
        m.type() === "error" &&
        /hydrat|did not match|server rendered/i.test(m.text())
      )
        errors.push(m.text());
    });
  });
  return c;
}
async function close(c) {
  await c.close();
  contexts.delete(c);
}
async function complete(p, locale, expected) {
  await p.waitForFunction(
    ({ locale, expected }) =>
      document.documentElement.dataset.v6aHydrated === locale &&
      document
        .querySelector("[data-v6a-query-complete]")
        ?.getAttribute("data-v6a-query-complete") === expected,
    { locale, expected: JSON.stringify(expected) },
  );
  assert.equal(await p.locator("html").getAttribute("lang"), locale);
}
async function open(p, locale, search = "") {
  const response = await p.goto(`${origin}/${locale}/works${search}`, {
    waitUntil: "load",
  });
  assert.equal(response.status(), 200);
  const u = new URL(p.url()),
    q = {};
  for (const [k, v] of u.searchParams) q[k] = v;
  await complete(p, locale, q);
  return response;
}
async function attempt(name, fn) {
  phase = name;
  try {
    await fn();
    checks.push({ name, status: "PASS" });
  } catch (e) {
    const f = { name, status: "FAIL", error: String(e.stack || e) };
    checks.push(f);
    await owned(
      `evidence/failure-${randomUUID()}.json`,
      JSON.stringify(f, null, 2),
    );
    if (!baseline) findings.push(f);
    else findings.push({ ...f, baselineOnly: true });
  }
}
try {
  assert(
    process.argv.length === 2 || baseline,
    "Only fixed --baseline accepted; no targets",
  );
  assert.equal((await realpath(root)).toLowerCase(), root.toLowerCase());
  assert.equal(ar("next/package.json").version, "16.4.0");
  assert.equal(rr("@playwright/test/package.json").version, "1.63.0");
  await mkdir(local, { recursive: true });
  assert.equal((await realpath(local)).toLowerCase(), local.toLowerCase());
  await mkdir(fixture);
  assert.equal((await realpath(fixture)).toLowerCase(), fixture.toLowerCase());
  await writeFile(path.join(fixture, "OWNER"), owner, { flag: "wx" });
  const sources = {};
  for (const relative of [
    "components/catalog/PublicCatalog.tsx",
    "components/catalog/catalog.module.css",
    "components/catalog/query.ts",
    "app/globals.css",
  ]) {
    const data = await readFile(path.join(app, "src", relative), "utf8");
    sources[relative] = createHash("sha256").update(data).digest("hex");
    if (relative === "app/globals.css") assert(!/@font-face|url\(/i.test(data));
  }
  const helperSource = await readFile(fileURLToPath(import.meta.url), "utf8");
  sources.helper = createHash("sha256").update(helperSource).digest("hex");
  await owned("evidence/helper-source.mjs", helperSource);
  await owned("evidence/source-hashes.json", JSON.stringify(sources, null, 2));
  await owned(
    "package.json",
    JSON.stringify({
      name: `v6a-a2-ui-${id}`,
      private: true,
      dependencies: {
        next: ar("next/package.json").version,
        react: ar("react/package.json").version,
        "react-dom": ar("react-dom/package.json").version,
      },
    }),
  );
  running();
  await symlink(
    path.join(app, "node_modules"),
    path.join(fixture, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  running();
  await owned(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["dom", "dom.iterable", "esnext"],
        strict: true,
        noEmit: true,
        jsx: "preserve",
        module: "esnext",
        moduleResolution: "bundler",
        esModuleInterop: true,
        skipLibCheck: true,
        baseUrl: ".",
        paths: {
          "@/*": [`${posix(path.relative(fixture, path.join(app, "src")))}/*`],
        },
      },
      include: ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    }),
  );
  await owned(
    "postcss.config.cjs",
    `module.exports={plugins:{[${JSON.stringify(ar.resolve("@tailwindcss/postcss"))}]:{}}};`,
  );
  await owned(
    "next.config.mjs",
    `import {realpathSync} from 'node:fs';import path from 'node:path';
const serverRoot=realpathSync(${JSON.stringify(path.join(app, "src/server"))});const databaseRoot=realpathSync(${JSON.stringify(path.join(root, "packages/database"))});const allowed=realpathSync(${JSON.stringify(path.join(root, "packages/database/src/catalog-types.ts"))});
const inside=(base,file)=>{const r=path.relative(base,file);return r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
export default {poweredByHeader:false,devIndicators:false,logging:{incomingRequests:false},transpilePackages:['@taleatlas/database'],outputFileTracingRoot:${JSON.stringify(root)},experimental:{externalDir:true},webpack(config){config.resolve.alias={...config.resolve.alias,'@':${JSON.stringify(path.join(app, "src"))}};config.plugins.push({apply(compiler){compiler.hooks.normalModuleFactory.tap('A2NoDatabase',factory=>{factory.hooks.beforeResolve.tap('A2NoDatabase',data=>{if(data&&/^(?:@\\/server\\/|@taleatlas\\/database(?:$|\\/(?!catalog-types$))|postgres(?:$|\\/)|drizzle-orm(?:$|\\/)|better-auth(?:$|\\/)|nodemailer(?:$|\\/))/.test(data.request))throw Error('A2 refuses server DB auth SMTP');});factory.hooks.afterResolve.tap('A2NoDatabase',data=>{const resource=data?.createData?.resource?.split('?')[0];if(!resource||!path.isAbsolute(resource))return;const file=realpathSync(resource);const parts=file.replaceAll(path.sep,'/').split('/');if(inside(serverRoot,file)||(inside(databaseRoot,file)&&file!==allowed)||parts.some((p,i)=>parts[i-1]==='node_modules'&&['postgres','drizzle-orm','better-auth','nodemailer'].includes(p)))throw Error('A2 refuses resolved server DB auth SMTP');});});}});return config;}};`,
  );
  await owned(
    "app/probe.tsx",
    `'use client';import {useEffect} from 'react';export default function Probe({locale}:{locale:string}){useEffect(()=>{document.documentElement.dataset.v6aHydrated=locale;},[locale]);return <span hidden data-v6a-probe/>;}`,
  );
  await owned(
    "app/[locale]/layout.tsx",
    `import ${JSON.stringify(posix(path.join(app, "src/app/globals.css")))};import Probe from '../probe';export default async function Layout({children,params}:{children:React.ReactNode;params:Promise<{locale:string}>}){const {locale}=await params;return <html lang={locale}><body><Probe locale={locale}/><main>{children}</main></body></html>;}`,
  );
  await owned(
    "app/api/ready/route.ts",
    `export const dynamic='force-dynamic';export function GET(){return new Response(${JSON.stringify(owner)});}`,
  );
  await owned(
    "app/[locale]/works/page.tsx",
    `import {cookies} from 'next/headers';import {PublicCatalog} from '@/components/catalog/PublicCatalog';import {publicCatalogQueryState} from '@/components/catalog/query';import type {AggregateWork,CatalogPage,PublicGenreOptions} from '@/features/catalog/contracts';import type {Locale} from '@/lib/i18n';export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{locale:Locale}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){const {locale}=await params;const raw=await searchParams;const {query,invalid}=publicCatalogQueryState(raw,locale);const c=await cookies();const populated=c.get('a2_population')?.value==='populated';const overflow=c.get('a2_genres')?.value==='overflow';const genres:PublicGenreOptions={overflow,items:overflow?[]:[{slug:'fantasy',nameEn:'Fantasy',nameVi:'Kỳ ảo'},{slug:'science-fiction',nameEn:'Science fiction',nameVi:'Khoa học viễn tưởng'}]};
const work:AggregateWork={id:'10000000-0000-4000-8000-000000000002',slug:'a2-synthetic',primaryTitle:'Synthetic catalog work',primaryTitleLanguage:'en',displayTitle:locale==='vi'?'Tác phẩm tổng hợp kiểm tra':'Synthetic catalog work',displayTitleLanguage:locale,format:'NOVEL',releaseStatus:'ONGOING',originalLanguage:'zh-Hant',country:null,publicationYear:2026,publicationLabel:null,source:{label:'Synthetic',citation:'DB-free presentation fixture'},titles:[],descriptions:[],editions:[],creators:[],genres:genres.items.slice(0,1),cover:null,identifiers:[],relations:[]};const result:CatalogPage<AggregateWork>={items:populated?[work]:[],total:populated?75:0,page:query.page,pageSize:query.pageSize};return <><PublicCatalog locale={locale} query={query} result={result} genreOptions={genres} invalidQuery={invalid}/><span hidden data-v6a-query-complete={JSON.stringify(raw)} data-v6a-parsed={JSON.stringify(query)}/></>;}`,
  );
  await owned(
    "public/images/work-placeholder.svg",
    await readFile(path.join(app, "public/images/work-placeholder.svg")),
  );
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  if (interrupted || closing) {
    await new Promise((r) => reservation.close(r));
    running();
  }
  const address = reservation.address();
  origin = `http://127.0.0.1:${address.port}`;
  loopback(origin);
  await new Promise((r) => reservation.close(r));
  running();
  child = spawn(
    process.execPath,
    [
      ar.resolve("next/dist/bin/next"),
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(address.port),
    ],
    {
      cwd: fixture,
      env,
      stdio: "inherit",
      windowsHide: true,
      detached: process.platform !== "win32",
    },
  );
  child.once("error", (e) => {
    exit = -1;
    errors.push(e.message);
  });
  child.once("exit", (code) => {
    exit = code ?? -1;
  });
  const startupEnd = Date.now() + 90000;
  let ready = false;
  while (Date.now() < startupEnd) {
    running();
    assert.equal(exit, undefined, "Owned server exited");
    try {
      const response = await fetch(`${origin}/api/ready`, {
        signal: AbortSignal.timeout(2000),
        redirect: "error",
      });
      if (response.ok && (await response.text()) === owner) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert(ready, "90s startup budget");
  running();
  const acquired = await rr("@playwright/test").chromium.launch({
    headless: true,
    env,
  });
  if (interrupted || closing) {
    await acquired.close();
    running();
  }
  browser = acquired;
  for (const locale of ["en", "vi"])
    for (const population of ["empty", "populated"])
      for (const genreState of ["normal", "overflow"])
        for (const width of baseline ? [1280, 1440] : [375, 768, 1280, 1440])
          for (const theme of baseline ? ["light"] : ["light", "dark"]) {
            const motion = theme === "dark" ? "reduce" : "no-preference";
            const name = `${baseline ? "before" : "after"}-${locale}-${population}-${genreState}-${width}-${theme}`;
            phase = name;
            const c = await context({
              viewport: { width, height: 1000 },
              colorScheme: theme,
              reducedMotion: motion,
            });
            await c.addCookies([
              { name: "a2_population", value: population, url: origin },
              { name: "a2_genres", value: genreState, url: origin },
            ]);
            const p = await c.newPage();
            await open(
              p,
              locale,
              genreState === "overflow" ? "?genre=missing-selected" : "",
            );
            await p.evaluate(
              (theme) =>
                document.documentElement.classList.toggle(
                  "dark",
                  theme === "dark",
                ),
              theme,
            );
            await p.evaluate(() => document.fonts.ready);
            const m = await p.evaluate(() => {
              const form = document.querySelector("form");
              const rect = (n) => {
                const r = n.getBoundingClientRect();
                return {
                  x: r.x,
                  y: r.y,
                  right: r.right,
                  bottom: r.bottom,
                  width: r.width,
                  height: r.height,
                };
              };
              const controls = [
                ...form.querySelectorAll(
                  'input:not([type="hidden"]),select,button,a',
                ),
              ];
              const wrappers = controls.map((n) =>
                n.parentElement === form
                  ? n
                  : n.closest("label")?.parentElement === form
                    ? n.closest("label")
                    : n.parentElement,
              );
              const formBox = rect(form);
              const formStyle = getComputedStyle(form);
              const content = {
                x:
                  formBox.x +
                  parseFloat(formStyle.borderLeftWidth) +
                  parseFloat(formStyle.paddingLeft),
                right:
                  formBox.right -
                  parseFloat(formStyle.borderRightWidth) -
                  parseFloat(formStyle.paddingRight),
                y:
                  formBox.y +
                  parseFloat(formStyle.borderTopWidth) +
                  parseFloat(formStyle.paddingTop),
                bottom:
                  formBox.bottom -
                  parseFloat(formStyle.borderBottomWidth) -
                  parseFloat(formStyle.paddingBottom),
              };
              content.width = content.right - content.x;
              const labelText = [...form.querySelectorAll("label")].flatMap(
                (label) =>
                  [...label.childNodes]
                    .filter(
                      (node) =>
                        node.nodeType === Node.TEXT_NODE &&
                        node.textContent.trim(),
                    )
                    .flatMap((node) => {
                      const range = document.createRange();
                      range.selectNodeContents(node);
                      return [...range.getClientRects()].map((r) => ({
                        x: r.x,
                        y: r.y,
                        right: r.right,
                        bottom: r.bottom,
                        width: r.width,
                        height: r.height,
                      }));
                    }),
              );
              return {
                form: formBox,
                content,
                labelText,
                controls: controls.map((n) => ({
                  name: n.name || n.tagName,
                  ...rect(n),
                })),
                wrappers: wrappers.map(rect),
                labels: [...form.querySelectorAll("label")].map(rect),
                helps: [...form.querySelectorAll("p[id]")].map((n) => ({
                  id: n.id,
                  outsideField:
                    !n.parentElement.querySelector("input,select,label"),
                  areaDirect: n.parentElement.parentElement === form,
                  area: rect(n.parentElement),
                  scroll: n.scrollWidth,
                  client: n.clientWidth,
                  ...rect(n),
                })),
                children: [...form.children]
                  .filter((n) => n.getBoundingClientRect().height > 0)
                  .map(rect),
                overflow:
                  document.documentElement.scrollWidth > innerWidth + 1 ||
                  document.body.scrollWidth > innerWidth + 1,
                scheme: getComputedStyle(document.documentElement).colorScheme,
                motion: matchMedia("(prefers-reduced-motion: reduce)").matches,
                scrollBehavior: getComputedStyle(document.documentElement)
                  .scrollBehavior,
                articles: document.querySelectorAll("article").length,
              };
            });
            const rows = [];
            for (let i = 0; i < m.controls.length; i++) {
              let row = rows.find(
                (row) => Math.abs(row.wrapperBottom - m.wrappers[i].bottom) < 2,
              );
              if (!row) {
                row = { wrapperBottom: m.wrappers[i].bottom, indices: [] };
                rows.push(row);
              }
              row.indices.push(i);
            }
            m.rows = rows.map((r) => ({
              ...r,
              bottomSpread:
                Math.max(...r.indices.map((i) => m.controls[i].bottom)) -
                Math.min(...r.indices.map((i) => m.controls[i].bottom)),
            }));
            m.name = name;
            measurements.push(m);
            await owned(`evidence/${name}.json`, JSON.stringify(m, null, 2));
            await owned(
              `evidence/${name}.png`,
              await p.screenshot({ fullPage: true }),
            );
            if (!baseline)
              await attempt(name, async () => {
                assert(!m.overflow, "No horizontal overflow");
                assert.equal(m.articles, population === "populated" ? 1 : 0);
                assert.equal(m.scheme, theme);
                assert.equal(m.motion, motion === "reduce");
                if (motion === "reduce") assert.equal(m.scrollBehavior, "auto");
                for (const box of [...m.controls, ...m.labels, ...m.helps]) {
                  assert(
                    box.x >= m.form.x - 1 &&
                      box.right <= m.form.right + 1 &&
                      box.y >= m.form.y - 1 &&
                      box.bottom <= m.form.bottom + 1,
                    "Form containment",
                  );
                  assert(box.width > 0 && box.height > 0);
                }
                for (const h of m.helps) {
                  assert(
                    h.outsideField && h.areaDirect,
                    "Help outside field wrappers in direct form help area",
                  );
                  assert(
                    Math.abs(h.area.x - m.content.x) <= 1 &&
                      Math.abs(h.area.right - m.content.right) <= 1 &&
                      Math.abs(h.area.width - m.content.width) <= 1,
                    "Full-width help area",
                  );
                  assert(
                    Math.abs(h.width - h.area.width) <= 1,
                    "Paragraph fills help area",
                  );
                  assert(
                    h.y >= Math.max(...m.controls.map((c) => c.bottom)) - 1,
                    "Help follows controls/actions",
                  );
                  assert(h.scroll <= h.client + 1, "Help text contained");
                }
                for (const r of m.rows)
                  assert(
                    r.bottomSpread <= 1,
                    "Control bottoms within row aligned",
                  );
                if (width === 375) {
                  for (let i = 0; i < 5; i++) {
                    assert(
                      Math.abs(m.controls[i].x - m.content.x) <= 1 &&
                        Math.abs(m.controls[i].right - m.content.right) <= 1 &&
                        Math.abs(m.controls[i].width - m.content.width) <= 1,
                      "Mobile fields fill form inner width",
                    );
                    if (i)
                      assert(
                        m.wrappers[i].y >= m.wrappers[i - 1].bottom,
                        "Mobile field stack order",
                      );
                  }
                }
                for (let i = 0; i < m.children.length; i++)
                  for (let j = i + 1; j < m.children.length; j++) {
                    const a = m.children[i],
                      b = m.children[j];
                    assert(
                      !(
                        Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
                        Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1
                      ),
                      "No direct field/action/help overlaps",
                    );
                  }
                for (const label of m.labelText) {
                  assert(
                    label.x >= m.content.x - 1 &&
                      label.right <= m.content.right + 1 &&
                      label.y >= m.content.y - 1 &&
                      label.bottom <= m.content.bottom + 1,
                    "Label text inside form content",
                  );
                  for (const control of m.controls)
                    assert(
                      !(
                        Math.min(label.right, control.right) -
                          Math.max(label.x, control.x) >
                          1 &&
                        Math.min(label.bottom, control.bottom) -
                          Math.max(label.y, control.y) >
                          1
                      ),
                      "No label-text/control overlaps within wrapped fields",
                    );
                }
                for (let i = 0; i < m.controls.length; i++)
                  for (let j = i + 1; j < m.controls.length; j++) {
                    const a = m.controls[i],
                      b = m.controls[j];
                    assert(
                      !(
                        Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
                        Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1
                      ),
                      "No control overlaps",
                    );
                  }
                assert.equal(
                  await p
                    .locator("#catalog-original-language")
                    .getAttribute("aria-describedby"),
                  "catalog-original-language-help",
                );
                assert.equal(
                  await p.locator("#catalog-genre").isDisabled(),
                  genreState === "overflow",
                );
                if (genreState === "overflow") {
                  assert.equal(
                    await p
                      .locator("#catalog-genre")
                      .getAttribute("aria-describedby"),
                    "catalog-genre-capacity",
                  );
                  assert.equal(
                    await p
                      .locator("input[type=hidden][name=genre]")
                      .inputValue(),
                    "missing-selected",
                  );
                }
              });
            await close(c);
          }
  for (const locale of ["en", "vi"]) {
    const c = await context();
    await c.addCookies([
      { name: "a2_population", value: "populated", url: origin },
    ]);
    await attempt(`keyboard-traversal-${locale}`, async () => {
      const p = await c.newPage();
      await open(p, locale);
      const controls = p
        .locator("form")
        .locator("input:not([type=hidden]),select,button,a");
      for (let index = 0; index < 7; index++) {
        await p.keyboard.press("Tab");
        assert(
          await controls
            .nth(index)
            .evaluate((n) => n === document.activeElement),
          "Native tab order through all five filters and actions",
        );
        assert(
          await controls.nth(index).evaluate((n) => {
            const s = getComputedStyle(n);
            return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
          }),
          "Visible native keyboard focus",
        );
        if (index === 1 || index === 2 || index === 4) {
          await p.keyboard.press("Space");
          await p.keyboard.press("ArrowDown");
          await p.keyboard.press("Enter");
        } else if (index === 0) await p.keyboard.type("Keyboard");
        else if (index === 3) await p.keyboard.type("zh-Hant");
      }
      assert.equal(await p.locator("[name=q]").inputValue(), "Keyboard");
      assert.equal(await p.locator("[name=format]").inputValue(), "MANGA");
      assert.equal(await p.locator("[name=genre]").inputValue(), "fantasy");
      assert.equal(
        await p.locator("[name=originalLanguage]").inputValue(),
        "zh-Hant",
      );
      assert.equal(
        await p.locator("[name=releaseStatus]").inputValue(),
        "UNKNOWN",
      );
      await owned(
        `evidence/keyboard-${locale}.png`,
        await p.screenshot({ fullPage: true }),
      );
    });
    await attempt(`native-get-${locale}`, async () => {
      const p = await c.newPage();
      await open(p, locale, "?page=2&pageSize=7");
      const form = p.locator("form");
      assert.equal(await form.getAttribute("method"), "get");
      assert.equal(await form.getAttribute("action"), `/${locale}/works`);
      await form.locator("[name=q]").fill("Synthetic");
      await form.locator("[name=format]").selectOption("NOVEL");
      await form.locator("[name=genre]").selectOption("fantasy");
      await form.locator("[name=originalLanguage]").fill("zh-Hant");
      await form.locator("[name=releaseStatus]").selectOption("ONGOING");
      await form.locator("button").focus();
      await p.keyboard.press("Tab");
      assert(
        await form.locator("a").evaluate((n) => n === document.activeElement),
      );
      await p.keyboard.press("Shift+Tab");
      assert(
        await form
          .locator("button")
          .evaluate((n) => n === document.activeElement),
      );
      assert(
        await form
          .locator("button")
          .evaluate((n) => getComputedStyle(n).outlineStyle !== "none"),
      );
      const [response] = await Promise.all([
        p.waitForNavigation({ waitUntil: "load" }),
        p.keyboard.press("Enter"),
      ]);
      assert.equal(response.request().method(), "GET");
      assert.equal(response.status(), 200);
      const expected = {
        q: "Synthetic",
        format: "NOVEL",
        genre: "fantasy",
        originalLanguage: "zh-Hant",
        releaseStatus: "ONGOING",
        pageSize: "7",
      };
      await complete(p, locale, expected);
      assert.deepEqual(
        Object.fromEntries(new URL(p.url()).searchParams),
        expected,
      );
      for (const [k, v] of Object.entries(expected))
        assert.equal(await form.locator(`[name=${k}]`).inputValue(), v);
      const next = p.locator("nav a").last();
      const href = new URL(await next.getAttribute("href"), origin);
      for (const [k, v] of Object.entries(expected))
        assert.equal(href.searchParams.get(k), v);
      assert.equal(href.searchParams.get("page"), "2");
      await owned(
        `evidence/native-get-${locale}.png`,
        await p.screenshot({ fullPage: true }),
      );
    });
    await attempt(`missing-case-overflow-${locale}`, async () => {
      const p = await c.newPage();
      await open(
        p,
        locale,
        "?genre=missing-selected&originalLanguage=ZH-hant&pageSize=9",
      );
      assert.equal(
        await p.locator("#catalog-genre").inputValue(),
        "missing-selected",
      );
      assert.match(
        await p.locator("#catalog-genre option:checked").textContent(),
        /missing-selected/,
      );
      assert.equal(
        await p.locator("#catalog-original-language").inputValue(),
        "ZH-hant",
      );
      await c.addCookies([
        { name: "a2_genres", value: "overflow", url: origin },
      ]);
      await open(
        p,
        locale,
        "?genre=missing-selected&originalLanguage=ZH-hant&pageSize=9",
      );
      assert(await p.locator("#catalog-genre").isDisabled());
      const [response] = await Promise.all([
        p.waitForNavigation({ waitUntil: "load" }),
        p.locator("form button").click(),
      ]);
      assert.equal(response.request().method(), "GET");
      await complete(p, locale, {
        q: "",
        format: "",
        genre: "missing-selected",
        originalLanguage: "ZH-hant",
        releaseStatus: "",
        pageSize: "9",
      });
      assert.equal(
        await p.locator("input[name=genre]").inputValue(),
        "missing-selected",
      );
      await c.addCookies([{ name: "a2_genres", value: "normal", url: origin }]);
    });
    for (const kind of ["applied", "unsent"])
      await attempt(`reset-${kind}-${locale}`, async () => {
        const p = await c.newPage();
        const applied =
          "?q=Synthetic&format=NOVEL&genre=fantasy&originalLanguage=zh-Hant&releaseStatus=ONGOING&pageSize=7";
        await open(p, locale, kind === "applied" ? applied : "");
        await p.evaluate(() => {
          window.__v6aResetForm = document.querySelector("form");
          window.__v6aResetControls = [
            ...document.querySelector("form").elements,
          ];
        });
        const snapshot = () =>
          p.evaluate(() => {
            const form = document.querySelector("form");
            return {
              url: location.href,
              formData: Object.fromEntries(new FormData(form)),
              documentToken: window.__v6aDocument,
              sameForm: window.__v6aResetForm === form,
              controls: [...form.elements].map((control, index) => ({
                tag: control.tagName,
                name: control.name,
                type: control.type,
                value: control.value,
                defaultValue: control.defaultValue,
                disabled: control.disabled,
                sameNode: window.__v6aResetControls?.[index] === control,
              })),
            };
          });
        const initial = await snapshot();
        if (kind === "unsent") {
          await p.locator("[name=q]").fill("Unsent");
          await p.locator("[name=format]").selectOption("NOVEL");
          await p.locator("[name=genre]").selectOption("fantasy");
          await p.locator("[name=originalLanguage]").fill("zh-Hant");
          await p.locator("[name=releaseStatus]").selectOption("ONGOING");
        }
        const draft = await snapshot();
        const expectedURL = `${origin}/${locale}/works`;
        const expectedDefaults = {
          q: "",
          format: "",
          genre: "",
          originalLanguage: "",
          releaseStatus: "",
          pageSize: "20",
        };
        await owned(
          `evidence/reset-${kind}-${locale}-before.json`,
          JSON.stringify(
            { initial, draft, expectedURL, expectedDefaults },
            null,
            2,
          ),
        );
        const before = await p.evaluate(() => window.__v6aDocument);
        const link = p.locator("form a");
        assert.equal(await link.getAttribute("href"), `/${locale}/works`);
        await link.focus();
        let native = false;
        p.on("request", (request) => {
          if (
            request.isNavigationRequest() &&
            request.resourceType() === "document" &&
            request.method() === "GET"
          )
            native = true;
        });
        // Register before activation: a bare same-URL predicate is already true.
        const [response] = await Promise.all([
          p.waitForNavigation({ waitUntil: "load" }),
          p.keyboard.press("Enter"),
        ]);
        assert(response, "Reset must complete an actual document response");
        const navigation = {
          url: response.url(),
          status: response.status(),
          method: response.request().method(),
          resourceType: response.request().resourceType(),
          isNavigationRequest: response.request().isNavigationRequest(),
        };
        assert.equal(navigation.method, "GET");
        assert.equal(navigation.status, 200);
        assert.equal(navigation.resourceType, "document");
        assert(navigation.isNavigationRequest);
        const destination = new URL(p.url());
        assert.equal(destination.origin, origin);
        assert.equal(destination.pathname, `/${locale}/works`);
        assert.equal(destination.search, "");
        assert.equal(destination.hash, "");
        assert.equal(p.url(), expectedURL);
        await complete(p, locale, {});
        const actual = {};
        for (const k of [
          "q",
          "format",
          "genre",
          "originalLanguage",
          "releaseStatus",
          "pageSize",
        ])
          actual[k] = await p.locator(`[name=${k}]`).inputValue();
        const observation = {
          kind,
          locale,
          action: "Focus actual Reset link and activate Enter",
          initial,
          draft,
          expectedURL,
          expectedDefaults,
          navigation,
          after: await snapshot(),
          native,
          newDocument:
            before !== (await p.evaluate(() => window.__v6aDocument)),
          actual,
          queryComplete: await p
            .locator("[data-v6a-query-complete]")
            .getAttribute("data-v6a-query-complete"),
        };
        await owned(
          `evidence/reset-${kind}-${locale}.json`,
          JSON.stringify(observation, null, 2),
        );
        await owned(
          `evidence/reset-${kind}-${locale}.png`,
          await p.screenshot({ fullPage: true }),
        );
        assert(native, "Reset must use native GET document navigation");
        assert(
          observation.newDocument,
          "Reset must commit a new document token",
        );
        assert.deepEqual(
          actual,
          {
            q: "",
            format: "",
            genre: "",
            originalLanguage: "",
            releaseStatus: "",
            pageSize: "20",
          },
          "Reset controls must match committed default query; baseline stale reset is separate from A2 regression",
        );
        if (kind === "unsent")
          assert(
            native && observation.newDocument,
            "Bare URL unsent reset must perform actual native GET document navigation",
          );
      });
    await close(c);
  }
  assert.equal(measurements.length, baseline ? 16 : 64);
  assert.deepEqual(errors, [], "No browser/hydration/network errors");
  await cleanup();
  assert(!interrupted);
  const status = baseline
    ? "BASELINE_MEASUREMENT_ONLY"
    : findings.length
      ? "FAIL"
      : "PASS";
  await owned(
    "evidence/result.json",
    JSON.stringify(
      {
        status,
        id,
        phase,
        geometry: measurements.length,
        checks,
        findings,
        errors,
        retries: 0,
        budgets: { startup: 90000, hydration: 15000 },
        cleanup: "owned process exited",
        limitations,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      status,
      fixture,
      geometry: measurements.length,
      checks: checks.length,
      failures: findings.length,
      cleanup: "owned process exited",
    }),
  );
  if (!baseline && findings.length) process.exitCode = 1;
} catch (error) {
  process.exitCode = 1;
  try {
    await owned(
      `evidence/fatal-${randomUUID()}.json`,
      JSON.stringify(
        {
          status: "FAIL",
          phase,
          error: String(error.stack || error),
          checks,
          errors,
          limitations,
        },
        null,
        2,
      ),
    );
  } catch {}
  try {
    await cleanup();
  } catch (e) {
    console.error("Owned cleanup failed", String(e));
  }
  console.error(
    JSON.stringify({
      status: "FAIL",
      phase,
      fixture,
      error: String(error.stack || error),
    }),
  );
}
