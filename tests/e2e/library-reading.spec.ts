import { test, expect } from "../helpers/browser-test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";
import {
  verifiedBrowserAccount,
  type BrowserAccount,
} from "../helpers/verified-browser-account";
import { libraryCopy } from "../../apps/web/src/components/library/copy";
import { readingCopy } from "../../apps/web/src/components/library/reading-copy";

test.describe.configure({ retries: 0 });
test("real private reading progress preserves attempts through completion, reread and unavailable editions", async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(360_000);
  expect(baseURL).toBeTruthy();
  const sql = createDatabase(requireTestDatabase()).client;
  const run = randomUUID(),
    source = `Synthetic V3C browser ${run}`;
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
  let workId: string | undefined, entryId: string | undefined;
  const en = readingCopy.en,
    vi = readingCopy.vi;
  async function command(path: string, click: () => Promise<void>) {
    const pending = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === path && r.request().method() === "POST",
      { timeout: 45_000 },
    );
    await click();
    const response = await pending;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).not.toHaveProperty("userId");
    const result = await response.json();
    expect(result).not.toHaveProperty("ratingHalfStars");
    expect(result).not.toHaveProperty("notes");
    return result;
  }
  async function detail() {
    const response = await page.request.get(
      `/api/library/${entryId}/reading?locale=vi`,
      { timeout: 30_000 },
    );
    expect(response.status()).toBe(200);
    return response.json();
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
        primaryTitle: `Synthetic reading ${run}`,
        primaryTitleLanguage: "en",
        format: "NOVEL",
        visibility: "PUBLISHED",
        releaseStatus: "UNKNOWN",
        publicationReviewAcknowledged: true,
        titles: [
          { title: `Tiến độ hư cấu ${run}`, language: "vi", kind: "PRIMARY" },
        ],
        editions: [{ title: `Synthetic print ${run}` }],
        source: {
          label: source,
          citation:
            "UUID-owned invented reading-browser fixture, not production metadata.",
        },
      },
    });
    expect(seeded.status()).toBe(200);
    const work = await seeded.json();
    workId = work.id;
    const editionId = String(work.editions[0].id);
    expect(editionId).toMatch(/^[0-9a-f-]{36}$/);
    await page.goto(`/en/works/${work.slug}`);
    const added = await command("/api/library", () =>
      page
        .getByRole("button", { name: libraryCopy.en.add, exact: true })
        .click(),
    );
    entryId = added.id;
    await page.goto(`/en/library/${entryId}`);
    await expect(
      page.getByRole("heading", { name: en.heading, exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(en.startedOn, { exact: true })).toHaveValue(
      "",
    );
    await page.getByLabel(en.startedOn, { exact: true }).fill("2024-01-02");
    const first = await command(`/api/library/${entryId}/sessions`, () =>
      page.getByRole("button", { name: en.start, exact: true }).click(),
    );
    const firstSession = first.readingSession.id;
    expect(first.readingSession).toMatchObject({
      kind: "FIRST_READ",
      state: "ACTIVE",
      startedOn: "2024-01-02",
      finishedOn: null,
      chapterNumber: null,
      personalChapterTotal: null,
    });
    await expect(
      page.getByRole("button", { name: en.save, exact: true }),
    ).toBeEnabled();
    await page.getByLabel(en.chapterNumber, { exact: true }).fill("0");
    await page.getByLabel(en.chapterLabel, { exact: true }).fill("Prologue");
    await page.getByLabel(en.volumeNumber, { exact: true }).fill("3");
    await page
      .getByLabel(en.volumeLabel, { exact: true })
      .fill("Personal print volume");
    await page
      .getByLabel(en.progressNotes, { exact: true })
      .fill(`Private progress ${run}`);
    await page
      .getByRole("combobox", { name: en.editionId, exact: true })
      .selectOption(editionId);
    const progress = await command(`/api/library/${entryId}/progress`, () =>
      page.getByRole("button", { name: en.save, exact: true }).click(),
    );
    expect(progress.readingSession).toMatchObject({
      id: firstSession,
      chapterNumber: 0,
      chapterLabel: "Prologue",
      volumeNumber: 3,
      editionId,
      personalChapterTotal: null,
    });
    expect(progress.readingSession.lastActivityAt).toBeTruthy();
    await expect(
      page.getByRole("button", { name: en.save, exact: true }),
    ).toBeEnabled();
    await page.getByLabel(en.personalChapterTotal, { exact: true }).fill("12");
    const estimate = await command(`/api/library/${entryId}/progress`, () =>
      page.getByRole("button", { name: en.save, exact: true }).click(),
    );
    expect(estimate.readingSession.personalChapterTotal).toBe(12);
    await expect(
      page.getByRole("button", { name: en.save, exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("combobox", { name: libraryCopy.en.status, exact: true })
      .selectOption("ON_HOLD");
    const pausedResponse = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/library/${entryId}` &&
        r.request().method() === "PATCH",
      { timeout: 45_000 },
    );
    await page
      .getByRole("button", { name: libraryCopy.en.save, exact: true })
      .click();
    expect((await pausedResponse).status()).toBe(200);
    await expect(
      page.getByRole("button", { name: en.resume, exact: true }),
    ).toBeEnabled();
    expect((await detail()).readingSession).toMatchObject({
      id: firstSession,
      state: "PAUSED",
      chapterNumber: 0,
    });
    const resumed = await command(`/api/library/${entryId}/sessions`, () =>
      page.getByRole("button", { name: en.resume, exact: true }).click(),
    );
    expect(resumed.readingSession).toMatchObject({
      id: firstSession,
      state: "ACTIVE",
      chapterNumber: 0,
    });
    await expect(
      page.getByRole("button", { name: en.save, exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByLabel(en.completeAck, { exact: true }),
    ).not.toBeChecked();
    await page.getByLabel(en.finishedOn, { exact: true }).fill("2024-02-03");
    await page.getByLabel(en.completeAck, { exact: true }).check();
    const complete = await command(`/api/library/${entryId}/sessions`, () =>
      page.getByRole("button", { name: en.complete, exact: true }).click(),
    );
    expect(complete.readingSession).toMatchObject({
      id: firstSession,
      state: "COMPLETED",
      startedOn: "2024-01-02",
      finishedOn: "2024-02-03",
      personalChapterTotal: 12,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/vi/library/${entryId}`);
    await expect(
      page.getByLabel(vi.rereadAck, { exact: true }),
    ).not.toBeChecked();
    await page.getByLabel(vi.rereadAck, { exact: true }).check();
    const reread = await command(`/api/library/${entryId}/sessions`, () =>
      page.getByRole("button", { name: vi.reread, exact: true }).click(),
    );
    expect(reread.readingSession.id).not.toBe(firstSession);
    expect(reread.readingSession).toMatchObject({
      kind: "REREAD",
      state: "ACTIVE",
      chapterNumber: null,
      volumeNumber: null,
      personalChapterTotal: null,
      editionId: null,
      startedOn: null,
      finishedOn: null,
    });
    await expect(
      page.getByRole("button", { name: vi.save, exact: true }),
    ).toBeEnabled();
    await page.getByLabel(vi.chapterNumber, { exact: true }).fill("2");
    await command(`/api/library/${entryId}/progress`, () =>
      page.getByRole("button", { name: vi.save, exact: true }).click(),
    );
    await expect(
      page.getByRole("button", { name: vi.save, exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: vi.open, exact: true }).click();
    await expect(page.locator("main")).toContainText(vi.first);
    await expect(page.locator("main")).toContainText(vi.again);
    const sessionsResponse = await page.request.get(
      `/api/library/${entryId}/sessions?locale=vi`,
      { timeout: 30_000 },
    );
    expect(sessionsResponse.status()).toBe(200);
    const sessions = await sessionsResponse.json();
    expect(sessions.items).toHaveLength(2);
    expect(
      sessions.items.find((s: { id: string }) => s.id === firstSession),
    ).toMatchObject({
      state: "COMPLETED",
      chapterNumber: 0,
      personalChapterTotal: 12,
    });
    const history = await page.request.get(
      `/api/library/${entryId}/sessions/${firstSession}/progress?locale=vi`,
      { timeout: 30_000 },
    );
    expect(history.status()).toBe(200);
    expect((await history.json()).items).toHaveLength(2);
    for (const context of [anonymousContext, adminContext]) {
      const status = context === anonymousContext ? 401 : 404;
      for (const suffix of [
        "reading",
        "sessions",
        "history",
        `sessions/${firstSession}/progress`,
      ]) {
        expect(
          (
            await context.request.get(`/api/library/${entryId}/${suffix}`, {
              timeout: 30_000,
            })
          ).status(),
        ).toBe(status);
      }
    }
    requireTestDatabase();
    await sql`delete from editions where id=${editionId} and work_id=${workId!}`;
    await sql`update works set visibility='DRAFT' where id=${workId!} and source_id in(select id from catalog_sources where label=${source})`;
    await page.reload();
    await expect(page.locator("main")).not.toContainText(
      `Synthetic reading ${run}`,
    );
    await expect(page.locator("main")).not.toContainText(
      `Synthetic print ${run}`,
    );
    await expect(page.locator("main")).not.toContainText(`Tiến độ hư cấu ${run}`);
    await expect(
      page.getByLabel(vi.chapterNumber, { exact: true }),
    ).toHaveValue("2");
    const afterDelete = await page.request.get(
      `/api/library/${entryId}/sessions?locale=vi`,
      { timeout: 30_000 },
    );
    expect(afterDelete.status()).toBe(200);
    expect(
      (await afterDelete.json()).items.find(
        (s: { id: string }) => s.id === firstSession,
      ),
    ).toMatchObject({
      editionId: null,
      chapterNumber: 0,
      personalChapterTotal: 12,
    });
    const unavailable = await detail();
    expect(unavailable.work).toEqual({ available: false, id: workId });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    requireTestDatabase();
    const emails = accounts.map((a) => a.email);
    const rows = emails.length
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
