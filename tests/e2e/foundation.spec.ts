import { test, expect } from "../helpers/browser-test";
import { randomUUID } from "node:crypto";
import type { Page, Route } from "@playwright/test";
import { dictionary, type Locale } from "../../apps/web/src/lib/i18n";
import { publicCopy } from "../../apps/web/src/components/catalog/query";
import { discoveryCopy } from "../../apps/web/src/features/catalog/discovery";
import { requireTestDatabase } from "../helpers/test-database";

function collectSafeRuntimeErrors(page: Page) {
  const names: string[] = [];
  page.on("pageerror", (error) => names.push(error.name));
  page.on("console", (message) => {
    if (
      /hydration failed|hydrated.*didn't match|text content does not match/i.test(
        message.text(),
      )
    ) {
      names.push("HydrationError");
    }
  });
  return names;
}

async function expectMobileHeader(page: Page, locale: Locale) {
  const originalViewport = page.viewportSize();
  const header = page.getByRole("banner");
  const language = header.getByRole("link", {
    name: `${dictionary(locale).language}: ${locale === "en" ? "Tiếng Việt" : "English"}`,
  });
  try {
    for (const width of [375, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await language.focus();
      await expect(language).toBeFocused();
      expect(
        await header.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return (
            document.documentElement.scrollWidth <= window.innerWidth &&
            bounds.left >= 0 &&
            bounds.right <= window.innerWidth &&
            Array.from(element.querySelectorAll("a, button")).every(
              (control) => {
                const rect = control.getBoundingClientRect();
                return rect.left >= 0 && rect.right <= window.innerWidth;
              },
            )
          );
        }),
      ).toBe(true);
    }
  } finally {
    if (originalViewport) await page.setViewportSize(originalViewport);
  }
}

async function expectResolvedHeader(
  page: Page,
  locale: Locale,
  state: "anonymous" | "authenticated",
) {
  const header = page.getByRole("banner");
  const t = dictionary(locale);
  const url = new URL(page.url());
  const accountPath = `/${locale}/${state === "anonymous" ? "login" : "settings"}`;
  await expect(header.locator(".nav-account")).toHaveAttribute(
    "data-session-state",
    state,
  );
  await expect(header.getByRole("status")).toHaveCount(0);
  await expect(header.getByRole("button", { name: t.retry })).toHaveCount(0);
  await expect(
    header.getByRole("link", {
      name: state === "anonymous" ? t.login : t.settings,
      exact: false,
    }),
  ).toHaveAttribute("href", accountPath);
  // Preserve the shell's DOM/navigation order, including reader-only role links.
  expect(
    await header
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
  ).toEqual([
    `/${locale}`,
    `/${locale}/works`,
    ...(state === "authenticated"
      ? [`/${locale}/library`, `/${locale}/requests`]
      : []),
    `/${locale === "en" ? "vi" : "en"}${url.pathname.slice(3)}${url.search}${url.hash}`,
    accountPath,
  ]);
  await expectMobileHeader(page, locale);
  await header.locator("a[hreflang]").focus();
  await page.keyboard.press("Tab");
  await expect(header.locator(`a[href="${accountPath}"]`)).toBeFocused();
}

