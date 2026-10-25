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
    // This real newly verified actor has no library rows before the existing
    // fixture seed. A shared public catalog is not assumed to be empty.
    const unseeded =
      await sql`select count(*)::int as total from library_entries where user_id=${actor.id!}`;
    expect(unseeded[0]!.total).toBe(0);
    for (const locale of ["en", "vi"] as const) {
      const copy = libraryCopy[locale];
      await page.setViewportSize({
        width: locale === "en" ? 320 : 390,
        height: 844,
      });
      // Sorting is not an active filter and must still classify genuine empty.
      await page.goto(`/${locale}/library?sort=TITLE_ASC`);
      await expect(page.locator("main")).toContainText(copy.emptyLibrary);
      await expect(page.locator("main")).toContainText(copy.emptyLibraryText);
      await expect(page.locator("main")).not.toContainText(copy.empty);
      await expect(page.locator("main")).not.toContainText(copy.emptyPage);
      await expect(page.locator("main")).not.toContainText(copy.loadError);
      await expect(page.locator("main")).not.toContainText(
        copy.accessUnconfirmed,
      );
      await expect(
        page.getByRole("link", { name: copy.detail, exact: true }),
      ).toHaveCount(0);
      const browseCatalog = page.getByRole("link", {
        name: copy.browseCatalog,
        exact: true,
      });
      await expect(browseCatalog).toHaveCount(1);
      await expect(browseCatalog).toHaveAttribute("href", `/${locale}/works`);
      await expect(
        page.getByRole("link", { name: copy.showFullLibrary, exact: true }),
      ).toHaveCount(0);
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => {
          document.documentElement.classList.toggle("dark", value === "dark");
        }, theme);
        await browseCatalog.focus();
        await expect(browseCatalog).toBeFocused();
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth + 1,
          ),
        ).toBe(true);
      }
      await browseCatalog.click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/works$`));
      // On this still-unseeded actor false alone must select filtered empty.
      await page.goto(`/${locale}/library?favorite=false`);
      await expect(page.locator("main")).toContainText(copy.empty);
      await expect(page.locator("main")).not.toContainText(copy.emptyLibrary);
      await expect(
        page.getByRole("link", { name: copy.showFullLibrary, exact: true }),
      ).toHaveAttribute("href", `/${locale}/library`);
    }
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
    for (const locale of ["en", "vi"] as const) {
      const copy = libraryCopy[locale];
      await page.setViewportSize({
        width: locale === "en" ? 320 : 390,
        height: 844,
      });
      // false is an active favorite filter, not equivalent to no filter. All 52
      // owned rows are Plan to read, so READING is a real filtered-zero result.
      await page.goto(
        `/${locale}/library?status=READING&favorite=false&sort=TITLE_ASC`,
      );
      await expect(page.locator("main")).toContainText(copy.empty);
      await expect(page.locator("main")).not.toContainText(copy.emptyLibrary);
      await expect(page.locator("main")).not.toContainText(copy.emptyPage);
      await expect(page.locator("main")).not.toContainText(hidden);
      await expect(
        page.getByRole("link", { name: copy.detail, exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("combobox", { name: copy.favorite, exact: true }),
      ).toHaveValue("false");
      const fullLibrary = page.getByRole("link", {
        name: copy.showFullLibrary,
        exact: true,
      });
      await expect(fullLibrary).toHaveCount(1);
      await expect(fullLibrary).toHaveAttribute("href", `/${locale}/library`);
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => {
          document.documentElement.classList.toggle("dark", value === "dark");
        }, theme);
        await fullLibrary.focus();
        await expect(fullLibrary).toBeFocused();
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth + 1,
          ),
        ).toBe(true);
      }
      await fullLibrary.click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/library$`));
      await expect(
        page.getByRole("combobox", { name: copy.status, exact: true }),
      ).toHaveValue("");
      await expect(
        page.getByRole("combobox", { name: copy.favorite, exact: true }),
      ).toHaveValue("");
      await expect(
        page.getByRole("combobox", { name: copy.sort, exact: true }),
      ).toHaveValue("UPDATED_DESC");
      await expect(
        page.getByRole("link", { name: copy.detail, exact: true }),
      ).toHaveCount(50);

      // Valid page 3 is beyond both the known 52-row library and this real
      // 26-row subset. Keep status, false and sort in first-page recovery.
      await page.goto(
        `/${locale}/library?page=3&status=WANT_TO_READ&favorite=false&sort=TITLE_ASC`,
      );
      await expect(page.locator("main")).toContainText(copy.emptyPage);
      await expect(page.locator("main")).not.toContainText(copy.empty);
      await expect(page.locator("main")).not.toContainText(copy.emptyLibrary);
      await expect(page.locator("main")).not.toContainText(hidden);
      await expect(
        page.getByRole("link", { name: copy.detail, exact: true }),
      ).toHaveCount(0);
      const firstPage = page.getByRole("link", {
        name: copy.firstPage,
        exact: true,
      });
      await expect(firstPage).toHaveCount(1);
      const href = await firstPage.getAttribute("href");
      expect(href).not.toBeNull();
      const recovery = new URL(href!, page.url());
      expect(recovery.pathname).toBe(`/${locale}/library`);
      expect(Object.fromEntries(recovery.searchParams)).toEqual({
        page: "1",
        status: "WANT_TO_READ",
        favorite: "false",
        sort: "TITLE_ASC",
      });
      await firstPage.click();
      await expect(page).toHaveURL(recovery.href);
      await expect(
        page.getByRole("link", { name: copy.detail, exact: true }),
      ).toHaveCount(26);
      await expect(
        page.getByRole("link", { name: copy.unavailable, exact: true }),
      ).toHaveCount(26);
      await expect(
        page.getByRole("link", { name: copy.catalog, exact: true }),
      ).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText(hidden);
    }
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
