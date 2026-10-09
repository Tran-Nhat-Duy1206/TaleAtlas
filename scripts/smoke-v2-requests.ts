import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Real local production HTTP/browser acceptance; no mocks, cookies or database imports.
const origin = "http://127.0.0.1:3001";
const id = randomUUID();
const q = "V2 smoke missing story & citation";
const query = new URLSearchParams({ q, format: "NOVEL" });
const notices = {
  en: "Sign in to submit or view requests.",
  vi: "Đăng nhập để gửi hoặc xem yêu cầu.",
};
async function request(path: string, init?: RequestInit) {
  return fetch(origin + path, {
    ...init,
    signal: AbortSignal.timeout(15000),
    redirect: "manual",
  });
}
for (const path of ["/api/health", "/api/ready"]) {
  assert.equal((await request(path)).status, 200, path);
}
for (const locale of ["en", "vi"] as const) {
  for (const path of [
    `/${locale}/requests`,
    `/${locale}/requests/new?${query}`,
    `/${locale}/requests/${id}`,
  ]) {
    const response = await request(path);
    assert.equal(
      response.status,
      200,
      "Anonymous request page remains a sign-in notice",
    );
    const html = await response.text();
    assert.match(html, new RegExp(`<html[^>]*lang="${locale}"`));
    assert.ok(
      html.includes(notices[locale]),
      "Correct localized sign-in notice",
    );
    assert.match(html, /<meta[^>]*name="robots"[^>]*content="[^"]*noindex/);
    assert.doesNotMatch(html, /<input[^>]*name="title"/);
    assert.doesNotMatch(
      html,
      /<textarea[^>]*name="(?:notes|description|additionalEvidence)"/,
    );
  }
  const response = await request(`/${locale}/works?${query}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(
    html.includes(
      locale === "en"
        ? "Didn’t find your story?"
        : "Chưa tìm thấy truyện của bạn?",
    ),
  );
  assert.equal(
    (await request(`/${locale}/works/v2-smoke-nonexistent-${id}`)).status,
    404,
  );
}
for (const path of ["/zz/requests", "/zz/requests/new", `/zz/requests/${id}`]) {
  assert.equal(
    (await request(path)).status,
    404,
    "Unsupported locales must not render request content",
  );
}
for (const path of [
  "/api/requests",
  `/api/requests/search?q=${encodeURIComponent(q)}`,
  "/api/requests/following",
  `/api/requests/${id}`,
]) {
  assert.equal(
    (await request(path)).status,
    401,
    "Private request reads require authentication",
  );
  assert.equal(
    (
      await request(path, {
        headers: { "x-user-id": id, "x-user-role": "admin", "x-owner-id": id },
      })
    ).status,
    401,
    "Forged identity headers do not authenticate",
  );
}
for (const [path, method] of [
  ["/api/requests", "POST"],
  ["/api/requests/not-a-uuid", "PATCH"],
] as const) {
  assert.equal(
    (
      await request(path, {
        method,
        headers: { "Content-Type": "application/json", Origin: origin },
        body: "{malformed",
      })
    ).status,
    401,
    "Authenticate before parsing malformed mutation input",
  );
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  context.setDefaultTimeout(15000);
  context.setDefaultNavigationTimeout(15000);
  const page = await context.newPage();
  let runtimeErrors = 0;
  page.on("pageerror", () => {
    runtimeErrors += 1;
  });
  async function safeAnonymousPage(locale: "en" | "vi") {
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(
      page.getByText(notices[locale], { exact: true }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    assert.equal(
      await page
        .locator('main input[name="title"], main textarea, main button')
        .count(),
      0,
      "Anonymous pages have no private detail controls",
    );
    assert.equal(
      await page.locator("main img").count(),
      0,
      "No request image transfers",
    );
    assert.equal(
      await page
        .locator(
          'main a[href*="/works/"], main a[href*="/chapters/"], main a[href*="/providers/"]',
        )
        .count(),
      0,
      "Anonymous notices fabricate no work, chapters or provider routes",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      "390px request navigation and content do not overflow",
    );
  }
  await page.goto(`${origin}/vi/works?${query}`);
  const prompt = page.getByRole("link", {
    name: "Yêu cầu thêm truyện",
    exact: true,
  });
  const href = await prompt.getAttribute("href");
  assert.ok(href);
  const requestLink = new URL(href, origin);
  assert.equal(requestLink.pathname, "/vi/requests/new");
  assert.equal(requestLink.searchParams.get("q"), q);
  assert.equal(requestLink.searchParams.get("format"), "NOVEL");
  await prompt.click();
  await page.waitForURL((url) => url.pathname === "/vi/requests/new");
  await safeAnonymousPage("vi");
  await page.getByLabel("Giao diện").selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/dark/); // Actual control demonstrates hydration.
  // The notice link has callbackURL; the shell account link intentionally does not.
  const callbackHref = await page
    .locator('main a[href*="callbackURL="]')
    .getAttribute("href");
  assert.ok(callbackHref);
  const callback = new URL(callbackHref, origin).searchParams.get(
    "callbackURL",
  );
  assert.ok(callback);
  const preserved = new URL(callback, origin);
  assert.equal(preserved.searchParams.get("q"), q);
  assert.equal(preserved.searchParams.get("format"), "NOVEL");
  await page.screenshot({
    path: ".local/screenshots/v2b-vi-request-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Ngôn ngữ: English" }).click();
  await page.waitForURL((url) => url.pathname === "/en/requests/new");
  await safeAnonymousPage("en");
  assert.equal(new URL(page.url()).searchParams.get("q"), q);
  assert.equal(new URL(page.url()).searchParams.get("format"), "NOVEL");
  await page.getByLabel("Appearance").selectOption("light");
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.getByRole("link", { name: "Language: Tiếng Việt" }).click();
  await page.waitForURL((url) => url.pathname === "/vi/requests/new");
  await safeAnonymousPage("vi");
  await page.goto(`${origin}/vi/requests/${id}`);
  await safeAnonymousPage("vi");
  assert.equal(
    await page.getByRole("checkbox").count(),
    0,
    "No anonymous follow/edit/cancel controls",
  );
  assert.equal(runtimeErrors, 0, "No browser runtime errors");
  console.log(
    "PASS: local production public/private-anonymous request boundary; health/readiness, bilingual noindex notices, authentication-before-parse, forged-header rejection, bounded missing-story link, native locale navigation, theme hydration, 390px/no images or overflow. Not production-shaped authenticated/hosted SMTP/HTTPS release proof.",
  );
} finally {
  await browser.close();
}
