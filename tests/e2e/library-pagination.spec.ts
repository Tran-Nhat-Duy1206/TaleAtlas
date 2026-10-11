import { test, expect } from "../helpers/browser-test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";
import {
  verifiedBrowserAccount,
  prepareAnonymousAuth,
  type BrowserAccount,
} from "../helpers/verified-browser-account";
import { libraryCopy } from "../../apps/web/src/components/library/copy";

test.describe.configure({ retries: 0 });
test("owner library native pagination and filters preserve unavailable facts without hidden metadata", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(360_000);
  const sql = createDatabase(requireTestDatabase()).client,
    run = randomUUID();
  const accounts: BrowserAccount[] = [],
    sourceId = randomUUID();
  const label = `Synthetic library pagination ${run}`,
    hidden = `PRIVATE DRAFT TITLE ${run}`;
  const t = libraryCopy.vi;
  const groups = run.replaceAll("-", "").slice(0, 20).match(/.{4}/g)!.join(":");
  await page
    .context()
    .setExtraHTTPHeaders({ "x-real-ip": `2001:db8:${groups}:7` });
  page.context().setDefaultTimeout(15_000);
  page.context().setDefaultNavigationTimeout(360_000);
  try {
    // Exercise real anonymous denial before registration, as the original
    // native fixtures do; cold settings compilation must not race login RSC.
    await prepareAnonymousAuth(page);
    const actor = await verifiedBrowserAccount(
      page,
      baseURL!,
      run,
      sql,
      accounts,
    );
    requireTestDatabase();
    // Owned synthetic setup only, not native catalog publication or 52 mutations
    // that would evade the unchanged shared 30/minute authenticated budget.
    await sql.begin(async (tx) => {
      await tx`insert into catalog_sources(id,label,citation) values(${sourceId},${label},'Invented UUID-owned native pagination setup, not production metadata.')`;
      await tx`insert into works(id,slug,primary_title,primary_title_language,format,visibility,source_id,search_text)
        select identity,'v3b-page-'||identity::text,${hidden},'en','NOVEL','DRAFT',${sourceId},'synthetic'
        from(select gen_random_uuid() identity from generate_series(1,52)) owned`;
      await tx`insert into library_entries(user_id,work_id,favorite)
        select ${actor.id!},id,(row_number() over(order by id)%2=0) from works where source_id=${sourceId}`;
      await tx`insert into library_events(entry_id,user_id,work_id,entry_revision,mutation_key,request_hash,kind,snapshot)
        select id,user_id,work_id,1,gen_random_uuid(),repeat('a',64),'ADD','{}'::jsonb from library_entries where user_id=${actor.id!} and work_id in(select id from works where source_id=${sourceId})`;
    });
    await page.goto("/vi/library?sort=TITLE_ASC");
    await expect(
      page.getByRole("heading", { name: t.title, level: 1, exact: true }),
    ).toBeVisible();
    await expect(page.locator("main")).not.toContainText(hidden);
    await expect(
      page.getByRole("link", { name: t.detail, exact: true }),
    ).toHaveCount(50);
    const first = await page
      .getByRole("link", { name: t.detail, exact: true })
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    await page.getByRole("link", { name: t.next, exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(
      page.getByRole("link", { name: t.detail, exact: true }),
    ).toHaveCount(2);
    const second = await page
      .getByRole("link", { name: t.detail, exact: true })
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    expect(new Set([...first, ...second]).size).toBe(52);
    await expect(
      page.getByRole("link", { name: t.next, exact: true }),
    ).toHaveCount(0);
    await page.getByRole("link", { name: t.previous, exact: true }).click();
    await expect(
      page.getByRole("link", { name: t.detail, exact: true }),
    ).toHaveCount(50);
    await page
      .getByRole("combobox", { name: t.favorite, exact: true })
      .selectOption("true");
    await page.getByRole("button", { name: t.apply, exact: true }).click();
    await expect(
      page.getByRole("link", { name: t.detail, exact: true }),
    ).toHaveCount(26);
    await expect(
      page.getByRole("link", { name: t.next, exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("combobox", { name: t.status, exact: true })
      .selectOption("READING");
    await page.getByRole("button", { name: t.apply, exact: true }).click();
    await expect(page.locator("main")).toContainText(t.empty);
    await expect(
      page.getByRole("link", { name: t.detail, exact: true }),
    ).toHaveCount(0);
    await page.goto("/vi/library?favorite=true&favorite=false");
    await expect(page.locator("main").getByRole("alert")).toHaveText(t.invalid);
    await expect(page.locator("main")).not.toContainText(hidden);
  } finally {
    requireTestDatabase();
    const emails = accounts.map((account) => account.email);
    if (emails.length) {
      const rows =
          await sql`select id from users where email=any(${emails}::text[])`,
        ids = rows.map((row) => String(row.id));
      if (ids.length) {
        await sql`delete from library_entries where user_id=any(${ids}::text[]) and work_id in(select id from works where source_id=${sourceId})`;
        await sql`delete from sessions where user_id=any(${ids}::text[])`;
        await sql`delete from accounts where user_id=any(${ids}::text[])`;
        await sql`delete from users where id=any(${ids}::text[]) and email=any(${emails}::text[])`;
      }
    }
    await sql`delete from works where source_id=${sourceId}`;
    await sql`delete from catalog_sources where id=${sourceId} and label=${label}`;
    await sql.end();
  }
});
