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
test("verified correction stays private until an attested exact-revision human review", async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(360_000);
  expect(baseURL).toBeTruthy();
  const sql = createDatabase(requireTestDatabase()).client,
    run = randomUUID();
  const groups = run.replace(/-/g, "").slice(0, 20).match(/.{4}/g)!.join(":");
  await page
    .context()
    .setExtraHTTPHeaders({ "x-real-ip": `2001:db8:${groups}:4` });
  const adminContext = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { "x-real-ip": `2001:db8:${groups}:5` },
  });
  const anonContext = await browser.newContext({ baseURL });
  const admin = await adminContext.newPage(),
    anon = await anonContext.newPage();
  for (const context of [page.context(), adminContext, anonContext]) {
    context.setDefaultTimeout(15_000);
    context.setDefaultNavigationTimeout(360_000);
  }
  const accounts: BrowserAccount[] = [];
  const original = `Synthetic curated title ${run}`,
    proposed = `Reviewed corrected title ${run}`,
    source = `Synthetic original source ${run}`,
    citationLabel = `Synthetic proposed citation ${run}`,
    reason = `PRIVATE REVIEW REASON ${run}`;
  let workId: string | undefined, suggestionId: string | undefined;
  try {
    await prepareAnonymousAuth(anon);
    await deniedMutationBeforeBody(
      anon,
      baseURL!,
      `/api/admin/edit-suggestions/${randomUUID()}/review`,
    );
    await deniedMutationBeforeBody(
      anon,
      baseURL!,
      `/api/catalog/works/${randomUUID()}/suggestions`,
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
    // Synthetic setup uses the real authorized V1 catalog API; it is not native publication proof.
    const seed = await admin.request.post("/api/admin/catalog/works", {
      timeout: 45_000,
      headers: { Origin: baseURL! },
      data: {
        primaryTitle: original,
        primaryTitleLanguage: "en",
        format: "NOVEL",
        visibility: "PUBLISHED",
        releaseStatus: "UNKNOWN",
        publicationReviewAcknowledged: true,
        titles: [{ title: `Tên gốc ${run}`, kind: "ALIAS", language: "vi" }],
        source: {
          label: source,
          citation: "Synthetic V1 setup source; no live publisher record.",
        },
      },
    });
    expect(seed.status()).toBe(200);
    const work = await seed.json();
    workId = work.id;
    expect(work.revision).toBe(1);
    await page.goto(`/en/works/${work.slug}/suggest-edit`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Suggest a correction",
      { timeout: 15_000 },
    );
    await expect(page.getByLabel("Base work revision")).toHaveValue("1");
    await page.getByLabel("Field to correct").selectOption("primaryTitle");
    await page.getByLabel("Proposed value").fill(proposed);
    await page.getByLabel("Source label").fill(citationLabel);
    await page
      .getByLabel("Citation", { exact: true })
      .fill(
        "Synthetic corrected-title evidence manually reviewed independently.",
      );
    const destination = page.waitForResponse(
      (r) =>
        /^\/en\/edit-suggestions\/[0-9a-f-]{36}$/.test(
          new URL(r.url()).pathname,
        ) && r.request().method() === "GET",
      { timeout: 45_000 },
    );
    const submitted = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname ===
          `/api/catalog/works/${workId}/suggestions` &&
        r.request().method() === "POST",
      { timeout: 45_000 },
    );
    await page
      .getByRole("button", { name: "Submit suggestion", exact: true })
      .click();
    const submission = await submitted;
    expect(submission.status()).toBe(200);
    expect(await submission.request().headerValue("origin")).toBe(baseURL);
    expect(submission.request().postDataJSON()).toMatchObject({
      baseWorkRevision: 1,
      patch: { primaryTitle: proposed },
      citation: { label: citationLabel },
    });
    const detail = await destination;
    expect(detail.status()).toBe(200);
    suggestionId = new URL(detail.url()).pathname.split("/").at(-1)!;
    await expect(page).toHaveURL(
      new RegExp(`/en/edit-suggestions/${suggestionId}$`),
      { timeout: 15_000 },
    );
    await expect(page.locator("main")).toContainText("SUBMITTED", {
      timeout: 15_000,
    });
    const before = await anon.request.get(`/api/catalog/works/${work.slug}`, {
      timeout: 30_000,
    });
    expect(before.status()).toBe(200);
    expect((await before.json()).primaryTitle).toBe(original);
    expect(
      (
        await anon.request.get(`/api/edit-suggestions/${suggestionId}`, {
          timeout: 30_000,
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await admin.request.get(`/api/edit-suggestions/${suggestionId}`, {
          timeout: 30_000,
        })
      ).status(),
    ).toBe(404);
    await admin.goto("/en/admin/edit-suggestions");
    const article = admin.locator("article").filter({ hasText: proposed });
    await expect(
      article.getByRole("heading", { name: "Current metadata", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(article).toContainText(original);
    await article.getByLabel("Review edit suggestions").selectOption("APPROVE");
    await article.getByLabel("Review reason").fill(reason);
    await article
      .getByLabel("I reviewed the metadata and identity changes")
      .check();
    await article.getByLabel("I reviewed publication readiness").check();
    const reviewed = admin.waitForResponse(
      (r) =>
        new URL(r.url()).pathname ===
          `/api/admin/edit-suggestions/${suggestionId}/review` &&
        r.request().method() === "POST",
      { timeout: 45_000 },
    );
    await article
      .getByRole("button", { name: "Review edit suggestions", exact: true })
      .click();
    const review = await reviewed;
    expect(review.status()).toBe(200);
    expect(review.request().postDataJSON()).toEqual({
      decision: "APPROVE",
      revision: 1,
      baseWorkRevision: 1,
      reason,
      metadataReviewAcknowledged: true,
      publicationReviewAcknowledged: true,
    });
    await expect(article).toContainText("APPROVED", { timeout: 15_000 });
    await page.goto(`/vi/edit-suggestions/${suggestionId}`);
    await expect(page.locator("main")).toContainText(reason, {
      timeout: 15_000,
    });
    await expect(page.locator("main ol li")).toHaveCount(2);
    await expect(page.locator("main")).toContainText(
      "Phiên bản tác phẩm đã áp dụng: 2",
    );
    await anon.goto(`/en/works?q=${encodeURIComponent(proposed)}`);
    await expect(
      anon.getByRole("link", { name: proposed, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await anon.goto(`/en/works/${work.slug}`);
    await expect(anon.getByRole("heading", { level: 1 })).toHaveText(proposed, {
      timeout: 15_000,
    });
    await expect(anon.locator("main")).not.toContainText(reason);
    await expect(anon.locator("main")).not.toContainText(suggestionId!);
    const [persisted] =
      await sql`select revision, slug from works where id = ${workId!}`;
    expect(persisted).toMatchObject({ revision: 2, slug: work.slug });
    const aliases =
      await sql`select title from work_titles where work_id = ${workId!} and language = 'vi'`;
    expect(aliases.some((r) => r.title === `Tên gốc ${run}`)).toBe(true);
  } finally {
    requireTestDatabase();
    if (workId) {
      await sql`delete from edit_suggestion_events where suggestion_id in (select id from edit_suggestions where work_id = ${workId})`;
      await sql`delete from edit_suggestions where work_id = ${workId}`;
      await sql`delete from catalog_field_evidence where work_id = ${workId}`;
      await sql`delete from catalog_audit_events where work_id = ${workId}`;
      await sql`delete from work_titles where work_id = ${workId}`;
      await sql`delete from works where id = ${workId}`;
    }
    await sql`delete from catalog_sources where label in (${source}, ${citationLabel})`;
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
