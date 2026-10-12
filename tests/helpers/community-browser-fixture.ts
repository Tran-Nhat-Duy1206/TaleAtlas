import { randomUUID } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "./test-database";
import {
  verifiedBrowserAccount,
  type BrowserAccount,
} from "./verified-browser-account";

/** Actual SMTP-verified browser accounts and signed catalog HTTP; no authority mock. */
export async function communityBrowserFixture(
  page: Page,
  browser: Browser,
  baseURL: string,
  participant = true,
) {
  const sql = createDatabase(requireTestDatabase()).client,
    run = randomUUID(),
    accounts: BrowserAccount[] = [];
  const source = `Synthetic V4B browser ${run}`,
    workIds: string[] = [];
  const address = run
    .replaceAll("-", "")
    .slice(0, 20)
    .match(/.{4}/g)!
    .join(":");
  await page
    .context()
    .setExtraHTTPHeaders({ "x-real-ip": `2001:db8:${address}:1` });
  const adminContext = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { "x-real-ip": `2001:db8:${address}:2` },
  });
  const anonymousContext = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { "x-real-ip": `2001:db8:${address}:3` },
  });
  const admin = await adminContext.newPage(),
    anonymous = await anonymousContext.newPage();
  for (const context of [page.context(), adminContext, anonymousContext]) {
    context.setDefaultTimeout(15_000);
    context.setDefaultNavigationTimeout(360_000);
  }
  let owner: BrowserAccount | undefined;
  async function close() {
    requireTestDatabase();
    for (const depth of [2, 1, 0])
      await sql`delete from community_contents where work_id=any(${workIds}::uuid[]) and kind='REPLY' and depth=${depth}`;
    await sql`delete from community_contents where work_id=any(${workIds}::uuid[])`;
    for (const table of [
      "catalog_field_evidence",
      "catalog_audit_events",
      "work_creators",
      "work_titles",
      "work_descriptions",
      "work_genres",
      "work_covers",
      "work_identifiers",
      "editions",
    ])
      await sql`delete from ${sql(table)} where work_id=any(${workIds}::uuid[])`;
    await sql`delete from work_relations where from_work_id=any(${workIds}::uuid[]) or to_work_id=any(${workIds}::uuid[])`;
    await sql`delete from works where id=any(${workIds}::uuid[])`;
    await sql`delete from catalog_sources where label=${source}`;
    for (const account of accounts) {
      await sql`delete from users where email=${account.email}`;
      await sql`delete from verifications where identifier like ${`%${account.email}%`}`;
      if (account.id)
        await sql`delete from rate_limits where key=${`catalog.write:${account.id}`}`;
    }
    await adminContext.close();
    await anonymousContext.close();
    await sql.end();
  }
  try {
    const administrator = await verifiedBrowserAccount(
      admin,
      baseURL,
      run,
      sql,
      accounts,
    );
    requireTestDatabase();
    await sql`update users set role='admin' where id=${administrator.id!} and email=${administrator.email}`;
    if (participant)
      owner = await verifiedBrowserAccount(page, baseURL, run, sql, accounts);
    const created = await admin.request.post("/api/admin/catalog/works", {
      timeout: 45_000,
      headers: { Origin: baseURL },
      data: {
        primaryTitle: `Synthetic public work ${run}`,
        primaryTitleLanguage: "en",
        format: "NOVEL",
        visibility: "PUBLISHED",
        publicationReviewAcknowledged: true,
        releaseStatus: "UNKNOWN",
        source: {
          label: source,
          citation: "Synthetic owned V4 native acceptance fixture only.",
        },
      },
    });
    expect(created.status()).toBe(200);
    const work = (await created.json()) as {
      id: string;
      slug: string;
      revision: number;
    };
    expect(work.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(work.slug).toBeTruthy();
    workIds.push(work.id);
    return {
      sql,
      run,
      source,
      work,
      owner,
      admin,
      anonymous,
      anonymousContext,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
