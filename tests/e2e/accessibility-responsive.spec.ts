import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../helpers/browser-test";
import {
  PROFILES,
  parseColor,
  composite,
  contrastRatio,
  classifyContrast,
  validateRect,
  classifyOverflow,
  classifyHorizontalBounds,
} from "../helpers/accessibility-evidence";
import { publicCopy } from "../../apps/web/src/components/catalog/query";
import { dictionary } from "../../apps/web/src/lib/i18n";
import { libraryCopy } from "../../apps/web/src/components/library/copy";
import { requestDictionary } from "../../apps/web/src/lib/request-i18n";
import { discoveryCopy } from "../../apps/web/src/features/catalog/discovery";
import {
  verifiedBrowserAccount,
  type BrowserAccount,
} from "../helpers/verified-browser-account";

// Source cases, not a certification: real browser execution is a separate receipt.
// NOT RUN: browser-UI 200% zoom and manual AT announcements/contrast review.
// NOT_VERIFIED: forced header pending/error/recovery (no intercepted responses),
// complex compositing, decorative borders and disabled-control contrast.
// Measurements stay private; only fixed titles/codes and boolean/numeric checks
// are introduced here. The existing browser-test collectors remain unchanged.
type Profile = (typeof PROFILES)[number];
type Locale = "en" | "vi";
async function bounded(code: string, action: () => Promise<void>) {
  try {
    await action();
  } catch {
    throw new Error(code);
  }
}
async function visible(target: Locator, code: string) {
  await expect.poll(() => target.isVisible(), { message: code }).toBe(true);
}
async function settled(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    );
  });
}
async function theme(page: Page, value: "light" | "dark" | "system") {
  const select = page.locator("footer .theme-picker select");
  await expect.poll(() => select.isEnabled(), { message: "A8-T01" }).toBe(true);
  await select.selectOption(value);
  await expect
    .poll(() => select.inputValue(), { message: "A8-T02" })
    .toBe(value);
  // next-themes temporarily injects transition:none. Wait for its removal rather
  // than reading a first frame; reduced-motion legitimately still computes 0s.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            !Array.from(document.querySelectorAll("style")).some(
              (s) =>
                /transition\s*:\s*none\s*!important/.test(
                  s.textContent ?? "",
                ) && !s.textContent?.includes("prefers-reduced-motion"),
            ),
        ),
      { message: "A8-T03" },
    )
    .toBe(true);
  await settled(page);
}
async function configure(page: Page, profile: Profile, path: string) {
  await page.setViewportSize({ width: profile.width, height: profile.height });
  const response = await page.goto(path);
  expect(response?.status() === 200, "A8-N01").toBe(true);
  await theme(page, profile.theme);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.lang), {
      message: "A8-N02",
    })
    .toBe(profile.locale);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          document.documentElement.classList.contains("dark"),
        ),
      { message: "A8-N03" },
    )
    .toBe(profile.theme === "dark");
}
async function geometry(page: Page) {
  const measured = await page.evaluate(() => {
    const visible = (el: Element) =>
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== "hidden";
    const collect = (selector: string) =>
      Array.from(document.querySelectorAll(selector)).filter(visible);
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const essentials = collect(
      "header nav, header nav a, header nav button, main h1, main label, main input:not([type=hidden]), main select, main textarea, main button, main summary, footer select",
    );
    const controls = collect(
      "main input:not([type=hidden]), main select, main textarea, main button, main summary",
    );
    const labels = collect("main label");
    // Essentials are independent of representative card/root sampling. Hitting
    // this safety cap is a measurement limitation, never an app-layout verdict.
    const complete =
      essentials.length <= 128 &&
      controls.length <= 128 &&
      labels.length <= 128;
    const sampledControls = controls.slice(0, 128);
    let peerOverlap = false;
    for (let i = 0; i < sampledControls.length; i++) {
      for (let j = i + 1; j < sampledControls.length; j++) {
        const a = sampledControls[i]!,
          b = sampledControls[j]!;
        if (a.contains(b) || b.contains(a)) continue;
        const ar = rect(a),
          br = rect(b);
        if (
          Math.min(ar.right, br.right) - Math.max(ar.left, br.left) > 1 &&
          Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top) > 1
        )
          peerOverlap = true;
      }
    }
    let labelTextFits = true,
      labelFragments = 0,
      labelLimit = false;
    for (const label of labels.slice(0, 128)) {
      const box = rect(label);
      const nodes = Array.from(label.childNodes);
      if (nodes.length > 32) {
        labelLimit = true;
        continue;
      }
      for (const node of nodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const text = node.textContent ?? "";
        if (!text.trim()) continue;
        const range = document.createRange();
        range.setStart(node, text.length - text.trimStart().length);
        range.setEnd(node, text.trimEnd().length);
        const fragments = Array.from(range.getClientRects());
        if (fragments.length > 32) {
          labelLimit = true;
          continue;
        }
        for (const fragment of fragments) {
          if (fragment.width <= 0 || fragment.height <= 0) continue;
          labelFragments++;
          if (
            fragment.left < box.left - 1 ||
            fragment.right > box.right + 1 ||
            fragment.top < box.top - 1 ||
            fragment.bottom > box.bottom + 1
          )
            labelTextFits = false;
        }
      }
    }
    return {
      width: document.documentElement.clientWidth,
      scroll: Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth,
      ),
      complete,
      labelLimit,
      labelFragments,
      labelTextFits,
      peerOverlap,
      // Explicitly representative: first eight visible direct section roots and
      // first eight article/settings cards, not every record or every container.
      rects: [
        ...essentials.slice(0, 128),
        ...collect("main"),
        ...collect("main > section").slice(0, 8),
        ...collect("main article, main .settings-card").slice(0, 8),
      ].map(rect),
      names: sampledControls
        .filter((el) => el.matches("input, select, textarea"))
        .every((el) => {
          const control = el as HTMLInputElement;
          const ids = (control.getAttribute("aria-labelledby") ?? "")
            .trim()
            .split(/\s+/)
            .filter(Boolean);
          return Boolean(
            Array.from(control.labels ?? []).some((label) =>
              label.textContent?.trim(),
            ) ||
            control.getAttribute("aria-label")?.trim() ||
            (ids.length > 0 &&
              ids.every((id) =>
                document.getElementById(id)?.textContent?.trim(),
              )),
          );
        }),
    };
  });
  expect(
    measured.complete && !measured.labelLimit,
    "A8-MEASUREMENT-LIMIT-NOT-VERIFIED",
  ).toBe(true);
  expect(
    classifyOverflow(measured.scroll, measured.width) === "NONE",
    "A8-G01",
  ).toBe(true);
  expect(measured.rects.length > 0, "A8-G02").toBe(true);
  for (const rect of measured.rects) {
    const valid = validateRect(rect);
    expect(
      classifyHorizontalBounds(valid, measured.width) === "WITHIN",
      "A8-G03",
    ).toBe(true);
    expect(valid.bottom > valid.top && valid.right > valid.left, "A8-G04").toBe(
      true,
    );
  }
  expect(measured.peerOverlap, "A8-G05").toBe(false);
  expect(measured.labelTextFits, "A8-L02").toBe(true);
  // No labels/direct text fragments is inapplicable, not a claimed wrap check.
  expect(measured.names, "A8-L01").toBe(true);
  return measured.labelFragments > 0
    ? ("MEASURED" as const)
    : ("NOT_VERIFIED" as const);
}

