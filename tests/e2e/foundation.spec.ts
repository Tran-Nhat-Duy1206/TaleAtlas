import { test, expect } from "../helpers/browser-test";
import { randomUUID } from "node:crypto";

test("bilingual navigation, mobile layout and persisted accessible themes", async ({
  page,
}) => {
  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Every story starts",
  );
  await page.getByRole("link", { name: "Language: Tiếng Việt" }).click();
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
});

test("real registration, email verification, login, protected settings and logout", async ({
  page,
  request,
  baseURL,
}) => {
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
    /http:\/\/127\.0\.0\.1:\d+\/api\/auth\/verify-email[^\s<>]+/,
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
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/login$/);
  await page.goto("/en/settings");
  await expect(page).toHaveURL(/\/en\/login$/);
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
