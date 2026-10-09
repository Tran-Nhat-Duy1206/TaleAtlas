import { test, expect, type Page } from "../helpers/browser-test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";
import { requestDictionary } from "../../apps/web/src/lib/request-i18n";
import { publicCopy } from "../../apps/web/src/components/catalog/query";
import { dictionary } from "../../apps/web/src/lib/i18n";

// Browser acceptance only: real SMTP verification, cookies, Next UI and APIs.
// SQL is confined to guarded UUID-owned fixture inspection, role grant and cleanup.
// This does not cover approval or a published-result lifecycle.
test.describe.configure({ retries: 0 });
test("verified request ownership, reviewed equivalence, following and private lifecycle", async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(360_000);
  expect(baseURL).toBe("http://127.0.0.1:3010");
  const { client: sql } = createDatabase(requireTestDatabase());
  const run = randomUUID();
  const title = `Đường Hư Cấu ${run}`;
  const notes = `Synthetic private owner notes ${run}`;
  const privateTitle = `Đường Riêng Tư ${run}`;
  const accounts: { email: string; id?: string }[] = [];
  const createdIds = new Set<string>();
  const otherContext = await browser.newContext({ baseURL });
  const anonymousContext = await browser.newContext({ baseURL });
  const other = await otherContext.newPage();
  const anonymous = await anonymousContext.newPage();
  const vi = requestDictionary("vi");
  const en = requestDictionary("en");
  const headers = { Origin: baseURL! };
  const minimal = { title, format: "UNKNOWN", alternativeTitles: [] };

  async function signUp(target: Page) {
    const account: { email: string; id?: string } = {
      email: `requests-${run}-${randomUUID()}@example.invalid`,
    };
    accounts.push(account); // Discover by email even if registration fails midway.
    await target.goto("/en/register");
    await target.getByLabel("Your name").fill(`Synthetic reader ${run}`);
    await target.getByLabel("Email address").fill(account.email);
    await target
      .getByLabel("Password", { exact: true })
      .fill("Synthetic-e2e-password-17!");
    await target
      .getByLabel("Confirm password")
      .fill("Synthetic-e2e-password-17!");
    const signedUp = target.waitForResponse(
      (r) =>
        r.url().endsWith("/api/auth/sign-up/email") &&
        r.request().method() === "POST",
      { timeout: 45_000 },
    );
    await target.getByRole("button", { name: "Create account" }).click();
    expect((await signedUp).status()).toBe(200);
    await expect(target).toHaveURL(/\/en\/verify-email$/, { timeout: 30_000 });
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
    await expect(target).toHaveURL(/\/en\/settings$/, { timeout: 30_000 });
    requireTestDatabase();
    const [row] =
      await sql`select id, role, email_verified from users where email = ${account.email}`;
    expect(row?.email_verified).toBe(true);
    expect(row?.role).toBe("user");
    account.id = String(row!.id);
    return account;
  }
  async function uiMutation(
    target: Page,
    path: string,
    method: string,
    button: string,
  ) {
    const pending = target.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === path && r.request().method() === method,
      { timeout: 45_000 },
    );
    await target.getByRole("button", { name: button, exact: true }).click();
    const response = await pending;
    expect(response.status()).toBe(200);
    return response;
  }
  async function search(target: Page) {
    await target.goto("/vi/works");
    await target.getByLabel(publicCopy.vi.search).fill(title);
    const navigation = target.waitForURL(
      (url) =>
        url.pathname === "/vi/works" && url.searchParams.get("q") === title,
      { timeout: 45_000 },
    );
    await target.getByLabel(publicCopy.vi.search).press("Enter");
    await navigation;
    await expect(
      target.getByRole("heading", { name: vi.missing, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  }
  async function safePage(target: Page) {
    await expect(target.locator("main")).not.toContainText(notes, {
      timeout: 15_000,
    });
    await expect(target.locator("main")).not.toContainText(privateTitle, {
      timeout: 15_000,
    });
    for (const account of accounts)
      await expect(target.locator("main")).not.toContainText(account.email, {
        timeout: 15_000,
      });
    await expect(
      target.getByRole("textbox", { name: vi.notes, exact: true }),
    ).toHaveCount(0, { timeout: 15_000 });
    await expect(
      target.getByRole("heading", { name: vi.history, exact: true }),
    ).toHaveCount(0, { timeout: 15_000 });
  }
  async function owned(id: string) {
    const response = await page.request.get(`/api/requests/${id}`);
    expect(response.status()).toBe(200);
    const dto = await response.json();
    expect(dto.kind).toBe("OWNED");
    return dto.request;
  }
  async function overflow(target: Page) {
    expect(
      await target.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }

  try {
    const owner = await signUp(page);
    const reader = await signUp(other);
    await page.setViewportSize({ width: 390, height: 844 });
    await search(page);
    // Prepare only the genuine authorized destination; the missing-story action
    // below still performs the actual client navigation and displays its prefill.
    const newPath = `/vi/requests/new?q=${encodeURIComponent(title)}&format=UNKNOWN`;
    const prepared = await page.request.get(newPath);
    expect(prepared.status()).toBe(200);
    await prepared.body();
    await page.getByRole("link", { name: vi.new, exact: true }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/vi/requests/new" &&
        url.searchParams.get("q") === title,
      { timeout: 15_000 },
    );
    await expect(page.getByLabel(vi.title, { exact: true })).toHaveValue(
      title,
      { timeout: 15_000 },
    );
    await expect(
      page.getByRole("combobox", { name: vi.format, exact: true }),
    ).toHaveValue("UNKNOWN", { timeout: 15_000 });
    await expect(page.getByText(vi.optional, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    const disclaimer = page.getByLabel(vi.disclaimer, { exact: true });
    await expect(disclaimer).not.toBeChecked({ timeout: 15_000 });
    // Native required checkbox validation must block the genuine submit action.
    await page.getByRole("button", { name: vi.submit, exact: true }).click();
    expect(
      await disclaimer.evaluate(
        (element: HTMLInputElement) => element.validity.valueMissing,
      ),
    ).toBe(true);
    await expect(page).toHaveURL(/\/vi\/requests\/new\?/, { timeout: 15_000 });
    await disclaimer.check();
    await overflow(page);
    const detailNavigation = page.waitForResponse(
      (r) =>
        /^\/vi\/requests\/[0-9a-f-]{36}$/.test(new URL(r.url()).pathname) &&
        r.request().method() === "GET",
      { timeout: 45_000 },
    );
    const submitted = await uiMutation(
      page,
      "/api/requests",
      "POST",
      vi.submit,
    );
    expect(submitted.request().postDataJSON().details).toEqual(minimal);
    // Await the real cold-compiled RSC destination before normal 15s UI checks.
    const detailResponse = await detailNavigation;
    expect(detailResponse.status()).toBe(200);
    const id = new URL(detailResponse.url()).pathname.split("/").at(-1)!;
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    createdIds.add(id);
    // Next may replace a prefetched RSC transport; assert its status and the
    // actual destination DOM instead of reading an abandoned CDP resource.
    await expect(page).toHaveURL(new RegExp(`/vi/requests/${id}$`), {
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title, {
      timeout: 15_000,
    });
    await expect(page.locator("main > section > p").first()).toHaveText(
      "Đã gửi",
      { timeout: 15_000 },
    );
    // UI transport status/body inputs plus authenticated persisted DTOs avoid
    // CDP response-body reads racing router navigation. No UI response JSON
    // body contract is claimed by these snapshots.
    const created = await owned(id);
    expect(created).toMatchObject({ id, revision: 1, state: "SUBMITTED" });
    expect(created.details).toEqual(minimal);
    await expect(
      page
        .locator("header nav")
        .getByRole("link", { name: vi.mine, exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // Native locale-root navigation preserves pathname and the selected theme.
    await page
      .getByLabel(dictionary("vi").theme, { exact: true })
      .selectOption("dark");
    const switched = page.waitForNavigation({ timeout: 45_000 });
    await page
      .getByRole("link", { name: "Ngôn ngữ: English", exact: true })
      .click();
    expect((await switched)?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/en/requests/${id}$`), {
      timeout: 15_000,
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "en", {
      timeout: 15_000,
    });
    await expect(
      page.getByLabel(dictionary("en").theme, { exact: true }),
    ).toHaveValue("dark", { timeout: 15_000 });
    await expect(
      page
        .locator("header nav")
        .getByRole("link", { name: en.mine, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    const switchedBack = page.waitForNavigation({ timeout: 45_000 });
    await page
      .getByRole("link", { name: "Language: Tiếng Việt", exact: true })
      .click();
    expect((await switchedBack)?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/vi/requests/${id}$`), {
      timeout: 15_000,
    });
    await expect(
      page.getByLabel(dictionary("vi").theme, { exact: true }),
    ).toHaveValue("dark", { timeout: 15_000 });
    await overflow(page);
    await page
      .getByRole("textbox", { name: vi.notes, exact: true })
      .fill(notes);
    await page.getByLabel(vi.disclaimer, { exact: true }).check();
    const amended = await uiMutation(
      page,
      `/api/requests/${id}`,
      "PATCH",
      vi.save,
    );
    expect(amended.request().postDataJSON().revision).toBe(1);
    await expect(page).toHaveURL(new RegExp(`/vi/requests/${id}$`), {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("textbox", { name: vi.notes, exact: true }),
    ).toHaveValue(notes, { timeout: 15_000 });
    const amendedDTO = await owned(id);
    expect(amendedDTO).toMatchObject({ id, revision: 2 });
    expect(amendedDTO.details).toEqual({ ...minimal, notes });

    expect((await other.request.get(`/api/requests/${id}`)).status()).toBe(404);
    await other.goto(`/vi/requests/${id}`);
    await safePage(other);
    await expect(
      other.getByRole("heading", { name: title, exact: true }),
    ).toHaveCount(0, { timeout: 15_000 });
    await expect(other.locator('input[name="title"]')).toHaveCount(0, {
      timeout: 15_000,
    });
    expect([403, 404]).toContain(
      (
        await other.request.patch(`/api/requests/${id}`, {
          headers,
          data: { revision: 2, details: minimal },
        })
      ).status(),
    );
    expect(
      (
        await anonymous.request.post("/api/requests", {
          headers,
          data: { submitKey: randomUUID(), details: minimal },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await page.request.post("/api/requests", {
          headers: { Origin: "https://forged.example.invalid" },
          data: { submitKey: randomUUID(), details: minimal },
        })
      ).status(),
    ).toBe(403);

    // Same title is not identity: different real owner and author produce a
    // distinct private request, not an automatic merge or following relation.
    const secondResponse = await other.request.post("/api/requests", {
      headers,
      data: {
        submitKey: randomUUID(),
        details: { ...minimal, author: `Synthetic different author ${run}` },
      },
    });
    expect(secondResponse.status()).toBe(200);
    const second = await secondResponse.json();
    createdIds.add(second.id);
    expect(second.id).not.toBe(id);
    expect(second.details.author).toBe(`Synthetic different author ${run}`);
    requireTestDatabase();
    const [secondOwner] =
      await sql`select owner_user_id from work_requests where id = ${second.id}`;
    expect(secondOwner?.owner_user_id).toBe(reader.id);
    const missing = randomUUID();
    const unreviewed = await page.request.post(
      `/api/requests/${second.id}/support`,
      { headers, data: { equivalenceAcknowledged: true } },
    );
    const missingSupport = await page.request.post(
      `/api/requests/${missing}/support`,
      { headers, data: { equivalenceAcknowledged: true } },
    );
    expect(unreviewed.status()).toBe(404);
    expect(missingSupport.status()).toBe(404);
    expect(await unreviewed.json()).toEqual(await missingSupport.json());

    requireTestDatabase();
    await sql`update users set role = 'admin' where id = ${owner.id!} and email = ${owner.email} and email_verified = true`;
    const reviewed = await page.request.post(
      `/api/admin/requests/${id}/summary`,
      {
        headers,
        data: {
          revision: (await owned(id)).revision,
          title,
          format: "UNKNOWN",
          alternativeTitles: [`curated alias ${run}`],
          sourceUrl: "https://example.org/synthetic",
          reason: "Synthetic human equivalence review, not production evidence",
          equivalenceReviewAcknowledged: true,
        },
      },
    );
    expect(reviewed.status()).toBe(200);
    expect(await reviewed.json()).toMatchObject({ id, title, revision: 3 });
    await search(other);
    await expect(
      other.getByRole("heading", { name: vi.reviewed, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    const summary = other
      .locator("article")
      .filter({ has: other.getByRole("link", { name: title, exact: true }) });
    await expect(
      summary.getByRole("button", { name: vi.follow, exact: true }),
    ).toBeDisabled({ timeout: 15_000 });
    await safePage(other);
    const preparedMine = await other.request.get("/vi/requests");
    expect(preparedMine.status()).toBe(200);
    await preparedMine.body();
    await summary.getByLabel(vi.equivalence, { exact: true }).check();
    const followed = await uiMutation(
      other,
      `/api/requests/${id}/support`,
      "POST",
      vi.follow,
    );
    expect(followed.request().postDataJSON()).toEqual({
      equivalenceAcknowledged: true,
    });
    await expect(other).toHaveURL(/\/vi\/requests$/, { timeout: 15_000 });
    await expect(
      other.getByRole("heading", { name: vi.followed, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    const followedSnapshot = await other.request.get(`/api/requests/${id}`);
    expect(followedSnapshot.status()).toBe(200);
    const followedDTO = await followedSnapshot.json();
    expect(followedDTO).toMatchObject({
      kind: "FOLLOWED",
      request: { id, title, revision: 3, following: true, supporterCount: 1 },
    });
    const duplicate = await other.request.post(`/api/requests/${id}/support`, {
      headers,
      data: { equivalenceAcknowledged: true },
    });
    expect(duplicate.status()).toBe(200);
    requireTestDatabase();
    const [supporters] =
      await sql`select count(*)::int as count from work_request_supporters where request_id = ${id} and user_id = ${reader.id!}`;
    expect(supporters?.count).toBe(1);
    await expect(
      other.getByRole("heading", { name: vi.followed, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    const followedCard = other
      .locator("article")
      .filter({ has: other.getByRole("link", { name: title, exact: true }) });
    await expect(followedCard).toContainText(`${vi.supporters}: 1`, {
      timeout: 15_000,
    });
    const safeDTO = await (
      await other.request.get(`/api/requests/${id}`)
    ).json();
    expect(safeDTO.kind).toBe("FOLLOWED");
    expect(safeDTO.request).toMatchObject({
      title,
      supporterCount: 1,
      following: true,
    });
    for (const field of [
      "details",
      "events",
      "ownerUserId",
      "email",
      "notes",
      "actorSnapshot",
      "actorUserId",
      "inputHash",
      "submitKey",
      "normalizedTitle",
    ])
      expect(safeDTO.request).not.toHaveProperty(field);
    for (const privateValue of [owner.id!, owner.email, notes])
      expect(JSON.stringify(safeDTO)).not.toContain(privateValue);
    await other.goto(`/vi/requests/${id}`);
    await expect(other.getByRole("heading", { level: 1 })).toHaveText(
      vi.followed,
      { timeout: 15_000 },
    );
    await expect(
      other.getByRole("link", { name: title, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await safePage(other);

    // Reload after summary review: revision 3, not the stale pre-review revision.
    await page.goto(`/vi/requests/${id}`);
    await expect(
      page.getByRole("textbox", { name: vi.notes, exact: true }),
    ).toHaveValue(notes, { timeout: 15_000 });
    await page.getByLabel(vi.title, { exact: true }).fill(privateTitle);
    await page.getByLabel(vi.disclaimer, { exact: true }).check();
    const withdrawal = await uiMutation(
      page,
      `/api/requests/${id}`,
      "PATCH",
      vi.save,
    );
    expect(withdrawal.request().postDataJSON().revision).toBe(3);
    await expect(page).toHaveURL(new RegExp(`/vi/requests/${id}$`), {
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      privateTitle,
      { timeout: 15_000 },
    );
    const withdrawalDTO = await owned(id);
    expect(withdrawalDTO).toMatchObject({ id, revision: 4 });
    expect(withdrawalDTO.details).toEqual({
      ...minimal,
      title: privateTitle,
      notes,
    });
    await search(other);
    await expect(
      other.getByRole("heading", { name: vi.reviewed, exact: true }),
    ).toHaveCount(0, { timeout: 15_000 });
    await safePage(other);
    await other.goto(`/vi/requests/${id}`);
    await expect(other.locator("article").getByRole("link")).toHaveText(
      vi.unknown,
      { timeout: 15_000 },
    );
    await safePage(other);
    const withdrawnDTO = await (
      await other.request.get(`/api/requests/${id}`)
    ).json();
    expect(withdrawnDTO).toMatchObject({
      kind: "FOLLOWED",
      request: { title: null, format: null },
    });
    expect(JSON.stringify(withdrawnDTO)).not.toContain(notes);
    expect(JSON.stringify(withdrawnDTO)).not.toContain(privateTitle);

    await page.goto(`/vi/requests/${id}`);
    const cancelled = await uiMutation(
      page,
      `/api/requests/${id}/cancel`,
      "POST",
      vi.cancel,
    );
    expect(cancelled.request().postDataJSON()).toEqual({ revision: 4 });
    await expect(page).toHaveURL(/\/vi\/requests$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(vi.mine, {
      timeout: 15_000,
    });
    const cancelledDTO = await owned(id);
    expect(cancelledDTO).toMatchObject({ id, state: "CANCELLED", revision: 5 });
    expect(cancelledDTO.details).toEqual({
      ...minimal,
      title: privateTitle,
      notes,
    });
    await page.goto(`/vi/requests/${id}`);
    await expect(page.locator("main > section > p").first()).toHaveText(
      "Đã hủy",
      { timeout: 15_000 },
    );
    await expect(page.getByLabel(vi.title, { exact: true })).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: vi.cancel, exact: true }),
    ).toHaveCount(0, { timeout: 15_000 });
    await overflow(page);
    await other.setViewportSize({ width: 390, height: 844 });
    await other.goto(`/vi/requests/${id}`);
    await expect(other.locator("article").getByRole("link")).toHaveText(
      vi.unknown,
      { timeout: 15_000 },
    );
    await safePage(other);
    await overflow(other);
    const unfollowed = await uiMutation(
      other,
      `/api/requests/${id}/support`,
      "DELETE",
      vi.unfollow,
    );
    expect(unfollowed.request().postDataJSON()).toEqual({});
    await expect(other).toHaveURL(/\/vi\/requests$/, { timeout: 15_000 });
    await expect(other.getByRole("heading", { level: 1 })).toHaveText(vi.mine, {
      timeout: 15_000,
    });
    await expect(
      other.locator(`main a[href="/vi/requests/${id}"]`),
    ).toHaveCount(0, {
      timeout: 15_000,
    });
    // Check the UI DELETE's persisted effect before idempotent API deletions;
    // otherwise those later requests could conceal a failed UI unfollow.
    expect((await other.request.get(`/api/requests/${id}`)).status()).toBe(404);
    requireTestDatabase();
    const [afterUIUnfollow] =
      await sql`select count(*)::int as count from work_request_supporters where request_id = ${id}`;
    expect(afterUIUnfollow?.count).toBe(0);
    for (const requestId of [id, missing]) {
      const response = await other.request.delete(
        `/api/requests/${requestId}/support`,
        { headers },
      );
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ following: false });
    }
    expect((await other.request.get(`/api/requests/${id}`)).status()).toBe(404);
    requireTestDatabase();
    const [remaining] =
      await sql`select count(*)::int as count from work_request_supporters where request_id = ${id}`;
    expect(remaining?.count).toBe(0);
    for (const locale of ["vi", "en"] as const) {
      for (const path of ["", "/new", `/${id}`]) {
        await anonymous.goto(`/${locale}/requests${path}`);
        await expect(
          anonymous.getByText(requestDictionary(locale).signIn, {
            exact: true,
          }),
        ).toBeVisible({ timeout: 15_000 });
        await expect(anonymous.locator('input[name="title"]')).toHaveCount(0, {
          timeout: 15_000,
        });
        await expect(anonymous.locator("main")).not.toContainText(notes, {
          timeout: 15_000,
        });
      }
    }
    const continuationTitle = `Đường đăng nhập ${run}`;
    await anonymous.goto(
      `/en/requests/new?q=${encodeURIComponent(continuationTitle)}&format=UNKNOWN`,
    );
    await anonymous
      .locator("main")
      .getByRole("link", { name: "Sign in", exact: true })
      .click();
    await anonymous.getByLabel("Email address").fill(reader.email);
    await anonymous
      .getByLabel("Password", { exact: true })
      .fill("Synthetic-e2e-password-17!");
    const continuedSignIn = anonymous.waitForResponse(
      (r) =>
        r.url().endsWith("/api/auth/sign-in/email") &&
        r.request().method() === "POST",
      { timeout: 45000 },
    );
    await anonymous
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    expect((await continuedSignIn).status()).toBe(200);
    await expect(anonymous).toHaveURL(/\/en\/requests\/new\?/, {
      timeout: 30000,
    });
    await expect(anonymous.getByLabel(en.title, { exact: true })).toHaveValue(
      continuationTitle,
    );
    await expect(
      anonymous.getByRole("combobox", { name: en.format, exact: true }),
    ).toHaveValue("UNKNOWN");
  } finally {
    try {
      requireTestDatabase();
      // Discover all partial POSTs by this run's registered emails, even when a
      // response assertion failed before recording its request or account ID.
      for (const account of accounts) {
        const users =
          await sql`select id from users where email = ${account.email}`;
        for (const user of users) {
          const userId = String(user.id);
          if (account.id) expect(userId).toBe(account.id);
          const requests =
            await sql`select id from work_requests where owner_user_id = ${userId}`;
          for (const request of requests) createdIds.add(String(request.id));
        }
      }
      for (const id of createdIds) {
        await sql`delete from work_request_supporters where request_id = ${id}`;
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
      await otherContext.close();
      await anonymousContext.close();
    }
  }
});