// Conservative sRGB-only observation. A group's opacity is NOT foreground
// alpha. General group opacity/filter/image/blend cases stay NOT_VERIFIED.
// The one supported group is a leaf primary hover, composited on a known solid
// parent: render text+button first, then composite each against that parent.
async function contrast(target: Locator, outline = false) {
  const sample = await target.evaluate((el, focus) => {
    const chain = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      const s = getComputedStyle(node);
      chain.push({
        bg: s.backgroundColor,
        image: s.backgroundImage,
        opacity: Number(s.opacity),
        filter: s.filter,
        backdrop: s.backdropFilter,
        blend: s.mixBlendMode,
        isolation: s.isolation,
      });
    }
    const s = getComputedStyle(el);
    return {
      chain,
      color: focus ? s.outlineColor : s.color,
      size: parseFloat(s.fontSize),
      weight: Number(s.fontWeight),
      ring: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2,
      leafPrimary:
        el.matches(".button.primary") &&
        Array.from(el.children).every(
          (child) => child.getAttribute("aria-hidden") === "true",
        ),
      disabled: el.matches(":disabled, [aria-disabled=true]"),
    };
  }, outline);
  if (sample.disabled) return "NOT_VERIFIED" as const;
  const unsupported = sample.chain.some(
    (s, i) =>
      s.image !== "none" ||
      s.filter !== "none" ||
      s.backdrop !== "none" ||
      s.blend !== "normal" ||
      (s.opacity !== 1 && !(i === 0 && sample.leafPrimary && !outline)),
  );
  if (unsupported) return "NOT_VERIFIED" as const;
  let colors;
  let foreground;
  try {
    colors = sample.chain.map((s) => parseColor(s.bg));
    foreground = parseColor(sample.color);
  } catch {
    return "NOT_VERIFIED" as const;
  }
  // Only the actual opaque body background anchors this observation; never
  // invent a white/black canvas from a transparent html background.
  const bodyIndex = sample.chain.length - 2;
  if (
    bodyIndex < 0 ||
    colors[bodyIndex]?.a !== 1 ||
    foreground.a !== 1 ||
    colors.some((c) => c.a !== 0 && c.a !== 1)
  )
    return "NOT_VERIFIED" as const;
  let parent = colors[bodyIndex]!;
  for (let i = bodyIndex - 1; i >= 1; i--)
    parent = composite(colors[i]!, parent);
  let background = outline ? parent : composite(colors[0]!, parent);
  if (!outline && sample.chain[0]!.opacity !== 1) {
    if (
      colors[0]!.a !== 1 ||
      colors.slice(1, bodyIndex).some((c) => c.a !== 0 && c.a !== 1)
    )
      return "NOT_VERIFIED" as const;
    const opacity = sample.chain[0]!.opacity;
    foreground = composite({ ...foreground, a: opacity }, parent);
    background = composite({ ...background, a: opacity }, parent);
  }
  if (outline) expect(sample.ring, "A8-F03").toBe(true);
  const category = outline
    ? "NON_TEXT"
    : sample.size >= 24 || (sample.size >= 18.6667 && sample.weight >= 700)
      ? "LARGE_TEXT"
      : "NORMAL_TEXT";
  expect(
    classifyContrast(contrastRatio(foreground, background), category) ===
      "PASS",
    "A8-C01",
  ).toBe(true);
  return "PASS" as const;
}
async function representativeContrast(page: Page) {
  const candidates = page.locator(
    "main h1, main p, main label, main .button, main [role=status]",
  );
  const privateResults: string[] = [];
  for (
    let i = 0, count = Math.min(await candidates.count(), 10);
    i < count;
    i++
  ) {
    if (await candidates.nth(i).isVisible())
      privateResults.push(await contrast(candidates.nth(i)));
  }
  // Unsupported samples are explicitly not promoted to PASS. No full-page or
  // all-state contrast assertion follows from the bounded reliable samples.
  expect(privateResults.includes("PASS"), "A8-C02").toBe(true);
  // Catalog Apply uses a module class, not global .primary. Sample the first
  // two visible enabled main .button controls, including secondary/recovery
  // controls, rather than claiming only the home primary covers every route.
  const buttons = page.locator(
    "main .button:not(:disabled):not([aria-disabled=true])",
  );
  let hovered = 0;
  for (
    let i = 0, count = Math.min(await buttons.count(), 6);
    i < count && hovered < 2;
    i++
  ) {
    const button = buttons.nth(i);
    if (!(await button.isVisible())) continue;
    await button.hover();
    await settled(page);
    privateResults.push(await contrast(button));
    hovered++;
  }
}
async function skipAndFocus(page: Page) {
  await page.keyboard.press("Tab");
  await expect
    .poll(
      () =>
        page.locator(".skip-link").evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (
            document.activeElement === el &&
            r.top >= 0 &&
            r.bottom <= innerHeight
          );
        }),
      { message: "A8-F01" },
    )
    .toBe(true);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  // Browser fragment activation need not make <main> itself active. The next
  // actual Tab must reach a descendant, not jump back into header navigation.
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Boolean(
            document.activeElement &&
            document.querySelector("main")?.contains(document.activeElement),
          ),
        ),
      { message: "A8-F02" },
    )
    .toBe(true);
  const focused = page.locator("main :focus");
  await expect
    .poll(
      () =>
        focused.evaluate((el) => {
          const s = getComputedStyle(el);
          return (
            el.matches(":focus-visible") &&
            s.outlineStyle !== "none" &&
            parseFloat(s.outlineWidth) >= 2
          );
        }),
      { message: "A8-F04" },
    )
    .toBe(true);
  await contrast(focused, true);
}

