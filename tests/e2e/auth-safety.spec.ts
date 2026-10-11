import { test, expect } from "../helpers/browser-test";

// Actual SSR/no-JavaScript safety proof only. No accounts, sessions, passwords,
// mutations or synthetic authenticated renders are created by this scenario.
test.describe.configure({ retries: 0 });
test("auth forms cannot submit credentials before JavaScript hydration", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(360_000);
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
  });
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(360_000);
  const page = await context.newPage();
  const unsafeRequests: string[] = [];
  const authMutations: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname.startsWith("/api/auth/"))
      authMutations.push(url.pathname);
    if (
      ["password", "confirm", "email", "name"].some((key) =>
        url.searchParams.has(key),
      )
    )
      unsafeRequests.push(url.pathname);
  });
  try {
    for (const locale of ["en", "vi"]) {
      for (const path of [
        "login",
        "register",
        "forgot-password",
        "reset-password?token=synthetic-e2e-safety-token",
        "verify-email",
      ]) {
        const response = await page.goto(`/${locale}/${path}`);
        expect(response?.status()).toBe(200);
        const form = page.locator("main form");
        await expect(form).toHaveCount(1);
        await expect(form).toHaveAttribute("method", "post");
        await expect(form).toHaveAttribute("aria-busy", "true");
        // Playwright's enabled predicate recognizes individual form controls,
        // not fieldset itself; prove the native fieldset attribute and controls.
        await expect(form.locator("fieldset")).toHaveAttribute("disabled", "");
        for (const input of await form.locator("input").all())
          await expect(input).toBeDisabled();
        const submit = form.getByRole("button", { name: /.+/ });
        await expect(submit).toBeDisabled();
        const before = page.url();
        // Send a real pointer click despite Playwright's enabled auto-wait; the
        // browser's disabled-control semantics, not a mocked handler, must stop it.
        await submit.click({ force: true });
        expect(page.url()).toBe(before);
        expect(new URL(page.url()).searchParams.has("password")).toBe(false);
      }
    }
    expect(unsafeRequests).toEqual([]);
    expect(authMutations).toEqual([]);
  } finally {
    await context.close();
  }
});
