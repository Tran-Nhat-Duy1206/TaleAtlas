import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const origin = "http://127.0.0.1:3001";
for (const path of [
  "/api/health",
  "/api/ready",
  "/en",
  "/vi",
  "/en/works",
  "/vi/works",
  "/api/catalog/works",
  "/robots.txt",
  "/sitemap.xml",
]) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 200, path);
  const text = await response.text();
  if (path === "/vi") assert.match(text, /<html[^>]*lang="vi"/);
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/en");
  await page.getByRole("link", { name: "Language: Tiếng Việt" }).click();
  await page.waitForURL("**/vi");
  await page.getByLabel("Giao diện").selectOption("light");
  await page.screenshot({
    path: ".local/screenshots/v1-vi-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".local/screenshots/v1-vi-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Khám phá tác phẩm", exact: true })
    .click();
  await page.waitForURL("**/vi/works");
  await page.getByLabel("Giao diện").selectOption("dark"); // A working control proves client hydration.
  const filterBounds = await page.locator("form").first().boundingBox();
  assert.ok(
    filterBounds && filterBounds.height < 450,
    "Mobile filter form remains compact rather than stretching flex bases into heights",
  );
  await page.screenshot({
    path: ".local/screenshots/v1-vi-catalog-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Mobile catalog does not overflow",
  );
  const catalog = (await (
    await fetch(origin + "/api/catalog/works")
  ).json()) as { items: Record<string, unknown>[] };
  assert.equal(
    Array.isArray(catalog.items),
    true,
    "Catalog API returns persisted results",
  );
  for (const item of catalog.items)
    for (const key of ["revision", "visibility", "actorUserId", "audit"])
      assert.equal(
        key in item,
        false,
        "Public catalog excludes private fields",
      );
  assert.equal(
    (await fetch(origin + "/vi/works/nonexistent-production-smoke-work"))
      .status,
    404,
  );
  await page.getByRole("link", { name: "Đăng nhập" }).first().click();
  await page.waitForURL("**/vi/login");
  assert.equal(errors.length, 0, "No browser runtime errors");
  console.log(
    "Production local smoke: health/readiness, EN/VI SSR/catalog API and navigation, actual theme hydration, nonexistent-detail 404, robots/sitemap, mobile screenshots/no overflow and zero browser runtime errors passed. Production SMTP/TLS cookie behavior and populated production catalog not tested.",
  );
} finally {
  await browser.close();
}