const homeTitles = [
  "A8 Home A",
  "A8 Home B",
  "A8 Home C",
  "A8 Home D",
] as const;
const catalogTitles = [
  "A8 Catalog A",
  "A8 Catalog B",
  "A8 Catalog C",
  "A8 Catalog D",
] as const;
for (const [index, profile] of PROFILES.entries()) {
  test(homeTitles[index]!, async ({ page }) =>
    bounded("A8-HOME", async () => {
      await configure(page, profile, `/${profile.locale}`);
      // Theme selection leaves focus in the footer: reload gives native initial
      // keyboard position without synthetic focus or altered tabindex.
      await page.reload();
      await skipAndFocus(page);
      await geometry(page);
      await representativeContrast(page);
    }),
  );
  test(catalogTitles[index]!, async ({ page }) =>
    bounded("A8-CATALOG", async () => {
      const locale = profile.locale as Locale;
      const t = publicCopy[locale];
      await configure(page, profile, `/${locale}/works`);
      await page.reload();
      await skipAndFocus(page);
      const main = page.getByRole("main");
      expect(
        await main
          .getByRole("heading", { name: t.title, exact: true })
          .isVisible(),
        "A8-K01",
      ).toBe(true);
      await visible(main.getByRole("status"), "A8-K02");
      if (await main.getByText(t.catalogEmpty, { exact: true }).isVisible()) {
        await visible(
          main.getByText(t.catalogEmptyText, { exact: true }),
          "A8-K06",
        );
      } else {
        expect((await main.locator("article").count()) > 0, "A8-K07").toBe(
          true,
        );
      }
      await geometry(page);
      await representativeContrast(page);
      // Native GET using an owned UUID; no fabricated server/catalog response,
      // and no assumption that the shared catalog initially has zero records.
      const query = `accessibility-${randomUUID()}`;
      await main.getByLabel(t.search, { exact: true }).fill(query);
      await main.getByLabel(t.search, { exact: true }).press("Enter");
      await expect
        .poll(() => new URL(page.url()).searchParams.get("q") === query, {
          message: "A8-K03",
        })
        .toBe(true);
      await expect
        .poll(() => main.getByText(t.empty, { exact: true }).isVisible(), {
          message: "A8-K04",
        })
        .toBe(true);
      expect(await main.getByRole("status").isVisible(), "A8-K05").toBe(true);
      await geometry(page);
    }),
  );
}