async function withHeldRealSession(
  page: Page,
  locale: Locale,
  state: "anonymous" | "authenticated",
  navigate: () => Promise<unknown>,
  failFirstLookup = false,
) {
  // Match only the committed document's same-origin session endpoint.
  const isSession = (url: string) => {
    const target = new URL(url);
    return (
      target.origin === new URL(page.url()).origin &&
      target.pathname === "/api/auth/get-session"
    );
  };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const continuations: Promise<void>[] = [];
  let heldRequests = 0;
  let failedLookups = 0;
  const handler = (route: Route) => {
    const request = route.request();
    if (request.method() !== "GET" || !isSession(request.url())) {
      return route.continue();
    }
    if (failFirstLookup && failedLookups === 0) {
      failedLookups += 1;
      // Disposable-browser client transport fault only, not a database outage.
      return route.abort("failed");
    }
    heldRequests += 1;
    const continuation = gate.then(() => route.continue());
    continuations.push(continuation);
    return continuation;
  };
  await page.route("**/api/auth/get-session*", handler);
  try {
    await navigate();
    const retry = page.getByRole("banner").getByRole("button", {
      name: dictionary(locale).retry,
      exact: true,
    });
    if (failFirstLookup) {
      const failedHeader = page.getByRole("banner");
      await expect(failedHeader.locator(".nav-account")).toHaveAttribute(
        "data-session-state",
        "error",
      );
      await expect(failedHeader.getByRole("alert")).toHaveText(
        dictionary(locale).sessionError,
      );
      await expect(
        failedHeader.locator(
          `a[href="/${locale}/login"], a[href="/${locale}/settings"], a[href="/${locale}/library"], a[href="/${locale}/requests"], a[href^="/${locale}/admin/"]`,
        ),
      ).toHaveCount(0);
      await retry.focus();
      await expect(retry).toBeFocused();
      await retry.click();
    }
    await expect.poll(() => heldRequests).toBeGreaterThan(0);
    const header = page.getByRole("banner");
    if (failFirstLookup) {
      await expect(retry).toHaveAttribute("aria-disabled", "true");
      await expect(retry).toBeFocused();
      expect(failedLookups).toBe(1);
    }
    const account = header.locator(".nav-account");
    await expect(account).toHaveAttribute("data-session-state", "pending");
    const wrapper = await account.elementHandle();
    await expect(header.getByRole("status")).toHaveText(
      dictionary(locale).loading,
    );
    await expect(
      header.locator(
        `a[href="/${locale}/login"], a[href="/${locale}/settings"], a[href="/${locale}/library"], a[href="/${locale}/requests"], a[href^="/${locale}/admin/"]`,
      ),
    ).toHaveCount(0);
    await expect(header.locator(`a[href="/${locale}"]`)).toBeVisible();
    await expect(header.locator(`a[href="/${locale}/works"]`)).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expectMobileHeader(page, locale);
    // Continue the real same-origin GET: no session JSON, cookies or identity
    // are fabricated. Server-side protected-route authorization is independent.
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "GET" && isSession(candidate.url()),
    );
    release();
    expect((await response).status()).toBe(200);
    await expectResolvedHeader(page, locale, state);
    expect(await wrapper?.evaluate((element) => element.isConnected)).toBe(
      true,
    );
    await wrapper?.dispose();
  } finally {
    release();
    await page.unroute("**/api/auth/get-session*", handler);
    await Promise.all(continuations);
  }
}

test("bilingual navigation, mobile layout and persisted accessible themes", async ({
  page,
}) => {
  const runtimeErrors = collectSafeRuntimeErrors(page);
  await withHeldRealSession(
    page,
    "en",
    "anonymous",
    () => page.goto("/en", { waitUntil: "domcontentloaded" }),
    true,
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Every story starts",
  );
  await withHeldRealSession(page, "vi", "anonymous", () =>
    Promise.all([
      page.waitForURL(/\/vi$/, { waitUntil: "domcontentloaded" }),
      page
        .getByRole("banner")
        .getByRole("link", {
          name: "Language: Tiếng Việt",
        })
        .click({ noWaitAfter: true }),
    ]),
  );
  await expect(page).toHaveURL(/\/vi$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Mỗi câu chuyện",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await page.getByLabel("Giao diện").selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByLabel("Giao diện").selectOption("light");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByLabel("Giao diện").selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("link", { name: "Đăng nhập", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Đăng nhập", exact: true }),
  ).toBeVisible();
  expect(runtimeErrors, "No runtime or hydration error names").toEqual([]);
});

