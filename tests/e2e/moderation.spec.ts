import { test, expect } from "../helpers/browser-test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";
import {
  verifiedBrowserAccount,
  prepareAnonymousAuth,
  deniedMutationBeforeBody,
  type BrowserAccount,
} from "../helpers/verified-browser-account";
test.describe.configure({ retries: 0 });
test("human candidate review publishes a verified searchable Work without exposing private input", async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(360_000);
  expect(baseURL).toBeTruthy();
  const sql = createDatabase(requireTestDatabase()).client;
  const run = randomUUID(),
    groups = run.replace(/-/g, "").slice(0, 20).match(/.{4}/g)!.join(":");
  await page
    .context()
    .setExtraHTTPHeaders({ "x-real-ip": `2001:db8:${groups}:1` });
  const adminContext = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { "x-real-ip": `2001:db8:${groups}:2` },
  });
  const anonContext = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { "x-real-ip": `2001:db8:${groups}:3` },
  });
  const admin = await adminContext.newPage(),
    anon = await anonContext.newPage();
  for (const target of [page, admin, anon]) {
    target.context().setDefaultTimeout(15_000);
    target.context().setDefaultNavigationTimeout(360_000);
  }
  const accounts: BrowserAccount[] = [];
  let requestId: string | undefined, workId: string | undefined;
  const rawTitle = `Private raw proposal ${run}`,
    privateNote = `PRIVATE OWNERSHIP NOTE ${run}`,
    verifiedTitle = `Human verified Tale ${run}`;
  const sourceLabel = `Synthetic browser review ${run}`;
  try {
    await prepareAnonymousAuth(anon);
    // Actual private detail route must render only its anonymous sign-in notice.
    const anonymousDetail = await anon.goto(`/en/requests/${randomUUID()}`);
    expect(anonymousDetail?.status()).toBe(200);
    await expect(
      anon.getByText("Sign in to submit or view requests.", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(anon.locator("main dl, main ol")).toHaveCount(0);
    await expect(anon.locator("main")).not.toContainText(privateNote);
    await deniedMutationBeforeBody(
      anon,
      baseURL!,
      `/api/admin/requests/${randomUUID()}/review`,
    );
    await verifiedBrowserAccount(page, baseURL!, run, sql, accounts);
    const actor = await verifiedBrowserAccount(
      admin,
      baseURL!,
      run,
      sql,
      accounts,
    );
    requireTestDatabase();
    await sql`update users set role = 'admin' where id = ${actor.id!} and email = ${actor.email} and email_verified = true`;
    await page.goto("/en/requests/new");
    await page
      .getByRole("textbox", { name: "Title", exact: true })
      .fill(rawTitle);
    await page
      .getByRole("combobox", { name: "Format", exact: true })
      .selectOption("NOVEL");
    await page.locator('[name="notes"]').fill(privateNote);
    await page.getByRole("checkbox").check();
    const destination = page.waitForResponse(
      (r) =>
        /^\/en\/requests\/[0-9a-f-]{36}$/.test(new URL(r.url()).pathname) &&
        r.request().method() === "GET",
      { timeout: 45_000 },
    );
    const created = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/requests" &&
        r.request().method() === "POST",
      { timeout: 45_000 },
    );
    await page
      .getByRole("button", { name: "Submit request", exact: true })
      .click();
    const createdReply = await created;
    expect(createdReply.status()).toBe(200);
    expect(createdReply.request().postDataJSON().details.notes).toBe(
      privateNote,
    );
    const detail = await destination;
    expect(detail.status()).toBe(200);
    requestId = new URL(detail.url()).pathname.split("/").at(-1)!;
    await expect(page).toHaveURL(new RegExp(`/en/requests/${requestId}$`), {
      timeout: 15_000,
    });
    await admin.goto(`/en/admin/ingestion?requestId=${requestId}`);
    const processing = admin.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/admin/ingestion/process" &&
        r.request().method() === "POST",
      { timeout: 45_000 },
    );
    await admin
      .getByRole("button", {
        name: "Process selected queued request",
        exact: true,
      })
      .click();
    expect((await processing).status()).toBe(200);
    const form = admin.getByRole("form", { name: "Review candidate" });
    await expect(form).toBeVisible({ timeout: 15_000 });
    await expect(admin.locator('[data-testid="ingestion-state"]')).toHaveText(
      "NEEDS_REVIEW",
      { timeout: 15_000 },
    );
    const verifiedWork = {
      primaryTitle: verifiedTitle,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      titles: [
        { title: `Tên đã xác minh ${run}`, language: "vi", kind: "PRIMARY" },
      ],
      source: {
        label: sourceLabel,
        citation:
          "Human-inspected synthetic bibliographic evidence; not raw request input.",
      },
    };
    await form
      .getByRole("textbox", { name: "Review reason" })
      .fill("Reviewed identity independently and inspected source evidence.");
    await form
      .getByRole("textbox", {
        name: "Manually verified Work JSON (V1 contract)",
      })
      .fill(JSON.stringify(verifiedWork));
    for (const checkbox of await form.getByRole("checkbox").all())
      await checkbox.check();
    const reviewed = admin.waitForResponse(
      (r) =>
        new URL(r.url()).pathname ===
          `/api/admin/requests/${requestId}/review` &&
        r.request().method() === "POST",
      { timeout: 45_000 },
    );
    await form.getByRole("button", { name: "Submit review decision" }).click();
    const reviewReply = await reviewed;
    expect(reviewReply.status()).toBe(200);
    expect(await reviewReply.request().headerValue("origin")).toBe(baseURL);
    expect(reviewReply.request().postDataJSON()).toMatchObject({
      action: "APPROVE",
      identityReviewAcknowledged: true,
      publicationReviewAcknowledged: true,
      work: verifiedWork,
    });
    await expect(admin.locator('[data-testid="ingestion-state"]')).toHaveText(
      "APPROVED",
      { timeout: 15_000 },
    );
    const owned = await page.request.get(`/api/requests/${requestId}`, {
      timeout: 30_000,
    });
    expect(owned.status()).toBe(200);
    const visible = await owned.json();
    expect(visible.kind).toBe("OWNED");
    const request = visible.request;
    expect(request.state).toBe("APPROVED");
    workId = request.resultingWorkId;
    expect(workId).toMatch(/^[0-9a-f-]{36}$/);
    expect(request.events.at(-1).payload).toEqual({
      reason: "Reviewed identity independently and inspected source evidence.",
      resultingWorkId: workId,
    });
    const [work] =
      await sql`select slug, visibility from works where id = ${workId!}`;
    expect(work?.visibility).toBe("PUBLISHED");
    await page.reload();
    await expect(page.locator("main ol")).toContainText(
      "Reviewed identity independently and inspected source evidence.",
      { timeout: 15_000 },
    );
    await expect(
      page.getByRole("link", { name: "View published work", exact: true }),
    ).toHaveAttribute("href", `/en/works/${work!.slug}`);
    await anon.goto(`/en/works?q=${encodeURIComponent(verifiedTitle)}`);
    await expect(
      anon.getByRole("link", { name: verifiedTitle, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await anon.goto(`/en/works/${work!.slug}`);
    await expect(anon.getByRole("heading", { level: 1 })).toHaveText(
      verifiedTitle,
      { timeout: 15_000 },
    );
    await expect(anon.locator("main")).not.toContainText(rawTitle, {
      timeout: 15_000,
    });
    await expect(anon.locator("main")).not.toContainText(privateNote, {
      timeout: 15_000,
    });
    await expect(anon.locator("main")).not.toContainText(actor.email, {
      timeout: 15_000,
    });
    await anon.goto("/vi/recently-added");
    await expect(anon.getByRole("heading", { level: 1 })).toHaveText(
      "Mới thêm",
      { timeout: 15_000 },
    );
    await expect(
      anon.getByRole("link", { name: `Tên đã xác minh ${run}`, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    const [publication] =
      await sql`select min(timestamp) as published_at from catalog_audit_events where work_id = ${workId!} and changes->>'visibility' = 'PUBLISHED' and changes->>'publicationReviewAcknowledged' = 'true'`;
    const publicationStamp = new Date(publication!.published_at).toISOString();
    const recentClock = anon
      .getByTestId("recent-work")
      .filter({
        has: anon.getByRole("link", {
          name: `Tên đã xác minh ${run}`,
          exact: true,
        }),
      })
      .locator("time");
    await expect(recentClock).toHaveAttribute("datetime", publicationStamp);
    await expect(recentClock).toHaveText(publicationStamp.slice(0, 10));
    expect(
      (
        await anon.request.get(`/api/requests/${requestId}`, {
          timeout: 30_000,
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await admin.request.post(`/api/admin/requests/${requestId}/review`, {
          headers: { Origin: baseURL! },
          data: reviewReply.request().postDataJSON(),
          timeout: 30_000,
        })
      ).status(),
    ).toBe(409);
  } catch (error) {
    // One failure-time observation, not polling, retrying or replacing native evidence.
    requireTestDatabase();
    const requestState =
      await sql`select state, revision, input_revision, resulting_work_id is not null as has_result from work_requests where details->>'title' = ${rawTitle}`;
    const workState =
      await sql`select visibility, revision from works where primary_title = ${verifiedTitle}`;
    const waits =
      await sql`select state, wait_event_type, wait_event, count(*)::int as connections from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() group by state, wait_event_type, wait_event`;
    await test.info().attach("sanitized-failure-database-state", {
      body: Buffer.from(JSON.stringify({ requestState, workState, waits })),
      contentType: "application/json",
    });
    throw error;
  } finally {
    requireTestDatabase();
    // Cleanup is run-scoped even if a real submission succeeded before navigation failed.
    if (!requestId) {
      const [created] =
        await sql`select id from work_requests where details->>'title' = ${rawTitle}`;
      requestId = created ? String(created.id) : undefined;
    }
    if (!workId) {
      const [created] =
        await sql`select id from works where primary_title = ${verifiedTitle}`;
      workId = created ? String(created.id) : undefined;
    }
    if (requestId) {
      await sql`delete from ingestion_candidates where request_id = ${requestId}`;
      await sql`delete from ingestion_jobs where request_id = ${requestId}`;
      await sql`delete from request_events where request_id = ${requestId}`;
      await sql`delete from work_request_supporters where request_id = ${requestId}`;
      await sql`delete from work_requests where id = ${requestId}`;
    }
    if (workId) {
      await sql`delete from catalog_field_evidence where work_id = ${workId}`;
      await sql`delete from catalog_audit_events where work_id = ${workId}`;
      await sql`delete from work_titles where work_id = ${workId}`;
      await sql`delete from works where id = ${workId}`;
      await sql`delete from catalog_sources where label = ${sourceLabel}`;
    }
    for (const account of accounts) {
      await sql`delete from users where email = ${account.email}`;
      await sql`delete from verifications where identifier like ${`%${account.email}%`}`;
      if (account.id)
        await sql`delete from rate_limits where key = ${`catalog.write:${account.id}`}`;
    }
    await adminContext.close();
    await anonContext.close();
    await sql.end();
  }
});