for (const [index, profile] of [PROFILES[0]!, PROFILES[2]!].entries()) {
  test(
    (["A8 Public routes A", "A8 Public routes C"] as const)[index]!,
    async ({ page }) =>
      bounded("A8-PUBLIC", async () => {
        const locale = profile.locale as Locale;
        const t = discoveryCopy[locale];
        for (const [path, heading] of [
          ["recently-added", t.recent],
          ["releases", t.releases],
        ] as const) {
          await configure(page, profile, `/${locale}/${path}`);
          expect(
            await page
              .getByRole("main")
              .getByRole("heading", { name: heading, exact: true, level: 1 })
              .isVisible(),
            "A8-P01",
          ).toBe(true);
          await geometry(page);
          await representativeContrast(page);
        }
        await configure(page, profile, `/${locale}/login`);
        const tAuth = dictionary(locale);
        expect(
          await page.getByLabel(tAuth.email, { exact: true }).isVisible(),
          "A8-P02",
        ).toBe(true);
        expect(
          await page.getByLabel(tAuth.password, { exact: true }).isVisible(),
          "A8-P03",
        ).toBe(true);
        await geometry(page);
        await representativeContrast(page);
      }),
  );
}

async function systemSequence(page: Page) {
  await page.emulateMedia({ colorScheme: "light" });
  await theme(page, "system");
  const backgrounds: string[] = [];
  for (const colorScheme of ["light", "dark", "light"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document.documentElement.classList.contains("dark"),
          ),
        { message: "A8-S01" },
      )
      .toBe(colorScheme === "dark");
    await settled(page);
    const paletteMatches = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement("span");
      probe.style.color = root.getPropertyValue("--paper");
      document.body.append(probe);
      const expected = getComputedStyle(probe).color;
      probe.remove();
      return getComputedStyle(document.body).backgroundColor === expected;
    });
    expect(paletteMatches, "A8-S02").toBe(true);
    backgrounds.push(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    );
    await page.reload();
    await expect
      .poll(() => page.locator("footer .theme-picker select").inputValue(), {
        message: "A8-S03",
      })
      .toBe("system");
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document.documentElement.classList.contains("dark"),
          ),
        { message: "A8-S04" },
      )
      .toBe(colorScheme === "dark");
  }
  expect(
    backgrounds[0] === backgrounds[2] && backgrounds[0] !== backgrounds[1],
    "A8-S05",
  ).toBe(true);
}

