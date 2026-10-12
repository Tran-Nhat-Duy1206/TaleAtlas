import { test, expect } from "../helpers/browser-test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";
import {
  verifiedBrowserAccount,
  type BrowserAccount,
} from "../helpers/verified-browser-account";
import { libraryCopy } from "../../apps/web/src/components/library/copy";

test.describe.configure({ retries: 0 });
test("verified personal library remains private through bilingual status, favorite, archive and restore", async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(360_000);
  expect(baseURL).toBeTruthy();
  const sql = createDatabase(requireTestDatabase()).client;
  const run = randomUUID(),
    source = `Synthetic V3B browser ${run}`;
  const accounts: BrowserAccount[] = [];
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
  const anonContext = await browser.newContext({ baseURL });
  const admin = await adminContext.newPage(),
    anon = await anonContext.newPage();
  for (const context of [page.context(), adminContext, anonContext]) {
    context.setDefaultTimeout(15_000);
    context.setDefaultNavigationTimeout(360_000);
  }
  const en = libraryCopy.en,
    vi = libraryCopy.vi;
  let workId: string | undefined, entryId: string | undefined;
  const title = `Synthetic personal reading ${run}`,
    titleVi = `Thư viện hư cấu ${run}`;
  async function save(locale: "en" | "vi", status: string, favorite: boolean) {
    const t = libraryCopy[locale];
    await page
      .getByRole("combobox", { name: t.status, exact: true })
      .selectOption(status);
    await page.getByLabel(t.favorite, { exact: true }).setChecked(favorite);
    const response = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/library/${entryId}` &&
        r.request().method() === "PATCH",
      { timeout: 45_000 },
    );
    await page.getByRole("button", { name: t.save, exact: true }).click();
    const result = await response;
    expect(result.status()).toBe(200);
    const body = result.request().postDataJSON();
    expect(body.patch).toEqual({ status, favorite });
    expect(body).not.toHaveProperty("userId");
    await expect(
      page.getByRole("combobox", { name: t.status, exact: true }),
    ).toHaveValue(status);
    if (favorite)
      await expect(page.getByLabel(t.favorite, { exact: true })).toBeChecked();
    else
      await expect(
        page.getByLabel(t.favorite, { exact: true }),
      ).not.toBeChecked();
  }
  try {
    const owner = await verifiedBrowserAccount(
      page,
      baseURL!,
      run,
      sql,
      accounts,
    );
    const curator = await verifiedBrowserAccount(
      admin,
      baseURL!,
      run,
      sql,
      accounts,
    );
    requireTestDatabase();
    await sql`update users set role='admin' where id=${curator.id!} and email=${curator.email} and email_verified=true`;
    const seeded = await admin.request.post("/api/admin/catalog/works", {
      timeout: 45_000,
      headers: { Origin: baseURL! },
      data: {
        primaryTitle: title,
        primaryTitleLanguage: "en",
        format: "NOVEL",
        visibility: "PUBLISHED",
        releaseStatus: "UNKNOWN",
        publicationReviewAcknowledged: true,
        titles: [{ title: titleVi, language: "vi", kind: "PRIMARY" }],
        source: {
          label: source,
          citation:
            "UUID-owned invented browser setup, not production metadata.",
        },
      },
    });
    expect(seeded.status()).toBe(200);
    const work = await seeded.json();
    workId = work.id;
    await page.goto(`/en/works/${work.slug}`);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    const added = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/library" &&
        r.request().method() === "POST",
      { timeout: 45_000 },
    );
    await page.getByRole("button", { name: en.add, exact: true }).click();
    const addition = await added;
    expect(addition.status()).toBe(200);
    const saved = await addition.json();
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    entryId = String(saved.id);
    expect(saved).toMatchObject({
      workId,
      status: "WANT_TO_READ",
      favorite: false,
    });
    expect(saved).not.toHaveProperty("notes");
    expect(saved).not.toHaveProperty("ratingHalfStars");
    await page.getByRole("link", { name: en.detail, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/en/library/${entryId}$`));
    expect(
      await page.locator('meta[name="robots"]').getAttribute("content"),
    ).toContain("noindex");
    await save("en", "READING", true);
    await page.goto(`/vi/library/${entryId}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(titleVi);
    await save("vi", "ON_HOLD", true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/vi/library");
    await page
      .getByRole("combobox", { name: vi.status, exact: true })
      .selectOption("ON_HOLD");
    await page
      .getByRole("combobox", { name: vi.favorite, exact: true })
      .selectOption("true");
    await page
      .getByRole("combobox", { name: vi.sort, exact: true })
      .selectOption("TITLE_ASC");
    await page.getByRole("button", { name: vi.apply, exact: true }).click();
    await expect(page).toHaveURL(/favorite=true/);
    await expect(page.locator("main")).toContainText(titleVi);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.goto(`/vi/library/${entryId}`);
    await expect(
      page.getByRole("button", { name: vi.archive, exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByLabel(vi.confirm, { exact: true }),
    ).not.toBeChecked();
    await page.getByLabel(vi.confirm, { exact: true }).check();
    const removed = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/library/${entryId}` &&
        r.request().method() === "DELETE",
      { timeout: 45_000 },
    );
    await page.getByRole("button", { name: vi.archive, exact: true }).click();
    const removal = await removed;
    expect(removal.status()).toBe(200);
    expect(removal.request().postDataJSON().confirmRemoval).toBe(true);
    await expect(page.locator("main")).toContainText(vi.archived);
    const [archived] =
      await sql`select removed_at,session_count,event_count from library_entries where id=${entryId} and user_id=${owner.id!}`;
    expect(archived.removed_at).not.toBeNull();
    expect(archived.session_count).toBe(1);
    await page.goto(`/vi/works/${work.slug}`);
    const restored = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/library" &&
        r.request().method() === "POST",
      { timeout: 45_000 },
    );
    await page.getByRole("button", { name: vi.restore, exact: true }).click();
    const restoration = await restored;
    expect(restoration.status()).toBe(200);
    expect(await restoration.json()).toMatchObject({
      id: entryId,
      status: "WANT_TO_READ",
      archived: false,
    });
    expect(restoration.request().postDataJSON().revision).toBeGreaterThan(1);
    expect(
      (
        await admin.request.get(`/api/library/${entryId}`, { timeout: 30_000 })
      ).status(),
    ).toBe(404);
    expect(
      (
        await anon.request.get(`/api/library/${entryId}`, { timeout: 30_000 })
      ).status(),
    ).toBe(401);
    await anon.goto(`/en/works/${work.slug}`);
    await expect(
      anon.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      anon.getByRole("button", { name: en.add, exact: true }),
    ).toHaveCount(0);
    const publicWork = await anon.request.get(
      `/api/catalog/works/${work.slug}`,
      { timeout: 30_000 },
    );
    const publicBody = await publicWork.json();
    expect(publicBody).not.toHaveProperty("favorite");
    expect(publicBody).not.toHaveProperty("currentSession");
    await anon.goto("/vi/library");
    await expect(anon).toHaveURL(/\/vi\/login\?callbackURL=/);
    const hidden = await admin.request.post(
      `/api/admin/catalog/works/${workId}/visibility`,
      {
        timeout: 45_000,
        headers: { Origin: baseURL! },
        data: { revision: work.revision, visibility: "HIDDEN" },
      },
    );
    expect(hidden.status()).toBe(200);
    await page.goto(`/vi/library/${entryId}`);
    await expect(page.locator("main")).toContainText(vi.unavailable);
    await expect(page.locator("main")).not.toContainText(title);
    await expect(page.locator("main")).not.toContainText(titleVi);
    expect(
      (
        await anon.request.get(`/api/catalog/works/${work.slug}`, {
          timeout: 30_000,
        })
      ).status(),
    ).toBe(404);
  } finally {
    requireTestDatabase();
    const emails = accounts.map((a) => a.email);
    const users = emails.length
      ? await sql`select id from users where email=any(${emails}::text[])`
      : [];
    const ids = users.map((u) => String(u.id));
    if (ids.length)
      await sql`delete from library_entries where user_id=any(${ids}::text[])`;
    if (workId) {
      await sql`delete from catalog_field_evidence where work_id=${workId}`;
      await sql`delete from catalog_audit_events where work_id=${workId}`;
      await sql`delete from work_titles where work_id=${workId}`;
      await sql`delete from work_descriptions where work_id=${workId}`;
      await sql`delete from works where id=${workId} and source_id in(select id from catalog_sources where label=${source})`;
    }
    await sql`delete from catalog_sources where label=${source}`;
    if (ids.length) {
      await sql`delete from sessions where user_id=any(${ids}::text[])`;
      await sql`delete from accounts where user_id=any(${ids}::text[])`;
      await sql`delete from users where id=any(${ids}::text[]) and email=any(${emails}::text[])`;
    }
    await adminContext.close();
    await anonContext.close();
    await sql.end();
  }
});