test("A7 public primary tokens, utility titles and discovery containers in EN/VI themes", async ({
  page,
}) => {
  // Public GETs only, at the fixture's default viewport; no record-count premise.
  const main = page.getByRole("main");
  const themes = ["light", "dark"] as const;
  const selectTheme = async (
    locale: Locale,
    theme: (typeof themes)[number],
  ) => {
    const themeSelect = page
      .getByRole("contentinfo")
      .getByLabel(dictionary(locale).theme);
    await expect(themeSelect).toBeEnabled();
    await themeSelect.selectOption(theme);
    await expect(themeSelect).toHaveValue(theme);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    if (theme === "dark")
      await expect(page.locator("html")).toHaveClass(/dark/);
    else await expect(page.locator("html")).not.toHaveClass(/dark/);
  };
  const expectPrimary = async (control: ReturnType<Page["getByRole"]>) => {
    await expect(control).toBeVisible();
    await expect(control).toBeEnabled();
    // Wait out ThemeProvider's temporary transition suppression, not a timed sleep.
    await expect(control).toHaveCSS("transition-duration", "0.15s, 0.15s");
    const settledPair = () =>
      control.evaluate(async (element) => {
        // Reading computed style registers pending CSS transitions before enumeration.
        void getComputedStyle(element).backgroundColor;
        await Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        );
        const root = getComputedStyle(document.documentElement);
        const probe = document.createElement("span");
        probe.style.backgroundColor = root.getPropertyValue("--green");
        probe.style.color = root.getPropertyValue("--green-ink");
        probe.hidden = true;
        document.body.append(probe);
        try {
          const expected = getComputedStyle(probe);
          const actual = getComputedStyle(element);
          return {
            background: actual.backgroundColor,
            foreground: actual.color,
            green: expected.backgroundColor,
            greenInk: expected.color,
            outline: actual.outlineColor,
          };
        } finally {
          probe.remove();
        }
      });
    const expectPair = async () => {
      const pair = await settledPair();
      // Semantic computed-color pairs only, not a rendered contrast/WCAG claim.
      expect(pair.background).toBe(pair.green);
      expect(pair.foreground).toBe(pair.greenInk);
      return pair;
    };
    await page.mouse.move(0, 0);
    await expectPair();
    await control.hover();
    await expectPair(); // Must observe the completed 150ms hover, not its first frame.
    await page.mouse.move(0, 0);
    await control.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(control).toBeFocused();
    await expect(control).toHaveCSS("outline-style", "solid");
    await expect(control).toHaveCSS("outline-width", "3px");
    const focused = await expectPair();
    expect(focused.outline).toBe(focused.green);
  };
  const containerMetrics = async () => {
    const container = main.locator(":scope > section");
    await expect(container).toHaveCount(1);
    return container.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const mainBounds = element.closest("main")!.getBoundingClientRect();
      return {
        mainLeft: mainBounds.left,
        mainRight: mainBounds.right,
        maxWidth: style.maxWidth,
        padding: [
          style.paddingTop,
          style.paddingRight,
          style.paddingBottom,
          style.paddingLeft,
        ],
        left: rect.left,
        right: rect.right,
        width: rect.width,
        viewportWidth: window.innerWidth,
      };
    });
  };
  const expectContainer = (
    metrics: Awaited<ReturnType<typeof containerMetrics>>,
  ) => {
    expect(metrics.maxWidth).toBe("1200px");
    expect(metrics.left).toBeGreaterThanOrEqual(0);
    expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(parseFloat(metrics.padding[1])).toBeGreaterThan(0);
    // Each document may have different scrollbar occupancy; validate centering
    // against its own main bounds rather than assuming identical absolute pixels.
    expect(metrics.width).toBeCloseTo(
      Math.min(
        parseFloat(metrics.maxWidth),
        metrics.mainRight - metrics.mainLeft,
      ),
      0,
    );
    expect(metrics.left).toBeCloseTo(
      (metrics.mainLeft + metrics.mainRight - metrics.width) / 2,
      0,
    );
  };
  for (const locale of ["en", "vi"] as const) {
    await page.goto(`/${locale}`);
    const homeTitle = main.getByRole("heading", { level: 1 });
    await expect(homeTitle).toHaveCount(1);
    await expect(homeTitle).toHaveText(dictionary(locale).headline);
    await expect(homeTitle).not.toHaveClass(/\bpage-title\b/);
    for (const theme of themes) {
      await selectTheme(locale, theme);
      await expectPrimary(
        main.getByRole("link", { name: dictionary(locale).start, exact: true }),
      );
    }

    await page.goto(`/${locale}/works`);
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(
      publicCopy[locale].title,
    );
    const catalog = await containerMetrics();
    expectContainer(catalog);
    for (const theme of themes) {
      await selectTheme(locale, theme);
      await expectPrimary(
        main.getByRole("button", {
          name: publicCopy[locale].apply,
          exact: true,
        }),
      );
    }

    for (const [route, title] of [
      ["recently-added", discoveryCopy[locale].recent],
      ["releases", discoveryCopy[locale].releases],
    ] as const) {
      await page.goto(`/${locale}/${route}`);
      const heading = main.getByRole("heading", { level: 1 });
      await expect(heading).toHaveCount(1);
      await expect(heading).toHaveText(title);
      await expect(heading).toHaveClass(/\bpage-title\b/);
      for (const theme of themes) {
        await selectTheme(locale, theme);
        const discovery = await containerMetrics();
        expectContainer(discovery);
        expect({
          maxWidth: discovery.maxWidth,
          padding: discovery.padding,
        }).toEqual({ maxWidth: catalog.maxWidth, padding: catalog.padding });
        const typography = await heading.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            size: parseFloat(style.fontSize),
            lineHeight: parseFloat(style.lineHeight),
            wrap: style.overflowWrap,
            whiteSpace: style.whiteSpace,
            family: style.fontFamily,
            bodySize: getComputedStyle(document.body).fontSize,
            expectedSize: Math.min(36, Math.max(28, window.innerWidth * 0.04)),
          };
        });
        expect(typography.bodySize).toBe("15px");
        expect(typography.size).toBeGreaterThanOrEqual(28);
        expect(typography.size).toBeCloseTo(typography.expectedSize, 1);
        expect(typography.lineHeight / typography.size).toBeCloseTo(1.25, 2);
        expect(typography.wrap).toBe("anywhere");
        expect(typography.whiteSpace).toBe("normal");
        expect(typography.family).toContain(
          locale === "vi" ? "Times New Roman" : "Georgia",
        );
      }
    }
  }
});

