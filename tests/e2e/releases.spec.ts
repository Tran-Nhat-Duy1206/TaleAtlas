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
test("a manually evidenced exact release is public only while its reviewed Work is published", async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(360_000);
  expect(baseURL).toBeTruthy();
  const sql = createDatabase(requireTestDatabase()).client,
    run = randomUUID(),
    accounts: BrowserAccount[] = [];
  const groups = run.replace(/-/g, "").slice(0, 20).match(/.{4}/g)!.join(":");
  await page
    .context()
    .setExtraHTTPHeaders({ "x-real-ip": `2001:db8:${groups}:6` });
  const anonContext = await browser.newContext({ baseURL }),
    anon = await anonContext.newPage();
  anonContext.setDefaultTimeout(15_000);
  anonContext.setDefaultNavigationTimeout(360_000);
  page.context().setDefaultTimeout(15_000);
  page.context().setDefaultNavigationTimeout(360_000);
  const sourceLabel = `Synthetic calendar setup ${run}`,
    releaseSource = `Synthetic human calendar source ${run}`,
    label = `Synthetic exact-day edition ${run}`,
    citation = `Synthetic exact-date evidence ${run}; this is not a live book release assertion.`;
  let workId: string | undefined;
  try {
    await prepareAnonymousAuth(anon);
    await deniedMutationBeforeBody(
      anon,
      baseURL!,
      "/api/admin/catalog/releases",
    );
    const actor = await verifiedBrowserAccount(
      page,
      baseURL!,
      run,
      sql,
      accounts,
    );
    requireTestDatabase();
    await sql`update users set role = 'admin' where id = ${actor.id!} and email = ${actor.email} and email_verified = true`;
    // Real authorized V1 API fixture, not a native Work-creation claim.
    const created = await page.request.post("/api/admin/catalog/works", {
      timeout: 45_000,
      headers: { Origin: baseURL! },
      data: {
        primaryTitle: `Synthetic calendar work ${run}`,
        primaryTitleLanguage: "en",
        format: "NOVEL",
        visibility: "PUBLISHED",
        publicationReviewAcknowledged: true,
        releaseStatus: "UNKNOWN",
        publicationYear: 2024,
        source: {
          label: sourceLabel,
          citation:
            "Synthetic setup with year only; does not establish a calendar day.",
        },
      },
    });
    expect(created.status()).toBe(200);
    const work = await created.json();
    workId = work.id;
    expect(
      (
        await sql`select count(*)::int as n from catalog_releases where work_id = ${workId!}`
      )[0]?.n,
    ).toBe(0);
    await page.goto(`/en/admin/releases?workId=${workId}`);
    await expect(page.getByLabel("Reviewed work revision")).toHaveValue("1", {
      timeout: 15_000,
    });
    const check = page.getByRole("checkbox", {
      name: "I manually verified this exact release day against the cited permitted source.",
    });
    await expect(check).not.toBeChecked();
    await page.getByLabel("Exact release date").fill("2024-02-29");
    await page.getByLabel("Release language code").fill("vi");
    await page.getByLabel("Release label", { exact: true }).fill(label);
    await page.getByLabel("Evidence label").fill(releaseSource);
    await page.getByLabel("Evidence citation").fill(citation);
    await check.check();
    const recorded = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/admin/catalog/releases" &&
        r.request().method() === "POST",
      { timeout: 45_000 },
    );
    await page
      .getByRole("button", { name: "Record verified release", exact: true })
      .click();
    const reply = await recorded;
    expect(reply.status()).toBe(200);
    expect(await reply.request().headerValue("origin")).toBe(baseURL);
    expect(reply.request().postDataJSON()).toMatchObject({
      workId,
      workRevision: 1,
      releaseDate: "2024-02-29",
      language: "vi",
      label,
      source: { label: releaseSource, citation },
      releaseReviewAcknowledged: true,
    });
    await expect(page.getByRole("status")).toContainText(
      "Verified release recorded. Confirmed record ID:",
      { timeout: 15_000 },
    );
    await anon.goto("/vi/releases?from=2024-02-29&to=2024-02-29");
    await expect(anon.locator("main")).toContainText(label, {
      timeout: 15_000,
    });
    await expect(anon.locator("main")).toContainText(citation);
    await expect(
      anon.locator("main time[datetime='2024-02-29']"),
    ).toBeVisible();
    await expect(anon.locator("main")).not.toContainText(actor.email);
    expect(
      (await sql`select revision from works where id = ${workId!}`)[0]
        ?.revision,
    ).toBe(1);
    const hidden = await page.request.post(
      `/api/admin/catalog/works/${workId}/visibility`,
      {
        timeout: 30_000,
        headers: { Origin: baseURL! },
        data: { revision: 1, visibility: "HIDDEN" },
      },
    );
    expect(hidden.status()).toBe(200);
    await anon.reload();
    await expect(anon.locator("main")).not.toContainText(label, {
      timeout: 15_000,
    });
    await expect(anon.locator("main")).not.toContainText(citation);
    const releases = await anon.request.get(
      "/api/catalog/releases?from=2024-02-29&to=2024-02-29",
      { timeout: 30_000 },
    );
    expect(releases.status()).toBe(200);
    expect(
      (await releases.json()).items.some(
        (r: { work: { id: string } }) => r.work.id === workId,
      ),
    ).toBe(false);
  } finally {
    requireTestDatabase();
    if (workId) {
      await sql`delete from catalog_releases where work_id = ${workId}`;
      await sql`delete from catalog_field_evidence where work_id = ${workId}`;
      await sql`delete from catalog_audit_events where work_id = ${workId}`;
      await sql`delete from work_titles where work_id = ${workId}`;
      await sql`delete from works where id = ${workId}`;
    }
    await sql`delete from catalog_sources where label in (${sourceLabel},${releaseSource})`;
    for (const account of accounts) {
      await sql`delete from users where email = ${account.email}`;
      await sql`delete from verifications where identifier like ${`%${account.email}%`}`;
      if (account.id)
        await sql`delete from rate_limits where key = ${`catalog.write:${account.id}`}`;
    }
    await anonContext.close();
    await sql.end();
  }
});
