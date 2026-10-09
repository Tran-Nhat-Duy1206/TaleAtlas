import { test, expect, type Page } from "../helpers/browser-test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";
import { catalogDictionary } from "../../apps/web/src/lib/catalog-i18n";
import { publicCopy } from "../../apps/web/src/components/catalog/query";

// Every mutation/cleanup is confined to UUID-owned fixtures on loopback *_test.
// No global admin, mocked sessions/routes/providers, or production metadata.
test("real verified catalog administrator lifecycle, localization, guards and optimistic conflict", async ({
  browser,
  page,
  baseURL,
}) => {
  // Two real verification lifecycles and many cold webpack routes share this
  // scenario. Observed Windows runs reached the final reload at ~297s, so allow
  // a bounded 360s overall; individual UI assertions stay 15s, with no retries.
  test.setTimeout(360_000);
  const { client: sql } = createDatabase(requireTestDatabase());
  const run = randomUUID();
  const sourceLabel = `E2E synthetic catalog ${run}`;
  const genreSlug = `synthetic-${run}`;
  const accounts: { email: string; id?: string }[] = [];
  const readerContext = await browser.newContext({
    baseURL,
  });
  const publicContext = await browser.newContext({
    baseURL,
  });
  const visitor = await publicContext.newPage();
  const reader = await readerContext.newPage();
  const vi = catalogDictionary("vi");
  const en = catalogDictionary("en");
  const titleVi = `Đường Hư Cấu ${run}`;
  const titleEn = `Synthetic Road ${run}`;
  const alias = `Đường Bí Danh ${run}`;
  const original = `Synthetic original ${run}`;
  const citation =
    "Entirely invented UUID-owned browser fixture; not a real work, publisher, source or production catalog record.";

  async function signUp(target: Page, administrator: boolean) {
    const account: { email: string; id?: string } = {
      email: `${randomUUID()}@example.invalid`,
    };
    accounts.push(account); // Discover partial registrations during cleanup as well.
    await target.goto("/en/register");
    await target.getByLabel("Your name").fill(`Synthetic reader ${run}`);
    await target.getByLabel("Email address").fill(account.email);
    await target
      .getByLabel("Password", { exact: true })
      .fill("Synthetic-e2e-password-17!");
    await target
      .getByLabel("Confirm password")
      .fill("Synthetic-e2e-password-17!");
    // Cold development compilation can precede the real API response; assert it explicitly.
    const signedUp = target.waitForResponse(
      (r) =>
        r.url().endsWith("/api/auth/sign-up/email") &&
        r.request().method() === "POST",
      { timeout: 45000 },
    );
    await target.getByRole("button", { name: "Create account" }).click();
    expect((await signedUp).status()).toBe(200);
    await expect(target).toHaveURL(/\/en\/verify-email$/, { timeout: 30000 });
    let link: string | undefined;
    await expect
      .poll(async () => {
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
      })
      .toBe(true);
    expect(new URL(link!).origin).toBe(baseURL);
    await target.goto(link!);
    await expect(
      target.getByText("Your email is verified. You can now sign in."),
    ).toBeVisible();
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
      { timeout: 45000 },
    );
    await target.getByRole("button", { name: "Sign in", exact: true }).click();
    expect((await signedIn).status()).toBe(200);
    await expect(target).toHaveURL(/\/en\/settings$/, { timeout: 30000 });
    requireTestDatabase();
    const [row] =
      await sql`select id, role, email_verified from users where email = ${account.email}`;
    expect(row?.email_verified).toBe(true);
    expect(row?.role).toBe("user");
    account.id = String(row!.id);
    if (administrator) {
      // The only privilege grant is to this same genuinely verified/browser-login fixture.
      requireTestDatabase();
      await sql`update users set role = 'admin' where id = ${account.id} and email = ${account.email} and email_verified = true`;
    }
    return account;
  }
  async function submit(target: Page, status: number) {
    const response = target.waitForResponse(
      (r) =>
        r.url().includes("/api/admin/catalog/works") &&
        ["POST", "PATCH"].includes(r.request().method()),
      { timeout: 30000 },
    );
    await target.getByRole("button", { name: vi.save, exact: true }).click();
    const result = await response;
    expect(result.status()).toBe(status);
    expect(result.request().postDataJSON().publicationReviewAcknowledged).toBe(
      true,
    );
    return result;
  }
  async function search(locale: "en" | "vi", q: string, title: string) {
    await visitor.goto(`/${locale}/works`);
    const input = visitor.getByLabel(publicCopy[locale].search);
    await input.fill(q);
    await input.press("Enter"); // Real keyboard-submitted GET search.
    await expect(
      visitor.getByRole("link", { name: title, exact: true }),
    ).toBeVisible();
  }

  try {
    await signUp(page, true);
    await page.goto("/vi/admin/works");
    // Compile the development-only route via a real, authorized server request first.
    // The actual client link below still must navigate and hydrate within the normal UI budget.
    const preparedEditor = await page.request.get("/vi/admin/works/new");
    expect(preparedEditor.status()).toBe(200);
    await preparedEditor.body();
    await page.getByRole("link", { name: vi.newWork, exact: true }).click();
    await expect(page).toHaveURL(/\/vi\/admin\/works\/new$/);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel(vi.primaryTitle, { exact: true }).fill(titleVi);
    await page.getByLabel(vi.primaryLanguage).fill("vi");
    await page.getByLabel(vi.format, { exact: true }).selectOption("NOVEL");
    await page
      .getByLabel(vi.visibility, { exact: true })
      .selectOption("PUBLISHED");
    await page.getByLabel(vi.sourceLabel, { exact: true }).fill(sourceLabel);
    await page.getByLabel(vi.citation, { exact: true }).fill(citation);
    await page.getByRole("button", { name: vi.save, exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText(vi.reviewRequired);
    await page.getByLabel(vi.review, { exact: true }).check();
    await page.getByText(vi.advanced, { exact: true }).click();
    const titles = page.locator('textarea[name="titles"]');
    await titles.fill("{bad JSON");
    await page.getByRole("button", { name: vi.save, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(vi.invalid);
    await titles.fill(
      JSON.stringify([
        { title: titleEn, language: "en", kind: "PRIMARY" },
        { title: titleVi, language: "vi", kind: "PRIMARY" },
        { title: original, language: "und", kind: "ORIGINAL" },
        { title: alias, language: "vi", kind: "ALIAS" },
      ]),
    );
    await page
      .locator('textarea[name="editions"]')
      .fill(JSON.stringify([{ title: `Synthetic edition ${run}` }, {}]));
    await page
      .locator('textarea[name="creators"]')
      .fill(
        JSON.stringify([
          { name: `Invented author ${run}`, role: "AUTHOR", displayOrder: 0 },
        ]),
      );
    await page.locator('textarea[name="genres"]').fill(
      JSON.stringify([
        {
          slug: genreSlug,
          nameEn: "Synthetic genre",
          nameVi: "Thể loại hư cấu",
        },
      ]),
    );
    await page
      .locator('textarea[name="cover"]')
      .fill(JSON.stringify({ rights: "UNKNOWN" }));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const created = await (await submit(page, 200)).json();
    expect(created).toMatchObject({
      revision: 1,
      primaryTitle: titleVi,
      primaryTitleLanguage: "vi",
      format: "NOVEL",
      visibility: "PUBLISHED",
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    const id: string = created.id;
    const slug: string = created.slug;
    await expect(page).toHaveURL(new RegExp(`/vi/admin/works/${id}$`));
    await expect(
      page.getByText(`${vi.revision}: 1`, { exact: true }),
    ).toBeVisible();
    for (const locale of ["en", "vi"] as const) {
      await search(locale, alias, locale === "en" ? titleEn : titleVi);
      await search(locale, "duong", locale === "en" ? titleEn : titleVi);
      await visitor
        .getByRole("link", {
          name: locale === "en" ? titleEn : titleVi,
          exact: true,
        })
        .click();
      await expect(visitor).toHaveURL(new RegExp(`/${locale}/works/${slug}$`));
      await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(
        locale === "en" ? titleEn : titleVi,
      );
      await expect(
        visitor.getByRole("img", { name: publicCopy[locale].placeholder }),
      ).toHaveAttribute("src", "/images/work-placeholder.svg");
      const editions = visitor
        .locator("section")
        .filter({
          has: visitor.getByRole("heading", {
            name: publicCopy[locale].editions,
            exact: true,
          }),
        })
        .last();
      await expect(editions).toContainText(publicCopy[locale].unavailable);
      await expect(visitor.getByText(alias, { exact: true })).toBeVisible();
      await expect(visitor.getByText(original, { exact: true })).toBeVisible();
    }
    const publicJSON = await (
      await visitor.request.get(`/api/catalog/works/${slug}?locale=vi`)
    ).json();
    expect(publicJSON.editions).toHaveLength(2);
    for (const edition of publicJSON.editions) {
      for (const field of ["language", "publisher", "publicationYear", "isbn"])
        expect(edition).not.toHaveProperty(field);
    }
    expect(publicJSON).not.toHaveProperty("chapterCount");
    expect(publicJSON).not.toHaveProperty("volumeCount");

    // Both real pages load revision 1. Only the first save may win.
    const stale = await page.context().newPage();
    await stale.goto(`/vi/admin/works/${id}`);
    const renamed = `Đường Đổi Tên ${run}`;
    await page.getByLabel(vi.primaryTitle, { exact: true }).fill(renamed);
    await page.getByLabel(vi.review, { exact: true }).check();
    const updated = await (await submit(page, 200)).json();
    expect(updated).toMatchObject({
      id,
      slug,
      revision: 2,
      primaryTitle: renamed,
    });
    await expect(
      page.getByText(`${vi.revision}: 2`, { exact: true }),
    ).toBeVisible();
    await stale
      .getByLabel(vi.primaryTitle, { exact: true })
      .fill(`Must not overwrite ${run}`);
    await stale.getByLabel(vi.review, { exact: true }).check();
    await submit(stale, 409);
    await expect(stale.getByRole("status")).toHaveText(vi.conflict);
    await expect(
      stale.getByLabel(vi.primaryTitle, { exact: true }),
    ).toBeDisabled();
    await stale.getByRole("button", { name: vi.reload, exact: true }).click();
    await expect(
      stale.getByLabel(vi.primaryTitle, { exact: true }),
    ).toHaveValue(renamed);
    await stale.close();
    for (const locale of ["en", "vi"] as const) {
      await visitor.goto(`/${locale}/works/${slug}`);
      // A language-matching PRIMARY title takes precedence; VI primary is retitled.
      await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(
        locale === "en" ? titleEn : renamed,
      );
      await expect(visitor.getByText(alias, { exact: true })).toBeVisible();
    }
    await search("vi", alias, renamed);

    await signUp(reader, false);
    expect(
      (await reader.request.get(`/api/admin/catalog/works/${id}`)).status(),
    ).toBe(403);
    expect(
      (
        await reader.request.post("/api/admin/catalog/works", {
          data: {},
          headers: { Origin: baseURL! },
        })
      ).status(),
    ).toBe(403);
    for (const locale of ["en", "vi"] as const) {
      for (const path of ["", "/new", `/${id}`]) {
        await reader.goto(`/${locale}/admin/works${path}`);
        await expect(
          reader.getByRole("heading", {
            name: catalogDictionary(locale).denied,
            exact: true,
          }),
        ).toBeVisible();
        await expect(reader.locator('input[name="primaryTitle"]')).toHaveCount(
          0,
        );
      }
    }
    await visitor.goto("/vi/admin/works/new");
    await expect(visitor).toHaveURL(/\/vi\/login$/);

    await page
      .getByLabel(vi.visibility, { exact: true })
      .selectOption("HIDDEN");
    const hiddenResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/admin/catalog/works/${id}/visibility`) &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: vi.applyVisibility, exact: true })
      .click();
    const hiddenResult = await hiddenResponse;
    expect(hiddenResult.status()).toBe(200);
    expect(
      typeof hiddenResult.request().postDataJSON()
        .publicationReviewAcknowledged,
    ).toBe("boolean");
    await expect(
      page.getByText(`${vi.revision}: 3`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(vi.primaryTitle, { exact: true })).toHaveValue(
      renamed,
    );
    await expect(page.getByLabel(vi.citation, { exact: true })).toHaveValue(
      citation,
    );
    for (const locale of ["en", "vi"] as const) {
      await visitor.goto(`/${locale}/works?q=${encodeURIComponent(alias)}`);
      await expect(
        visitor.getByRole("link", { name: renamed, exact: true }),
      ).toHaveCount(0);
      await expect(
        visitor.getByRole("heading", {
          name: publicCopy[locale].empty,
          exact: true,
        }),
      ).toBeVisible();
      expect((await visitor.goto(`/${locale}/works/${slug}`))?.status()).toBe(
        404,
      );
    }
    expect(
      (await visitor.request.get(`/api/catalog/works/${slug}`)).status(),
    ).toBe(404);
    await page.goto(`/en/admin/works/${id}`);
    await expect(page.getByLabel(en.visibility, { exact: true })).toHaveValue(
      "HIDDEN",
    );
    await expect(page.getByLabel(en.primaryTitle, { exact: true })).toHaveValue(
      renamed,
    );
  } finally {
    try {
      requireTestDatabase();
      // Discover writes after failed response assertions using this run's unique source.
      const works =
        await sql`select w.id from works w join catalog_sources s on s.id = w.source_id where s.label = ${sourceLabel}`;
      const creators = new Set<string>();
      for (const work of works) {
        const id = String(work.id);
        const credits =
          await sql`select creator_id from work_creators where work_id = ${id}`;
        credits.forEach((c) => creators.add(String(c.creator_id)));
        await sql`delete from catalog_field_evidence where work_id = ${id}`;
        await sql`delete from catalog_audit_events where work_id = ${id}`;
        await sql`delete from work_relations where from_work_id = ${id} or to_work_id = ${id}`;
        await sql`delete from work_creators where work_id = ${id}`;
        await sql`delete from work_titles where work_id = ${id}`;
        await sql`delete from work_descriptions where work_id = ${id}`;
        await sql`delete from work_genres where work_id = ${id}`;
        await sql`delete from work_covers where work_id = ${id}`;
        await sql`delete from work_identifiers where work_id = ${id}`;
        await sql`delete from editions where work_id = ${id}`;
        await sql`delete from works where id = ${id}`;
      }
      for (const id of creators)
        await sql`delete from creators where id = ${id} and not exists(select 1 from work_creators where creator_id = ${id})`;
      await sql`delete from genres where slug = ${genreSlug} and not exists(select 1 from work_genres where genre_slug = ${genreSlug})`;
      await sql`delete from catalog_sources where label = ${sourceLabel} and not exists(select 1 from works where source_id = catalog_sources.id)`;
      for (const account of accounts) {
        const rows =
          await sql`select id from users where email = ${account.email}`;
        for (const row of rows) {
          const id = String(row.id);
          if (account.id) expect(id).toBe(account.id);
          await sql`delete from users where id = ${id} and email = ${account.email}`;
          await sql`delete from rate_limits where key = ${`catalog.write:${id}`}`;
        }
        await sql`delete from verifications where identifier like ${`%${account.email}%`}`;
      }
    } finally {
      await sql.end();
      await readerContext.close();
      await publicContext.close();
    }
  }
});