test("real registration, email verification, login, protected settings and logout", async ({
  page,
  request,
  baseURL,
  extraHTTPHeaders,
}) => {
  // The native/local fixture owns this loopback origin and disposable database.
  // Never send a trusted synthetic identity to a hosted application.
  try {
    requireTestDatabase();
    const origin = new URL(baseURL ?? "");
    const port = Number(origin.port);
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.hostname !== "127.0.0.1" ||
      !Number.isInteger(port) ||
      port < 1024 ||
      port > 65535 ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw new Error("Guarded disposable auth actor required");
  } catch {
    throw new Error("Guarded disposable auth actor required");
  }
  // A new test invocation/retry is a new genuine actor. Keep one address for
  // its entire lifecycle; randomize /64 network bits, not only the last hextet.
  const actorAddress = randomUUID()
    .replaceAll("-", "")
    .slice(0, 20)
    .match(/.{4}/g)!
    .join(":");
  await page.context().setExtraHTTPHeaders({
    ...Object.fromEntries(
      Object.entries(extraHTTPHeaders ?? {}).filter(
        ([name]) => name.toLowerCase() !== "x-real-ip",
      ),
    ),
    "x-real-ip": `2001:db8:${actorAddress}:1`,
  });
  const runtimeErrors = collectSafeRuntimeErrors(page);
  const email = `${randomUUID()}@example.invalid`;
  await page.goto("/en/settings");
  await expect(page).toHaveURL(/\/en\/login$/);
  await page.goto("/en/register");
  await page.getByLabel("Your name").fill("E2E Reader");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-e2e-password-17!");
  await page.getByLabel("Confirm password").fill("Synthetic-e2e-password-17!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/en\/verify-email$/);
  const response = await request.get("http://127.0.0.1:1026/messages");
  const messages: { recipients: string[]; text: string }[] =
    await response.json();
  const mail = messages.find((message) => message.recipients.includes(email));
  const link = mail?.text.match(
    /https?:\/\/127\.0\.0\.1:\d+\/api\/auth\/verify-email[^\s<>]+/,
  )?.[0];
  expect(link).toBeTruthy();
  expect(new URL(link!).origin).toBe(baseURL);
  await page.goto(link!);
  await expect(
    page.getByText("Your email is verified. You can now sign in."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sign in", exact: true }).last().click();
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-e2e-password-17!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/settings$/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  // Reuse this verified reader; hold only its fresh client session lookup,
  // never registration/login, server authorization or synthetic-mail traffic.
  await withHeldRealSession(page, "en", "authenticated", () =>
    page.reload({ waitUntil: "domcontentloaded" }),
  );
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/login$/);
  await page.goto("/en/settings");
  await expect(page).toHaveURL(/\/en\/login$/);
  expect(runtimeErrors, "No runtime or hydration error names").toEqual([]);
});

test("health, readiness, safe unsupported locale and private metadata", async ({
  page,
  request,
}) => {
  expect((await request.get("/api/health")).status()).toBe(200);
  expect((await request.get("/api/ready")).status()).toBe(200);
  expect((await request.get("/fr")).status()).toBe(404);
  await page.goto("/en/login");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});
