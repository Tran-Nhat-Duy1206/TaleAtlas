import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const origin = "http://127.0.0.1:3001";
for (const path of [
  "/api/health",
  "/api/ready",
  "/en",
  "/vi",
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
    path: ".local/screenshots/vi-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".local/screenshots/vi-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Đăng nhập" }).first().click();
  await page.waitForURL("**/vi/login");
  assert.equal(errors.length, 0, "No browser runtime errors");
  console.log(
    "Production local smoke: health/readiness, EN/VI SSR and navigation, robots/sitemap, mobile screenshots and zero browser runtime errors passed. Production SMTP/TLS cookie behavior not tested.",
  );
} finally {
  await browser.close();
}
