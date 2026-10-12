import { test, expect } from "../helpers/browser-test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";
import {
  verifiedBrowserAccount,
  type BrowserAccount,
} from "../helpers/verified-browser-account";
import { libraryCopy } from "../../apps/web/src/components/library/copy";
import {
  personalCopy,
  personalRatings,
} from "../../apps/web/src/components/library/personal-copy";
import { personalHttpDetailsSchema } from "../../apps/web/src/features/library/personal-http-contracts";

test.describe.configure({ retries: 0 });
test("real optional private ratings and entry notes never become catalog facts or reading activity", async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(360_000);
  expect(baseURL).toBeTruthy();
  const sql = createDatabase(requireTestDatabase()).client;
  const run = randomUUID(),
    source = `Synthetic V3D browser ${run}`;
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
  const anonymousContext = await browser.newContext({ baseURL });
  const admin = await adminContext.newPage();
  for (const context of [page.context(), adminContext, anonymousContext]) {
    context.setDefaultTimeout(15_000);
    context.setDefaultNavigationTimeout(360_000);
  }
  const en = personalCopy.en,
    vi = personalCopy.vi;
  const privateNote = `<script>window.__TALEATLAS_PRIVATE_NOTE_PROBE__=true</script>\nPrivate owner note ${run}`;
  let workId: string | undefined, entryId: string | undefined;
  async function response(
    path: string,
    method: string,
    action: () => Promise<void>,
  ) {
    const pending = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === path && r.request().method() === method,
      { timeout: 45_000 },
    );
    await action();
    const result = await pending;
    expect(result.status()).toBe(200);
    expect(result.request().postDataJSON()).not.toHaveProperty("userId");
    return {
      body: await result.json(),
      request: result.request().postDataJSON(),
    };
  }
  async function save(locale: "en" | "vi" = "en") {
    const result = await response(
      `/api/library/${entryId}/personal`,
      "PATCH",
      () =>
        page
          .getByRole("button", { name: personalCopy[locale].save, exact: true })
          .click(),
    );
    personalHttpDetailsSchema.parse(result.body);
    expect(Object.keys(result.body).sort()).toEqual([
      "archived",
      "id",
      "notes",
      "ratingHalfStars",
      "revision",
      "workId",
    ]);
    expect(Object.keys(result.request).sort()).toEqual([
      "mutationKey",
      "patch",
      "revision",
    ]);
    await expect(
      page.getByRole("button", {
        name: personalCopy[locale].save,
        exact: true,
      }),
    ).toBeEnabled();
    return result;
  }
  async function personal() {
    const result = await page.request.get(
      `/api/library/${entryId}/personal?locale=vi`,
      { timeout: 30_000 },
    );
    expect(result.status()).toBe(200);
    return personalHttpDetailsSchema.parse(await result.json());
  }
  async function reading() {
    const result = await page.request.get(`/api/library/${entryId}/reading`, {
      timeout: 30_000,
    });
    expect(result.status()).toBe(200);
    const data = await result.json();
    expect(data).not.toHaveProperty("ratingHalfStars");
    expect(data).not.toHaveProperty("notes");
    return data.readingSession;
  }
  try {
    await verifiedBrowserAccount(page, baseURL!, run, sql, accounts);
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
        primaryTitle: `Synthetic personal ${run}`,
        primaryTitleLanguage: "en",
        format: "NOVEL",
        visibility: "PUBLISHED",
        releaseStatus: "UNKNOWN",
        publicationReviewAcknowledged: true,
        titles: [
          { title: `Ghi chú hư cấu ${run}`, language: "vi", kind: "PRIMARY" },
        ],
        source: {
          label: source,
          citation:
            "UUID-owned invented personal-browser fixture, not production metadata.",
        },
      },
    });
    expect(seeded.status()).toBe(200);
    const work = await seeded.json();
    workId = work.id;
    await page.goto(`/en/works/${work.slug}`);
    const added = await response("/api/library", "POST", () =>
      page
        .getByRole("button", { name: libraryCopy.en.add, exact: true })
        .click(),
    );
    entryId = added.body.id;
    await page.goto(`/en/library/${entryId}`);
    await expect(
      page.getByRole("heading", { name: en.heading, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: en.save, exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("combobox", { name: en.rating, exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByRole("textbox", { name: en.notes, exact: true }),
    ).toHaveValue("");
    expect(await personal()).toMatchObject({
      id: entryId,
      workId,
      ratingHalfStars: null,
      notes: "",
      archived: false,
    });
    // A genuine explicit Reading command establishes activity; D must not rewrite it.
    await page
      .getByRole("combobox", { name: libraryCopy.en.status, exact: true })
      .selectOption("READING");
    await response(`/api/library/${entryId}`, "PATCH", () =>
      page
        .getByRole("button", { name: libraryCopy.en.save, exact: true })
        .click(),
    );
    await expect(
      page.getByRole("button", { name: en.save, exact: true }),
    ).toBeEnabled();
    const activity = await reading();
    expect(activity).toMatchObject({
      kind: "FIRST_READ",
      state: "ACTIVE",
      startedOn: null,
      finishedOn: null,
      completedAt: null,
    });
    for (const halfStars of personalRatings) {
      await page
        .getByRole("combobox", { name: en.rating, exact: true })
        .selectOption(String(halfStars));
      const changed = await save();
      expect(changed.request.patch.ratingHalfStars).toBe(halfStars);
      expect(changed.body.ratingHalfStars).toBe(halfStars);
      await expect(
        page.getByRole("combobox", { name: en.rating, exact: true }),
      ).toHaveValue(String(halfStars));
    }
    await page
      .getByRole("textbox", { name: en.notes, exact: true })
      .fill(privateNote);
    expect((await save()).body.notes).toBe(privateNote);
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: en.notes, exact: true }),
    ).toHaveValue(privateNote);
    expect(
      await page.evaluate(() => "__TALEATLAS_PRIVATE_NOTE_PROBE__" in window),
    ).toBe(false);
    expect(await reading()).toEqual(activity);
    const legacy = await page.request.get(`/api/library/${entryId}`, {
      timeout: 30_000,
    });
    expect(legacy.status()).toBe(200);
    expect(await legacy.json()).not.toHaveProperty("notes");
    const unchanged = await personal();
    expect((await save()).body.revision).toBe(unchanged.revision);
    for (const context of [anonymousContext, adminContext]) {
      const denied = await context.request.get(
        `/api/library/${entryId}/personal`,
        { timeout: 30_000 },
      );
      expect(denied.status()).toBe(context === anonymousContext ? 401 : 404);
      expect(await denied.text()).not.toContain(privateNote);
    }
    await admin.goto(`/en/works/${work.slug}`);
    await expect(admin.locator("main")).not.toContainText(
      `Private owner note ${run}`,
    );
    const publicWork = await anonymousContext.request.get(
      `/api/catalog/works/${work.slug}`,
      { timeout: 30_000 },
    );
    expect(publicWork.status()).toBe(200);
    const publicData = JSON.stringify(await publicWork.json());
    expect(publicData).not.toContain(`Private owner note ${run}`);
    expect(publicData).not.toContain("ratingHalfStars");
    // Archive/restore keeps private facts, never falsely calls this permanent deletion.
    await page
      .getByRole("checkbox", { name: libraryCopy.en.confirm, exact: true })
      .check();
    await response(`/api/library/${entryId}`, "DELETE", () =>
      page
        .getByRole("button", { name: libraryCopy.en.archive, exact: true })
        .click(),
    );
    await page.goto(`/en/works/${work.slug}`);
    const restored = await response("/api/library", "POST", () =>
      page
        .getByRole("button", { name: libraryCopy.en.restore, exact: true })
        .click(),
    );
    expect(restored.body.id).toBe(entryId);
    await page.goto(`/en/library/${entryId}`);
    await expect(
      page.getByRole("textbox", { name: en.notes, exact: true }),
    ).toHaveValue(privateNote);
    await expect(
      page.getByRole("combobox", { name: en.rating, exact: true }),
    ).toHaveValue("10");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/vi/library/${entryId}`);
    await expect(
      page.getByRole("textbox", { name: vi.notes, exact: true }),
    ).toHaveValue(privateNote);
    const prefix = `Private bounded ${run} `,
      bounded = prefix + "n".repeat(4000 - prefix.length);
    await page
      .getByRole("textbox", { name: vi.notes, exact: true })
      .fill(bounded);
    expect((await save("vi")).body.notes).toBe(bounded);
    requireTestDatabase();
    await sql`update works set visibility='DRAFT' where id=${workId!} and source_id in(select id from catalog_sources where label=${source})`;
    await page.reload();
    await expect(page.locator("main")).not.toContainText(
      `Synthetic personal ${run}`,
    );
    await expect(page.locator("main")).not.toContainText(
      `Ghi chú hư cấu ${run}`,
    );
    await expect(
      page.getByRole("textbox", { name: vi.notes, exact: true }),
    ).toHaveValue(bounded);
    await page
      .getByRole("combobox", { name: vi.rating, exact: true })
      .selectOption("");
    await page.getByRole("textbox", { name: vi.notes, exact: true }).fill("");
    const cleared = await save("vi");
    expect(cleared.body).toMatchObject({ ratingHalfStars: null, notes: "" });
    expect(await personal()).toMatchObject({
      ratingHalfStars: null,
      notes: "",
    });
    const histories = await page.request.get(
      `/api/library/${entryId}/sessions?locale=vi`,
      { timeout: 30_000 },
    );
    expect(histories.status()).toBe(200);
    const attempts = (await histories.json()).items;
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      id: activity.id,
      kind: "FIRST_READ",
      state: "ABANDONED",
      startedOn: null,
      finishedOn: null,
      notes: "",
      completedAt: null,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    requireTestDatabase();
    const emails = accounts.map((a) => a.email),
      rows = emails.length
        ? await sql`select id from users where email=any(${emails}::text[])`
        : [];
    const ids = rows.map((r) => String(r.id));
    if (ids.length)
      await sql`delete from library_entries where user_id=any(${ids}::text[])`;
    if (workId) {
      await sql`delete from catalog_field_evidence where work_id=${workId}`;
      await sql`delete from catalog_audit_events where work_id=${workId}`;
      await sql`delete from editions where work_id=${workId}`;
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
    await anonymousContext.close();
    await sql.end();
  }
});
