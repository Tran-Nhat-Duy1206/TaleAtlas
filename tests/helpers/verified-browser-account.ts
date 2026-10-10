import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "./test-database";
export type BrowserAccount = { email: string; id?: string };
export async function verifiedBrowserAccount(
  target: Page,
  baseURL: string,
  run: string,
  sql: ReturnType<typeof createDatabase>["client"],
  accounts: BrowserAccount[],
) {
  const account: BrowserAccount = {
    email: `v2d-${run}-${randomUUID()}@example.invalid`,
  };
  accounts.push(account);
  await target.goto("/en/register");
  await target.getByLabel("Your name").fill(`Synthetic ${run}`);
  await target.getByLabel("Email address").fill(account.email);
  await target
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-e2e-password-17!");
  await target
    .getByLabel("Confirm password")
    .fill("Synthetic-e2e-password-17!");
  const registered = target.waitForResponse(
    (r) =>
      r.url().endsWith("/api/auth/sign-up/email") &&
      r.request().method() === "POST",
    { timeout: 45_000 },
  );
  await target
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  expect((await registered).status()).toBe(200);
  await expect(target).toHaveURL(/\/en\/verify-email$/, { timeout: 15_000 });
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await target.request.get(
          "http://127.0.0.1:1026/messages",
        );
        expect(response.status()).toBe(200);
        const messages: { recipients: string[]; text: string }[] =
          await response.json();
        link = [...messages]
          .reverse()
          .find((m) => m.recipients.includes(account.email))
          ?.text.match(
            /http:\/\/127\.0\.0\.1:\d+\/api\/auth\/verify-email[^\s<>]+/,
          )?.[0];
        return Boolean(link);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  expect(new URL(link!).origin).toBe(baseURL);
  await target.goto(link!);
  await expect(
    target.getByText("Your email is verified. You can now sign in."),
  ).toBeVisible({ timeout: 15_000 });
  await target
    .getByRole("link", { name: "Sign in", exact: true })
    .last()
    .click();
  await target.getByLabel("Email address").fill(account.email);
  await target
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-e2e-password-17!");
  const signedIn = target.waitForResponse(
    (r) =>
      r.url().endsWith("/api/auth/sign-in/email") &&
      r.request().method() === "POST",
    { timeout: 45_000 },
  );
  await target.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await signedIn).status()).toBe(200);
  await expect(target).toHaveURL(/\/en\/settings$/, { timeout: 15_000 });
  await target.waitForLoadState("load", { timeout: 15_000 });
  await expect(
    target.getByRole("heading", { name: "Settings", exact: true, level: 1 }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    target.locator("main").getByText(account.email, { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    target
      .locator("main dl > div")
      .filter({ has: target.getByText("Email verified", { exact: true }) })
      .locator("dd"),
  ).toHaveText("Yes", { timeout: 15_000 });
  requireTestDatabase();
  const [row] =
    await sql`select id, role, email_verified from users where email = ${account.email}`;
  expect(row?.email_verified).toBe(true);
  expect(row?.role).toBe("user");
  account.id = String(row!.id);
  return account;
}
// Genuine negative protocol proof: authority must precede malformed-body parsing.
// Establish endpoint readiness without a mutation or fake authenticated render.
export async function deniedMutationBeforeBody(
  page: Page,
  baseURL: string,
  path: string,
) {
  const response = await page.request.post(path, {
    headers: { Origin: baseURL, "Content-Type": "application/json" },
    data: "{",
    timeout: 45_000,
  });
  expect(response.status()).toBe(401);
}
export async function prepareAnonymousAuth(page: Page) {
  for (const path of ["/en/verify-email", "/en/login", "/en/settings"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    if (path !== "/en/verify-email") {
      await expect(
        page.getByRole("heading", { name: "Sign in", level: 1, exact: true }),
      ).toBeVisible({ timeout: 15_000 });
    }
    await expect(page.locator("main dl dd")).toHaveCount(0, {
      timeout: 15_000,
    });
  }
}
