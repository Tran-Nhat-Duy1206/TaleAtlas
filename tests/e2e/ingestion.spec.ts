import { test, expect, type Page } from "../helpers/browser-test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";
import { requestDictionary } from "../../apps/web/src/lib/request-i18n";
import { ingestionCopy } from "../../apps/web/src/components/ingestion/copy";

// Real isolated PostgreSQL, SMTP verification, browser sessions and native UI.
// Trusted-proxy test IPs isolate rate limits, never authorize identity or role.
// Source acceptance coverage, not deployed-proxy or provider verification proof.
test.describe.configure({ retries: 0 });
test("private submitted-metadata processing through the admin browser", async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(360_000);
  expect(baseURL).toBeTruthy();
  const { client: sql } = createDatabase(requireTestDatabase());
  const run = randomUUID();
  const title = `Đường chưa biết ${run}`;
  const author = `Synthetic author ${run}`;
  const aliases = [`Tên khác ${run}`, `別名 ${run}`];
  const accounts: { email: string; id?: string }[] = [];
  const ids = new Set<string>();
  const scope = run.replace(/-/g, "").slice(0, 20).match(/.{4}/g)!.join(":");
  const proxy = (n: number) => ({ "x-real-ip": `2001:db8:${scope}:${n}` });
  await page.context().setExtraHTTPHeaders(proxy(1));
  const adminContext = await browser.newContext({
    baseURL,
    extraHTTPHeaders: proxy(2),
  });
  const anonContext = await browser.newContext({
    baseURL,
    extraHTTPHeaders: proxy(3),
  });
  const admin = await adminContext.newPage();
  const anon = await anonContext.newPage();
  page.context().setDefaultTimeout(15_000);
  adminContext.setDefaultTimeout(15_000);
  anonContext.setDefaultTimeout(15_000);
  // Cold route compilation retains the shared navigation timeout.
  page.context().setDefaultNavigationTimeout(360_000);
  adminContext.setDefaultNavigationTimeout(360_000);
  anonContext.setDefaultNavigationTimeout(360_000);
  const en = requestDictionary("en");
  const headers = { Origin: baseURL! };
  async function signup(target: Page) {
    const account: { email: string; id?: string } = {
      email: `ingestion-${run}-${randomUUID()}@example.invalid`,
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
    requireTestDatabase();
    const [row] =
      await sql`select id, role, email_verified from users where email = ${account.email}`;
    expect(row?.email_verified).toBe(true);
    expect(row?.role).toBe("user");
    account.id = String(row!.id);
    return account;
  }
  async function overflow(target: Page) {
    expect(
      await target.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  try {
    const owner = await signup(page);
    const administrator = await signup(admin);
    requireTestDatabase();
    await sql`update users set role = 'admin' where id = ${administrator.id!} and email = ${administrator.email} and email_verified = true`;
    await page.goto(
      `/en/requests/new?q=${encodeURIComponent(title)}&format=UNKNOWN`,
    );
    await page
      .getByRole("textbox", { name: en.title, exact: true })
      .fill(title);
    await page
      .getByRole("combobox", { name: en.format, exact: true })
      .selectOption("UNKNOWN");
    await page.locator('[name="alternativeTitles"]').fill(aliases.join("\n"));
    await page.locator('[name="author"]').fill(author);
    await page.getByLabel(en.disclaimer, { exact: true }).check();
    const submitted = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/requests" &&
        r.request().method() === "POST",
      { timeout: 45_000 },
    );
    await page.getByRole("button", { name: en.submit, exact: true }).click();
    const created = await submitted;
    expect(created.status()).toBe(200);
    expect(created.request().postDataJSON().details).toEqual({
      title,
      format: "UNKNOWN",
      alternativeTitles: aliases,
      author,
    });
    await expect(page).toHaveURL(/\/en\/requests\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });
    const id = new URL(page.url()).pathname.split("/").at(-1)!;
    ids.add(id);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title, {
      timeout: 15_000,
    });
    const queuePath = `/api/admin/ingestion?requestId=${id}&page=1&pageSize=20`;
    for (const target of [page, anon]) {
      const denied = await target.request.get(queuePath, {
        headers: { "x-user-role": "admin", "x-user-id": administrator.id! },
      });
      expect(denied.status()).toBe(target === page ? 403 : 401);
      expect(await denied.text()).not.toContain(title);
      const deniedPost = await target.request.post(
        "/api/admin/ingestion/process",
        { headers, data: { limit: 1, requestId: id } },
      );
      expect(deniedPost.status()).toBe(target === page ? 403 : 401);
      await target.goto(`/en/admin/ingestion?requestId=${id}`);
      await expect(target.locator("main")).not.toContainText(title, {
        timeout: 15_000,
      });
      await expect(
        target.locator('[data-testid="ingestion-candidate"]'),
      ).toHaveCount(0, { timeout: 15_000 });
    }
    expect((await admin.request.get(`/api/requests/${id}`)).status()).toBe(404);
    await admin.setViewportSize({ width: 390, height: 844 });
    const imageRequests: string[] = [];
    admin.on("request", (r) => {
      if (r.resourceType() === "image") imageRequests.push(r.url());
    });
    await admin.goto(`/en/admin/ingestion?requestId=${id}`);
    await expect(admin.getByRole("heading", { level: 1 })).toHaveText(
      ingestionCopy.en.title,
      { timeout: 15_000 },
    );
    await expect(admin.getByLabel(ingestionCopy.en.selected)).toHaveValue(id, {
      timeout: 15_000,
    });
    await expect(
      admin.getByText(ingestionCopy.en.pending, { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(admin.locator('[data-testid="ingestion-state"]')).toHaveText(
      "SUBMITTED",
      { timeout: 15_000 },
    );
    const processing = admin.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/admin/ingestion/process" &&
        r.request().method() === "POST",
      { timeout: 45_000 },
    );
    await admin
      .getByRole("button", { name: ingestionCopy.en.run, exact: true })
      .click();
    const processed = await processing;
    expect(processed.status()).toBe(200);
    expect(processed.request().postDataJSON()).toEqual({
      limit: 1,
      requestId: id,
    });
    // Read the complete browser header, not Playwright's synchronous subset.
    expect(await processed.request().headerValue("origin")).toBe(baseURL);
    // Never read the CDP response body after router.refresh; inspect the real DOM
    // and a same-cookie APIRequestContext snapshot instead.
    await expect(admin.getByRole("status")).toHaveText(ingestionCopy.en.done, {
      timeout: 15_000,
    });
    await expect(admin.locator('[data-testid="ingestion-state"]')).toHaveText(
      "NEEDS_REVIEW",
      { timeout: 15_000 },
    );
    await expect(
      admin.locator('[data-testid="ingestion-candidate"]'),
    ).toContainText('"sourceKind": "REQUEST_INPUT"', { timeout: 15_000 });
    await expect(
      admin.locator('[data-testid="ingestion-candidate"]'),
    ).toContainText('"verified": false', { timeout: 15_000 });
    const snapshotResponse = await admin.request.get(queuePath);
    expect(snapshotResponse.status()).toBe(200);
    const snapshot = await snapshotResponse.json();
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]).toMatchObject({
      request: { id, state: "NEEDS_REVIEW", inputRevision: 1 },
      candidate: {
        origin: "REQUEST_INPUT",
        title: { value: title },
        format: { value: "UNKNOWN" },
        autoPublish: false,
        humanReviewRequired: true,
      },
      matches: [],
    });
    expect(snapshot.items[0].candidate.provenance).toEqual([
      {
        sourceKind: "REQUEST_INPUT",
        requestId: id,
        inputRevision: 1,
        verified: false,
      },
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(/leaseToken|lease_token/);
    for (const account of accounts)
      expect(JSON.stringify(snapshot)).not.toContain(account.email);
    await overflow(admin);
    await expect(admin.locator("main img")).toHaveCount(0, { timeout: 15_000 });
    await admin.goto(`/vi/admin/ingestion?requestId=${id}`);
    await expect(admin.getByRole("heading", { level: 1 })).toHaveText(
      ingestionCopy.vi.title,
      { timeout: 15_000 },
    );
    await expect(
      admin.getByText(ingestionCopy.vi.notice, { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await overflow(admin);
    expect(imageRequests).toEqual([]);
    await page.goto("/en/requests");
    await expect(
      page.getByRole("link", { name: title, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("link", { name: title, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/en/requests/${id}$`), {
      timeout: 15_000,
    });
    const ownedResponse = await page.request.get(`/api/requests/${id}`);
    expect(ownedResponse.status()).toBe(200);
    const owned = await ownedResponse.json();
    expect(owned).toMatchObject({
      kind: "OWNED",
      request: { id, state: "NEEDS_REVIEW" },
    });
    expect(JSON.stringify(owned)).not.toMatch(
      /"candidate"|"matches"|"workId"|"leaseToken"|"sourceKind"/,
    );
    requireTestDatabase();
    const beforeEvents =
      await sql`select id from request_events where request_id = ${id} order by id`;
    const [counts] =
      await sql`select (select count(*)::int from ingestion_candidates where request_id = ${id}) as candidates, (select count(*)::int from ingestion_jobs where request_id = ${id}) as jobs, (select count(*)::int from works where primary_title = ${title}) as works`;
    expect(counts).toEqual({ candidates: 1, jobs: 1, works: 0 });
    const reprocess = await admin.request.post("/api/admin/ingestion/process", {
      headers,
      data: { limit: 1, requestId: id },
    });
    expect(reprocess.status()).toBe(200);
    await reprocess.json();
    const after = await admin.request.get(queuePath);
    expect(after.status()).toBe(200);
    expect(await after.json()).toEqual(snapshot);
    requireTestDatabase();
    expect(
      await sql`select id from request_events where request_id = ${id} order by id`,
    ).toEqual(beforeEvents);
    const [afterCounts] =
      await sql`select (select count(*)::int from ingestion_candidates where request_id = ${id}) as candidates, (select count(*)::int from ingestion_jobs where request_id = ${id}) as jobs, (select count(*)::int from works where primary_title = ${title}) as works`;
    expect(afterCounts).toEqual(counts);
    expect(owner.id).not.toBe(administrator.id);
  } finally {
    try {
      requireTestDatabase();
      for (const account of accounts) {
        const users =
          await sql`select id from users where email = ${account.email}`;
        for (const user of users) {
          if (account.id) expect(String(user.id)).toBe(account.id);
          const requests =
            await sql`select id from work_requests where owner_user_id = ${String(user.id)}`;
          for (const request of requests) ids.add(String(request.id));
        }
      }
      for (const id of ids) {
        await sql`delete from work_request_supporters where request_id = ${id}`;
        await sql`delete from ingestion_candidates where request_id = ${id}`;
        await sql`delete from ingestion_jobs where request_id = ${id}`;
        await sql`delete from request_events where request_id = ${id}`;
        await sql`delete from work_requests where id = ${id}`;
      }
      for (const account of accounts) {
        const users =
          await sql`select id from users where email = ${account.email}`;
        for (const user of users) {
          const id = String(user.id);
          await sql`delete from users where id = ${id} and email = ${account.email}`;
          await sql`delete from rate_limits where key = ${`catalog.write:${id}`}`;
        }
        await sql`delete from verifications where identifier like ${`%${account.email}%`}`;
      }
    } finally {
      await sql.end();
      await adminContext.close();
      await anonContext.close();
    }
  }
});