for (const [index, profile] of [PROFILES[0]!, PROFILES[2]!].entries()) {
  test(
    (["A8 Owner A", "A8 Owner C"] as const)[index]!,
    async ({ browser, baseURL }) =>
      bounded("A8-OWNER", async () => {
        // Guard and database construction happen inside this sanitized callback;
        // test discovery does not read secrets or provision any service.
        const { createDatabase } =
          await import("../../packages/database/src/client");
        const { requireTestDatabase } =
          await import("../helpers/test-database");
        const sql = createDatabase(requireTestDatabase()).client;
        const accounts: BrowserAccount[] = [];
        const run = randomUUID();
        let session: Awaited<ReturnType<typeof browser.newContext>> | undefined;
        try {
          expect(Boolean(baseURL), "A8-O01").toBe(true);
          const address = run
            .replaceAll("-", "")
            .slice(0, 20)
            .match(/.{4}/g)!
            .join(":");
          session = await browser.newContext({
            baseURL,
            viewport: { width: profile.width, height: profile.height },
            extraHTTPHeaders: { "x-real-ip": `2001:db8:${address}:1` },
          });
          const page = await session.newPage();
          const owner = await verifiedBrowserAccount(
            page,
            baseURL!,
            run,
            sql,
            accounts,
          );
          expect(Boolean(owner.id), "A8-O02").toBe(true);
          const locale = profile.locale as Locale;
          const t = libraryCopy[locale];
          await configure(page, profile, `/${locale}/library`);
          expect(
            await page
              .getByRole("heading", { name: t.title, exact: true, level: 1 })
              .isVisible(),
            "A8-O03",
          ).toBe(true);
          await expect
            .poll(
              () => page.getByText(t.emptyLibrary, { exact: true }).isVisible(),
              { message: "A8-O04" },
            )
            .toBe(true);
          await page
            .getByRole("combobox", { name: t.status, exact: true })
            .selectOption("READING");
          await page
            .getByRole("button", { name: t.apply, exact: true })
            .click();
          await expect
            .poll(
              () =>
                new URL(page.url()).searchParams.get("status") === "READING",
              { message: "A8-O05" },
            )
            .toBe(true);
          await geometry(page);
          await representativeContrast(page);
          const reset = page.getByRole("link", {
            name: t.showFullLibrary,
            exact: true,
          });
          await reset.focus();
          await reset.press("Enter");
          await expect
            .poll(() => !new URL(page.url()).searchParams.has("status"), {
              message: "A8-O06",
            })
            .toBe(true);
          // Recovery focus is observed after native navigation, not fabricated by
          // mutating activeElement or injecting an application error response.
          await page.keyboard.press("Tab");
          await expect
            .poll(
              () =>
                page.evaluate(() => {
                  const el = document.activeElement;
                  if (!(el instanceof HTMLElement)) return false;
                  const r = el.getBoundingClientRect(),
                    s = getComputedStyle(el);
                  return (
                    el.matches(":focus-visible") &&
                    s.outlineStyle !== "none" &&
                    parseFloat(s.outlineWidth) >= 2 &&
                    r.top >= 0 &&
                    r.bottom <= innerHeight
                  );
                }),
              { message: "A8-O07" },
            )
            .toBe(true);
          const r = requestDictionary(locale);
          await page.goto(`/${locale}/requests`);
          expect(
            await page
              .getByRole("heading", { name: r.mine, exact: true, level: 1 })
              .isVisible(),
            "A8-O08",
          ).toBe(true);
          for (const name of [r.owned, r.followed]) {
            const region = page.getByRole("region", { name, exact: true });
            expect(await region.isVisible(), "A8-O09").toBe(true);
            expect(
              await region.getByText(r.empty, { exact: true }).isVisible(),
              "A8-O10",
            ).toBe(true);
          }
          await geometry(page);
          await page.goto(`/${locale}/requests/new`);
          const main = page.getByRole("main");
          const summary = main.locator("summary");
          await summary.focus();
          await summary.press("Enter");
          await expect
            .poll(
              () =>
                main
                  .locator("details")
                  .evaluate((el) => (el as HTMLDetailsElement).open),
              { message: "A8-O11" },
            )
            .toBe(true);
          await summary.press("Space");
          await expect
            .poll(
              () =>
                main
                  .locator("details")
                  .evaluate((el) => (el as HTMLDetailsElement).open),
              { message: "A8-O12" },
            )
            .toBe(false);
          await main
            .getByRole("button", { name: r.submit, exact: true })
            .click();
          // Native invalid fields generate the real summary; no valid mutation.
          await expect
            .poll(() => main.getByRole("alert").isVisible(), {
              message: "A8-O13",
            })
            .toBe(true);
          const errorLink = main.getByRole("alert").getByRole("link").first();
          expect(await errorLink.isVisible(), "A8-O14").toBe(true);
          await errorLink.click();
          await expect
            .poll(
              () =>
                main
                  .locator('[name="title"]')
                  .evaluate((el) => document.activeElement === el),
              { message: "A8-O15" },
            )
            .toBe(true);
          expect(
            await main
              .locator(
                "input[aria-describedby], select[aria-describedby], textarea[aria-describedby]",
              )
              .evaluateAll(
                (els) =>
                  els.length > 0 &&
                  els.every((el) =>
                    (el.getAttribute("aria-describedby") ?? "")
                      .split(/\s+/)
                      .filter(Boolean)
                      .every((id) =>
                        Boolean(
                          document.getElementById(id)?.textContent?.trim(),
                        ),
                      ),
                  ),
              ),
            "A8-O16",
          ).toBe(true);
          await geometry(page);
          await representativeContrast(page);
          // VI Settings system behavior reuses A's one genuine verified actor.
          const settingsLocale = index === 0 ? "vi" : "en";
          const auth = dictionary(settingsLocale);
          await page.goto(`/${settingsLocale}/settings`);
          await visible(
            page.getByRole("heading", {
              name: auth.settings,
              exact: true,
              level: 1,
            }),
            "A8-O17",
          );
          await geometry(page);
          if (index === 0) await systemSequence(page);
        } finally {
          // Always close the owned browser session and guarded SQL connection, even
          // on setup failure. Only accounts registered by this case are deleted.
          try {
            await bounded("A8-CLEANUP", async () => {
              requireTestDatabase();
              for (const account of accounts) {
                const users =
                  await sql`select id from users where email=${account.email}`;
                for (const user of users) {
                  await sql`delete from sessions where user_id=${String(user.id)}`;
                  await sql`delete from accounts where user_id=${String(user.id)}`;
                  await sql`delete from users where id=${String(user.id)} and email=${account.email}`;
                }
              }
            });
          } finally {
            try {
              await bounded("A8-CONTEXT", async () => {
                await session?.close();
              });
            } finally {
              await bounded("A8-DATABASE", async () => {
                await sql.end();
              });
            }
          }
        }
      }),
  );
}

test("A8 System Home EN", async ({ page }) =>
  bounded("A8-SYSTEM", async () => {
    try {
      await page.goto("/en");
      await systemSequence(page);
    } finally {
      await bounded("A8-SYSTEM-RESTORE", () =>
        page.emulateMedia({ colorScheme: null }),
      );
    }
  }));

test("A8 Reduced motion", async ({ page }) =>
  bounded("A8-MOTION", async () => {
    try {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/en");
      await theme(page, "light");
      const primary = page.locator("main .button.primary").first();
      await primary.hover();
      await settled(page);
      expect(
        await page.evaluate(
          () =>
            getComputedStyle(document.documentElement).scrollBehavior ===
            "auto",
        ),
        "A8-M01",
      ).toBe(true);
      expect(
        await primary.evaluate((el) =>
          getComputedStyle(el)
            .transitionDuration.split(",")
            .every((v) => parseFloat(v) === 0),
        ),
        "A8-M02",
      ).toBe(true);
      // A static hover transform is not animation and is not a failure here.
    } finally {
      await bounded("A8-MOTION-RESTORE", () =>
        page.emulateMedia({ reducedMotion: null }),
      );
    }
  }));
