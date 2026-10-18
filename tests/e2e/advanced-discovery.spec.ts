import { randomUUID } from "node:crypto";
import { test, expect } from "../helpers/browser-test";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";
import { normalizeTitle } from "../../apps/web/src/features/catalog/contracts";
import { publicCopy } from "../../apps/web/src/components/catalog/query";
import { catalogDiscoveryCopy } from "../../apps/web/src/lib/catalog-discovery-i18n";

// Public read scenario: real SQL-owned synthetic catalog facts and real SSR/GET
// navigation. No fabricated sessions, route interception, providers or fixtures
// in another database/worktree. Teardown removes only these UUID-owned rows.
test("advanced discovery composes exact public filters across bilingual native navigation", async ({
  page,
}, testInfo) => {
  const { client: sql } = createDatabase(requireTestDatabase());
  const run = randomUUID();
  const sourceId = randomUUID();
  const genre = `discovery-${run}`;
  const hiddenGenre = `private-${run}`;
  const ids = Array.from({ length: 6 }, () => randomUUID());
  const slugs = ids.map((id) => `discovery-${id}`);
  const names = { en: `Synthetic genre ${run}`, vi: `Thể loại hư cấu ${run}` };
  const privateLabel = `Unpublished taxonomy ${run}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.name));
  try {
    await sql`insert into catalog_sources (id,label,citation) values (${sourceId}, ${`Discovery browser ${run}`}, 'Entirely invented owned test metadata; no external source or production fact.')`;
    await sql`insert into genres (slug,name_en,name_vi) values (${genre},${names.en},${names.vi}),(${hiddenGenre},${privateLabel},${privateLabel})`;
    for (let n = 0; n < ids.length; n++) {
      const title = `Đường khám phá ${run} ${n}`;
      const enTitle = `Discovery path ${run} ${n}`;
      const visibility = n === 5 ? "HIDDEN" : "PUBLISHED";
      const language = n === 4 ? "ja-JP" : "ja";
      const status = n === 3 ? "ONGOING" : "COMPLETED";
      await sql`insert into works (id,slug,primary_title,primary_title_language,format,visibility,release_status,original_language,source_id,search_text) values (${ids[n]!},${slugs[n]!},${title},'vi','NOVEL',${visibility},${status},${language},${sourceId},${normalizeTitle(`${title} ${enTitle} ${names.en} ${names.vi}`)})`;
      await sql`insert into work_titles (work_id,title,language,kind,normalized,source_id) values (${ids[n]!},${title},'vi','PRIMARY',${normalizeTitle(title)},${sourceId}),(${ids[n]!},${enTitle},'en','PRIMARY',${normalizeTitle(enTitle)},${sourceId})`;
      await sql`insert into work_genres (work_id,genre_slug,source_id) values (${ids[n]!},${n === 5 ? hiddenGenre : genre},${sourceId})`;
    }
    await sql`insert into work_relations (from_work_id,to_work_id,type,source_id) values (${ids[0]!},${ids[1]!},'SHARED_UNIVERSE',${sourceId}),(${ids[0]!},${ids[5]!},'OTHER',${sourceId})`;

    const query = new URLSearchParams({ q: run, pageSize: "1" });
    await page.goto(`/en/works?${query}`);
    const en = catalogDiscoveryCopy.en;
    await page.getByLabel(publicCopy.en.search).fill(run);
    await page.locator('select[name="format"]').selectOption("NOVEL");
    await page.getByLabel(en.genre, { exact: true }).selectOption(genre);
    await page.getByLabel(en.originalLanguage, { exact: true }).fill("ja");
    await page
      .getByRole("combobox", { name: en.releaseStatus, exact: true })
      .selectOption("COMPLETED");
    await page.getByLabel(publicCopy.en.search).press("Enter");
    await expect(page.locator('select[name="genre"]')).toHaveValue(genre);
    await expect(page.getByRole("status")).toContainText("3");
    await expect(page.locator('select[name="genre"]')).not.toContainText(
      privateLabel,
    );
    const submitted = new URL(page.url());
    for (const [key, value] of Object.entries({
      q: run,
      format: "NOVEL",
      genre,
      originalLanguage: "ja",
      releaseStatus: "COMPLETED",
      pageSize: "1",
    })) {
      expect(submitted.searchParams.get(key)).toBe(value);
    }
    expect(submitted.searchParams.has("page")).toBe(false);
    const firstTitle = await page.locator("article h2").first().textContent();
    await page
      .getByRole("link", { name: publicCopy.en.next, exact: true })
      .click();
    await expect(page).toHaveURL(/page=2/);
    expect(await page.locator("article h2").first().textContent()).not.toBe(
      firstTitle,
    );
    await page.reload();
    await expect(
      page.getByLabel(en.originalLanguage, { exact: true }),
    ).toHaveValue("ja");
    await expect(
      page.getByRole("combobox", { name: en.releaseStatus, exact: true }),
    ).toHaveValue("COMPLETED");
    await page.evaluate(() => {
      window.location.hash = "discovery-state";
    });
    const localeLink = page.locator('a[lang="vi"]');
    await expect(localeLink).toHaveAttribute(
      "href",
      /originalLanguage=ja.*releaseStatus=COMPLETED/,
    );
    await localeLink.click();
    await expect(page).toHaveURL(/\/vi\/works\?/);
    expect(new URL(page.url()).hash).toBe("#discovery-state");
    const vi = catalogDiscoveryCopy.vi;
    await expect(
      page.getByLabel(vi.genre, { exact: true }).locator("option:checked"),
    ).toHaveText(names.vi);
    await expect(
      page.getByLabel(vi.originalLanguage, { exact: true }),
    ).toHaveValue("ja");
    expect(new URL(page.url()).searchParams.get("page")).toBe("2");
    await page
      .getByRole("link", { name: publicCopy.vi.previous, exact: true })
      .click();
    await expect(page).toHaveURL(/page=1/);
    await page.goBack();
    await expect(page).toHaveURL(/page=2/);
    await page.getByLabel(publicCopy.vi.search).press("Enter");
    expect(new URL(page.url()).searchParams.has("page")).toBe(false);
    await expect(page.getByRole("status")).toContainText("3");

    // Exact original language: ja-JP is not inferred to be ja.
    await page.getByLabel(vi.originalLanguage, { exact: true }).fill("ja-JP");
    await page.getByLabel(publicCopy.vi.search).press("Enter");
    await expect(page.getByRole("status")).toContainText("1");
    await page.getByLabel(vi.originalLanguage, { exact: true }).fill("zz");
    await page.getByLabel(publicCopy.vi.search).press("Enter");
    await expect(
      page.getByRole("heading", { name: publicCopy.vi.empty, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(vi.invalidQuery, { exact: true })).toHaveCount(
      0,
    );

    await page.goto(`/vi/works?releaseStatus=NOT_A_STATUS&genre=${genre}`);
    await expect(
      page.getByText(vi.invalidQuery, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: vi.releaseStatus, exact: true }),
    ).toHaveValue("");
    await page
      .getByRole("link", { name: publicCopy.vi.reset, exact: true })
      .click();
    await expect(page).toHaveURL(/\/vi\/works$/);
    await expect(page.locator('input[name="pageSize"]')).toHaveValue("20");

    // Existing related and genre browsing remain functional, never hidden links.
    await page.goto(`/en/works/${slugs[0]!}`);
    await expect(
      page.getByRole("link", { name: `Discovery path ${run} 1`, exact: true }),
    ).toBeVisible();
    await expect(page.locator(`a[href$="/${slugs[5]!}"]`)).toHaveCount(0);
    await page.getByRole("link", { name: names.en, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`genre=${genre}`));
    await expect(page.getByLabel(en.genre, { exact: true })).toHaveValue(genre);

    // The expanded public filter form, not just the older editor, must fit.
    for (const locale of ["en", "vi"] as const) {
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(`/${locale}/works?genre=${genre}`);
        await page
          .getByLabel(catalogDiscoveryCopy[locale].originalLanguage, {
            exact: true,
          })
          .focus();
        await expect(
          page.getByLabel(catalogDiscoveryCopy[locale].originalLanguage, {
            exact: true,
          }),
        ).toBeFocused();
        for (const theme of ["light", "dark"]) {
          await page.evaluate((value) => {
            document.documentElement.classList.toggle("dark", value === "dark");
          }, theme);
          expect(
            await page.evaluate(
              () =>
                document.documentElement.scrollWidth <=
                document.documentElement.clientWidth + 1,
            ),
          ).toBe(true);
          if (width === 390) {
            await page.screenshot({
              path: testInfo.outputPath(`v5c-${locale}-${width}-${theme}.png`),
              fullPage: true,
            });
          }
          // Text enlargement is measured here; it is not a claim of a manual
          // browser-UI zoom or a comprehensive accessibility certification.
          await page.locator("main").evaluate((element) => {
            element.style.fontSize = "200%";
          });
          expect(
            await page.evaluate(
              () =>
                document.documentElement.scrollWidth <=
                document.documentElement.clientWidth + 1,
            ),
          ).toBe(true);
          await page.locator("main").evaluate((element) => {
            element.style.fontSize = "";
          });
        }
      }
    }
    expect(errors).toEqual([]);
  } finally {
    requireTestDatabase();
    await sql`delete from work_relations where from_work_id in ${sql(ids)} or to_work_id in ${sql(ids)}`;
    await sql`delete from work_genres where work_id in ${sql(ids)}`;
    await sql`delete from work_titles where work_id in ${sql(ids)}`;
    await sql`delete from works where id in ${sql(ids)}`;
    await sql`delete from genres where slug in ${sql([genre, hiddenGenre])}`;
    await sql`delete from catalog_sources where id = ${sourceId}`;
    await sql.end({ timeout: 5 });
  }
});
