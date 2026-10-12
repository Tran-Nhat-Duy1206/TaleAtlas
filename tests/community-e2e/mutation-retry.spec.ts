import { randomUUID } from "node:crypto";
import { test, expect } from "../helpers/browser-test";
import { communityBrowserFixture } from "../helpers/community-browser-fixture";
import { communityCopy } from "../../apps/web/src/lib/community-i18n";
import { discussionMutationResponseSchema } from "../../apps/web/src/features/community/http-contracts";

test.describe.configure({ retries: 0 });
test("actual committed lost response replays one frozen payload, and stale replacement requires deliberate reload", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(360_000);
  expect(baseURL).toBeTruthy();
  const f = await communityBrowserFixture(page, browser, baseURL!),
    t = communityCopy.en;
  const path = `/api/community/works/${f.work.id}/threads`,
    bodies: string[] = [];
  let committedId: string | undefined;
  try {
    await page.route(`**${path}`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      bodies.push(route.request().postData()!);
      // Forward to the actual signed HTTP/SQL authority, then lose ONLY the response.
      const response = await route.fetch({ timeout: 45_000 });
      expect(response.status()).toBe(200);
      const result = discussionMutationResponseSchema.parse(
        await response.json(),
      );
      if (bodies.length === 1) {
        expect(result.replayed).toBe(false);
        committedId = result.content.id;
        await route.abort("connectionreset");
      } else {
        expect(result.replayed).toBe(true);
        expect(result.content.id).toBe(committedId);
        await route.fulfill({ response });
      }
    });
    await page.goto(`/en/works/${f.work.slug}/discussions`);
    await page.getByRole("button", { name: t.newThread, exact: true }).click();
    const create = page.getByRole("form", { name: t.newThread, exact: true }),
      title = `Explicit frozen public title ${f.run}`,
      body = `Explicit synthetic public submission ${f.run}`;
    await create.getByLabel(t.title, { exact: true }).fill(title);
    await create.getByLabel(t.body, { exact: true }).fill(body);
    await create.getByLabel(t.intent, { exact: true }).check();
    await create.getByRole("button", { name: t.submit, exact: true }).click();
    await expect(
      create.getByRole("button", { name: t.retry, exact: true }),
    ).toBeVisible();
    await expect(create.getByLabel(t.title, { exact: true })).toBeDisabled();
    await expect(create.getByLabel(t.body, { exact: true })).toBeDisabled();
    expect(committedId).toBeTruthy();
    expect(bodies).toHaveLength(1);
    expect(
      (
        await f.sql`select count(*)::int as count from community_contents where work_id=${f.work.id}`
      )[0].count,
    ).toBe(1);
    const replay = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === path && r.request().method() === "POST",
      { timeout: 45_000 },
    );
    await create.getByRole("button", { name: t.retry, exact: true }).click();
    const replayed = await replay;
    expect(replayed.status()).toBe(200);
    expect(
      discussionMutationResponseSchema.parse(await replayed.json()).replayed,
    ).toBe(true);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(JSON.parse(bodies[1]!).mutationKey).toBe(
      JSON.parse(bodies[0]!).mutationKey,
    );
    await expect(
      page.getByRole("link", { name: t.openDiscussion, exact: true }),
    ).toHaveCount(1);
    expect(
      (
        await f.sql`select count(*)::int as count from community_content_events where content_id=${committedId!}`
      )[0].count,
    ).toBe(1);
    expect(
      (
        await f.sql`select count(*)::int as count from community_mutation_receipts where content_id=${committedId!}`
      )[0].count,
    ).toBe(1);
    await page
      .getByRole("link", { name: t.openDiscussion, exact: true })
      .click();
    const card = page.locator("article").first();
    await card.getByRole("button", { name: t.checkOwner, exact: true }).click();
    await card.getByRole("button", { name: t.edit, exact: true }).click();
    const editor = card.getByRole("form", { name: t.replacement, exact: true });
    await expect(editor.getByLabel(t.title, { exact: true })).toHaveValue("");
    await expect(editor.getByLabel(t.body, { exact: true })).toHaveValue("");
    const currentTitle = `Concurrent current revision ${f.run}`,
      currentBody = `Synthetic current public body ${f.run}`;
    const changed = await page.request.patch(
      `/api/community/works/${f.work.id}/contents/${committedId!}`,
      {
        timeout: 45_000,
        headers: { Origin: baseURL! },
        data: {
          contentKind: "THREAD",
          expectedRevision: 1,
          mutationKey: randomUUID(),
          title: currentTitle,
          body: currentBody,
          titleSpoiler: false,
          bodySpoiler: false,
          spoilerContext: null,
          publicSubmissionAcknowledged: true,
        },
      },
    );
    expect(changed.status()).toBe(200);
    expect(
      discussionMutationResponseSchema.parse(await changed.json()).content
        .revision,
    ).toBe(2);
    await editor
      .getByLabel(t.title, { exact: true })
      .fill(`Stale attempt must not win ${f.run}`);
    await editor
      .getByLabel(t.body, { exact: true })
      .fill(`Stale deliberate body ${f.run}`);
    await editor.getByLabel(t.replacementIntent, { exact: true }).check();
    await editor.getByLabel(t.intent, { exact: true }).check();
    const rejected = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname ===
          `/api/community/works/${f.work.id}/contents/${committedId!}` &&
        r.request().method() === "PATCH",
      { timeout: 45_000 },
    );
    await editor.getByRole("button", { name: t.save, exact: true }).click();
    expect((await rejected).status()).toBe(409);
    await expect(
      editor.getByRole("button", { name: t.retry, exact: true }),
    ).toHaveCount(0);
    await expect(editor.getByLabel(t.title, { exact: true })).toBeDisabled();
    await editor.getByRole("button", { name: t.refresh, exact: true }).click();
    await expect(page.getByText(currentTitle, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("form", { name: t.replacement, exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await f.sql`select title,body,revision from community_contents where id=${committedId!}`
      )[0],
    ).toMatchObject({ title: currentTitle, body: currentBody, revision: 2 });
    expect(
      (
        await f.sql`select count(*)::int as count from community_content_events where content_id=${committedId!}`
      )[0].count,
    ).toBe(2);
    expect(
      (
        await f.sql`select count(*)::int as count from library_entries where user_id=${f.owner!.id!}`
      )[0].count,
    ).toBe(0);
  } finally {
    await page.unroute(`**${path}`);
    await f.close();
  }
});
