import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "../helpers/browser-test";
import { communityBrowserFixture } from "../helpers/community-browser-fixture";
import { communityCopy } from "../../apps/web/src/lib/community-i18n";
import {
  discussionMutationResponseSchema,
  discussionListResponseSchema,
} from "../../apps/web/src/features/community/http-contracts";

test.describe.configure({ retries: 0 });
async function mutation(
  page: Page,
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
  const response = await pending;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).not.toHaveProperty("userId");
  expect(response.request().postDataJSON()).not.toHaveProperty("authorId");
  return discussionMutationResponseSchema.parse(await response.json());
}
for (const locale of ["en", "vi"] as const) {
  test(`actual ${locale} public discussion has masked delivery, selected reveal, bounded replies, owner replacement and no private prerequisite`, async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(360_000);
    expect(baseURL).toBeTruthy();
    const f = await communityBrowserFixture(page, browser, baseURL!);
    const t = communityCopy[locale];
    const titleMarker = `hidden-title-${f.run}`,
      bodyMarker = `hidden-body-${f.run}`,
      contextMarker = `hidden-context-${f.run}`;
    const title = `<img src=x> ${titleMarker}`,
      body = `<script>window.__COMMUNITY_UNSAFE__=true</script> ${bodyMarker}`;
    const documentStatuses = new Map<string, number>();
    page.on("response", (response) => {
      if (response.request().resourceType() === "document")
        documentStatuses.set(
          new URL(response.url()).pathname,
          response.status(),
        );
    });
    let revealRequests = 0;
    page.on("request", (r) => {
      if (new URL(r.url()).pathname.endsWith("/reveal")) revealRequests++;
    });
    try {
      expect(
        (
          await f.sql`select count(*)::int as count from library_entries where user_id=${f.owner!.id!}`
        )[0].count,
      ).toBe(0);
      await page.goto(`/${locale}/works/${f.work.slug}`);
      await page
        .getByRole("link", { name: t.discussions, exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: t.discussions,
          level: 1,
          exact: true,
        }),
      ).toBeVisible();
      expect(
        documentStatuses.get(`/${locale}/works/${f.work.slug}/discussions`),
      ).toBe(200);
      await page
        .getByRole("button", { name: t.newThread, exact: true })
        .click();
      const form = page.getByRole("form", { name: t.newThread, exact: true });
      await form.getByLabel(t.title, { exact: true }).fill(title);
      await form.getByLabel(t.title, { exact: true }).focus();
      await page.keyboard.press("Tab");
      await expect(
        form.getByLabel(t.titleSpoiler, { exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Space");
      await form.getByLabel(t.body, { exact: true }).fill(body);
      await form.getByLabel(t.bodySpoiler, { exact: true }).check();
      await form.getByLabel(t.context, { exact: true }).fill(contextMarker);
      await expect(
        form.getByRole("button", { name: t.submit, exact: true }),
      ).toBeDisabled();
      await form.getByLabel(t.intent, { exact: true }).check();
      const created = await mutation(
        page,
        `/api/community/works/${f.work.id}/threads`,
        "POST",
        () => form.getByRole("button", { name: t.submit, exact: true }).click(),
      );
      expect(created.content.title).toEqual({ state: "MASKED", text: null });
      expect(created.content.body).toEqual({ state: "MASKED", text: null });
      const id = created.content.id;
      const defaultJSON = await f.anonymous.request.get(
        `/api/community/works/${f.work.id}/threads?locale=${locale}`,
        { timeout: 30_000 },
      );
      expect(defaultJSON.status()).toBe(200);
      const defaultBody = await defaultJSON.text();
      discussionListResponseSchema.parse(JSON.parse(defaultBody));
      for (const needle of [titleMarker, bodyMarker, contextMarker])
        expect(defaultBody).not.toContain(needle);
      await page
        .getByRole("link", { name: t.openDiscussion, exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: t.conversation,
          level: 1,
          exact: true,
        }),
      ).toBeVisible();
      expect(
        documentStatuses.get(
          `/${locale}/works/${f.work.slug}/discussions/${id}`,
        ),
      ).toBe(200);
      const ssr = await f.anonymous.request.get(
        `/${locale}/works/${f.work.slug}/discussions/${id}`,
        { timeout: 30_000 },
      );
      expect(ssr.status()).toBe(200);
      const html = await ssr.text();
      for (const needle of [titleMarker, bodyMarker, contextMarker]) {
        expect(html).not.toContain(needle);
        expect(await page.content()).not.toContain(needle);
      }
      expect(revealRequests).toBe(0);
      await expect(page.locator("h1")).toHaveCount(1);
      const titleButton = page.getByRole("button", {
        name: t.revealTitle,
        exact: true,
      });
      await titleButton
        .locator("..")
        .getByLabel(t.revealAck, { exact: true })
        .check();
      const titleReveal = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname ===
            `/api/community/works/${f.work.id}/contents/${id}/reveal` &&
          r.request().method() === "POST",
        { timeout: 45_000 },
      );
      await titleButton.click();
      const selected = await titleReveal;
      expect(selected.status()).toBe(200);
      expect(selected.request().postDataJSON()).toMatchObject({
        targetId: id,
        expectedRevision: 1,
        title: true,
        body: false,
        spoilerRevealAcknowledged: true,
      });
      const titleResponse = await selected.json();
      expect(titleResponse.title).toBe(title);
      expect(titleResponse).not.toHaveProperty("body");
      expect(titleResponse).not.toHaveProperty("spoilerContext");
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      expect(await page.content()).not.toContain(bodyMarker);
      expect(await page.content()).not.toContain(contextMarker);
      const bodyButton = page.getByRole("button", {
        name: t.revealBody,
        exact: true,
      });
      await bodyButton
        .locator("..")
        .getByLabel(t.revealAck, { exact: true })
        .check();
      await bodyButton.click();
      await expect(page.getByText(body, { exact: true })).toBeVisible();
      expect(
        await page.evaluate(() =>
          Boolean(
            (window as unknown as Record<string, unknown>).__COMMUNITY_UNSAFE__,
          ),
        ),
      ).toBe(false);
      await page.getByRole("button", { name: t.refresh, exact: true }).click();
      await expect(
        page.getByRole("button", { name: t.revealTitle, exact: true }),
      ).toBeVisible();
      for (const needle of [titleMarker, bodyMarker, contextMarker])
        expect(await page.content()).not.toContain(needle);
      async function reply(
        text: string,
        nested: boolean,
        spoiler = false,
        parentText?: string,
      ) {
        // Replies are newest-first: bind the chosen ancestor, never a visual order.
        const scope = parentText
          ? page
              .locator("article")
              .filter({ has: page.getByText(parentText, { exact: true }) })
              .locator("..")
          : page;
        await scope
          .getByRole("button", {
            name: nested ? t.nestedReply : t.reply,
            exact: true,
          })
          .first()
          .click();
        const replyForm = page.getByRole("form", {
          name: t.reply,
          exact: true,
        });
        await replyForm.getByLabel(t.body, { exact: true }).fill(text);
        if (spoiler)
          await replyForm.getByLabel(t.bodySpoiler, { exact: true }).check();
        await replyForm.getByLabel(t.intent, { exact: true }).check();
        return mutation(
          page,
          `/api/community/works/${f.work.id}/threads/${id}/replies`,
          "POST",
          () =>
            replyForm
              .getByRole("button", { name: t.submit, exact: true })
              .click(),
        );
      }
      const childMarker = `independent-child-${f.run}`;
      const root = await reply(childMarker, false, true);
      expect(root.content.depth).toBe(0);
      const nested = await reply(
        `Visible synthetic nested reply ${f.run}`,
        true,
      );
      expect(nested.content).toMatchObject({
        depth: 1,
        parentId: root.content.id,
      });
      const deepest = await reply(
        `Visible synthetic deepest reply ${f.run}`,
        true,
        false,
        `Visible synthetic nested reply ${f.run}`,
      );
      expect(deepest.content).toMatchObject({
        depth: 2,
        parentId: nested.content.id,
      });
      await expect(page.getByText(t.depthLimit, { exact: true })).toBeVisible();
      const depths =
        await f.sql`select depth,parent_id,thread_id from community_contents where work_id=${f.work.id} and kind='REPLY' order by depth`;
      expect(depths.map((row) => row.depth)).toEqual([0, 1, 2]);
      expect(depths.every((row) => row.thread_id === id)).toBe(true);
      const rootCard = page.locator("article").first();
      const rootTitle = rootCard.getByRole("button", {
        name: t.revealTitle,
        exact: true,
      });
      await rootTitle
        .locator("..")
        .getByLabel(t.revealAck, { exact: true })
        .check();
      await rootTitle.click();
      await expect(rootCard.getByText(title, { exact: true })).toBeVisible();
      expect(await page.content()).not.toContain(childMarker);
      await rootCard
        .getByRole("button", { name: t.checkOwner, exact: true })
        .click();
      await rootCard.getByRole("button", { name: t.edit, exact: true }).click();
      const editor = rootCard.getByRole("form", {
        name: t.replacement,
        exact: true,
      });
      await expect(editor.getByLabel(t.title, { exact: true })).toHaveValue("");
      await expect(editor.getByLabel(t.body, { exact: true })).toHaveValue("");
      const replacementTitle = `Explicit replacement ${f.run}`,
        replacementBody = `Plain replacement, not a library note ${f.run}`;
      await editor.getByLabel(t.title, { exact: true }).fill(replacementTitle);
      await editor.getByLabel(t.body, { exact: true }).fill(replacementBody);
      await editor.getByLabel(t.replacementIntent, { exact: true }).check();
      await editor.getByLabel(t.intent, { exact: true }).check();
      const edited = await mutation(
        page,
        `/api/community/works/${f.work.id}/contents/${id}`,
        "PATCH",
        () => editor.getByRole("button", { name: t.save, exact: true }).click(),
      );
      expect(edited.content.revision).toBe(2);
      await expect(
        page.getByText(replacementTitle, { exact: true }),
      ).toBeVisible();
      expect(
        (
          await f.sql`select title,body,revision from community_contents where id=${id}`
        )[0],
      ).toMatchObject({
        title: replacementTitle,
        body: replacementBody,
        revision: 2,
      });
      expect(
        (
          await f.sql`select count(*)::int as count from library_entries where user_id=${f.owner!.id!}`
        )[0].count,
      ).toBe(0);
      await page.setViewportSize({ width: 375, height: 812 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
    } finally {
      await f.close();
    }
  });
}

test("private UUID-only withdrawal after unpublication never reveals catalog facts and retains unrelated public replies", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(360_000);
  expect(baseURL).toBeTruthy();
  const f = await communityBrowserFixture(page, browser, baseURL!),
    t = communityCopy.en;
  try {
    const input = {
      mutationKey: randomUUID(),
      title: `Private management must not leak ${f.run}`,
      body: `Synthetic authored body ${f.run}`,
      titleSpoiler: true,
      bodySpoiler: true,
      spoilerContext: `Context ${f.run}`,
      publicSubmissionAcknowledged: true,
    };
    const posted = await page.request.post(
      `/api/community/works/${f.work.id}/threads`,
      { timeout: 45_000, headers: { Origin: baseURL! }, data: input },
    );
    expect(posted.status()).toBe(200);
    const root = discussionMutationResponseSchema.parse(
      await posted.json(),
    ).content;
    const survivor = `Unrelated survivor plain reply ${f.run}`;
    const replied = await f.admin.request.post(
      `/api/community/works/${f.work.id}/threads/${root.id}/replies`,
      {
        timeout: 45_000,
        headers: { Origin: baseURL! },
        data: {
          mutationKey: randomUUID(),
          threadId: root.id,
          parentId: null,
          depth: 0,
          body: survivor,
          bodySpoiler: false,
          spoilerContext: null,
          publicSubmissionAcknowledged: true,
        },
      },
    );
    expect(replied.status()).toBe(200);
    const reply = discussionMutationResponseSchema.parse(
      await replied.json(),
    ).content;
    const hidden = await f.admin.request.post(
      `/api/admin/catalog/works/${f.work.id}/visibility`,
      {
        timeout: 45_000,
        headers: { Origin: baseURL! },
        data: { revision: f.work.revision, visibility: "HIDDEN" },
      },
    );
    expect(hidden.status()).toBe(200);
    const hiddenWork = (await hidden.json()) as { revision: number };
    expect(
      (
        await page.request.get(
          `/api/community/works/${f.work.id}/threads/${root.id}`,
          { timeout: 30_000 },
        )
      ).status(),
    ).toBe(404);
    await page.goto("/en/community/manage");
    await expect(
      page.getByRole("heading", { name: t.manage, level: 1, exact: true }),
    ).toBeVisible();
    const rendered = await page.content();
    for (const needle of [
      input.title,
      input.body,
      input.spoilerContext,
      f.work.slug,
    ])
      expect(rendered).not.toContain(needle);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    const meta = await page.request.get(
      `/api/community/works/${f.work.id}/contents/${root.id}/owned?contentKind=THREAD`,
      { timeout: 30_000 },
    );
    expect(meta.status()).toBe(200);
    const cacheDirectives = meta
      .headers()
      ["cache-control"]!.split(",")
      .map((value) => value.trim().toLowerCase());
    expect(cacheDirectives).toContain("no-store");
    expect(cacheDirectives).not.toContain("public");
    expect(meta.headers()["x-robots-tag"]).toBe("noindex");
    await page.getByLabel(t.withdrawAck, { exact: true }).check();
    const withdrawn = await mutation(
      page,
      `/api/community/works/${f.work.id}/contents/${root.id}/withdraw`,
      "POST",
      () => page.getByRole("button", { name: t.withdraw, exact: true }).click(),
    );
    expect(withdrawn.content).toMatchObject({
      state: "DELETED",
      title: { state: "UNAVAILABLE", text: null },
      body: { state: "UNAVAILABLE", text: null },
      author: null,
    });
    expect(
      (
        await f.sql`select title,body,spoiler_context,rating_half_stars,author_state from community_contents where id=${root.id}`
      )[0],
    ).toMatchObject({
      title: "",
      body: "",
      spoiler_context: null,
      rating_half_stars: null,
      author_state: "DELETED",
    });
    const published = await f.admin.request.post(
      `/api/admin/catalog/works/${f.work.id}/visibility`,
      {
        timeout: 45_000,
        headers: { Origin: baseURL! },
        data: {
          revision: hiddenWork.revision,
          visibility: "PUBLISHED",
          publicationReviewAcknowledged: true,
        },
      },
    );
    expect(published.status()).toBe(200);
    expect(
      (
        await f.anonymous.goto(
          `/vi/works/${f.work.slug}/discussions/${root.id}`,
        )
      )?.status(),
    ).toBe(200);
    await expect(
      f.anonymous.getByText(survivor, { exact: true }),
    ).toBeVisible();
    await expect(
      f.anonymous.getByText(communityCopy.vi.deleted, { exact: true }),
    ).toBeVisible();
    await expect(
      f.anonymous.getByRole("button", {
        name: communityCopy.vi.reply,
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      f.anonymous.getByRole("button", {
        name: communityCopy.vi.checkOwner,
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      (
        await f.sql`select body,author_state from community_contents where id=${reply.id}`
      )[0],
    ).toMatchObject({ body: survivor, author_state: "ACTIVE" });
  } finally {
    await f.close();
  }
});
