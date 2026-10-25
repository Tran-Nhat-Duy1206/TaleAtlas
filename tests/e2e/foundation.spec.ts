import { test, expect } from "../helpers/browser-test";
import { randomUUID } from "node:crypto";
import type { Page, Route } from "@playwright/test";
import { dictionary, type Locale } from "../../apps/web/src/lib/i18n";

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

test("real registration, email verification, login, protected settings and logout", async ({
  page,
  request,
  baseURL,
}) => {
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
