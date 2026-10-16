import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "../helpers/browser-test";
import { communityBrowserFixture } from "../helpers/community-browser-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import { reviewCopy } from "../../apps/web/src/lib/review-i18n";
import {
  reviewListResponseSchema,
  reviewMutationResponseSchema,
  reviewOwnedListResponseSchema,
  reviewRevealResponseSchema,
} from "../../apps/web/src/features/community/review-http-contracts";
import { personalHttpDetailsSchema } from "../../apps/web/src/features/library/personal-http-contracts";

test.describe.configure({ retries: 0 });
async function mutation(
  page: Page,
  path: string,
  method: string,
  action: () => Promise<void>,
) {
  const pending = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === path &&
      response.request().method() === method,
    { timeout: 45_000 },
  );
  await action();
  const response = await pending;
  expect(response.status()).toBe(200);
  const input = response.request().postDataJSON();
  expect(input).not.toHaveProperty("userId");
  expect(input).not.toHaveProperty("authorId");
  expect(input.publicSubmissionAcknowledged ?? true).toBe(true);
  return reviewMutationResponseSchema.parse(await response.json());
}
for (const locale of ["en", "vi"] as const) {
  test(`actual ${locale} independent public review, unrated mean, private isolation, spoiler reveal and unavailable owner withdrawal`, async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(360_000);
    expect(baseURL).toBeTruthy();
    const f = await communityBrowserFixture(page, browser, baseURL!);
    const t = reviewCopy[locale];
    const path = `/api/community/works/${f.work.id}/reviews`;
    const hiddenBody = `<script>window.__REVIEW_UNSAFE__=true</script> synthetic-review-${f.run}`;
    const hiddenContext = `synthetic-review-context-${f.run}`;
    const privateNote = `Synthetic private-only note ${f.run}`;
    let libraryId: string | undefined;
    let reveals = 0;
    const documents = new Map<string, number>();
    page.on("response", (response) => {
      if (response.request().resourceType() === "document")
        documents.set(new URL(response.url()).pathname, response.status());
    });
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith("/reveal")) reveals++;
    });
    async function publicList() {
      const response = await f.anonymous.request.get(
        `${path}?locale=${locale}`,
        { timeout: 30_000 },
      );
      expect(response.status()).toBe(200);
      const raw = await response.text();
      for (const marker of [privateNote, hiddenBody, hiddenContext])
        expect(raw).not.toContain(marker);
      expect(raw).not.toContain('"notes"');
      return reviewListResponseSchema.parse(JSON.parse(raw));
    }
    try {
      expect(
        (
          await f.sql`select count(*)::int as count from library_entries where user_id=${f.owner!.id!}`
        )[0].count,
      ).toBe(0);
      expect((await publicList()).statistics).toEqual({
        reviewCount: 0,
        ratedReviewCount: 0,
        meanRating: null,
      });
      await page.goto(`/${locale}/works/${f.work.slug}`);
      await page
        .getByRole("link", {
          name: locale === "vi" ? "Đánh giá công khai" : t.reviews,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", { name: t.reviews, level: 1, exact: true }),
      ).toBeVisible();
      expect(documents.get(`/${locale}/works/${f.work.slug}/reviews`)).toBe(
        200,
      );
      await page
        .getByRole("button", { name: t.newReview, exact: true })
        .click();
      const form = page.getByRole("form", { name: t.newReview, exact: true });
      await expect(form.getByLabel(t.reviewBody, { exact: true })).toHaveValue(
        "",
      );
      await expect(form.getByLabel(t.rating, { exact: true })).toHaveValue("");
      await expect(
        form.getByLabel(t.intent, { exact: true }),
      ).not.toBeChecked();
      await form.getByLabel(t.reviewBody, { exact: true }).fill(hiddenBody);
      await form.getByLabel(t.bodySpoiler, { exact: true }).check();
      await form.getByLabel(t.context, { exact: true }).fill(hiddenContext);
      await form.getByLabel(t.rating, { exact: true }).selectOption("unrated");
      await expect(
        form.getByRole("button", { name: t.submit, exact: true }),
      ).toBeDisabled();
      await form.getByLabel(t.intent, { exact: true }).check();
      const created = await mutation(page, path, "POST", () =>
        form.getByRole("button", { name: t.submit, exact: true }).click(),
      );
      const id = created.content.id;
      expect(created.content).toMatchObject({
        kind: "REVIEW",
        body: { state: "MASKED", text: null },
        ratingHalfStars: null,
        spoilerContext: null,
      });
      await expect(
        page.getByRole("form", { name: t.newReview, exact: true }),
      ).toHaveCount(0);
      expect((await publicList()).statistics).toEqual({
        reviewCount: 1,
        ratedReviewCount: 0,
        meanRating: null,
      });
      const html = await f.anonymous.request.get(
        `/${locale}/works/${f.work.slug}/reviews`,
        { timeout: 30_000 },
      );
      expect(html.status()).toBe(200);
      const initialHtml = await html.text();
      for (const marker of [hiddenBody, hiddenContext, privateNote]) {
        expect(initialHtml).not.toContain(marker);
        expect(await page.content()).not.toContain(marker);
      }
      expect(reveals).toBe(0);
      await page.getByLabel(t.revealAck, { exact: true }).check();
      const revealPending = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `${path}/${id}/reveal` &&
          response.request().method() === "POST",
        { timeout: 45_000 },
      );
      await page
        .getByRole("button", { name: t.revealBody, exact: true })
        .click();
      const revealed = await revealPending;
      expect(revealed.status()).toBe(200);
      expect(revealed.request().postDataJSON()).toMatchObject({
        workId: f.work.id,
        targetId: id,
        contentKind: "REVIEW",
        expectedRevision: 1,
        title: false,
        body: true,
        spoilerRevealAcknowledged: true,
      });
      expect(
        reviewRevealResponseSchema.parse(await revealed.json()),
      ).toMatchObject({ body: hiddenBody, spoilerContext: hiddenContext });
      await expect(page.getByText(hiddenBody, { exact: true })).toBeVisible();
      await expect(
        page.getByText(hiddenContext, { exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => "__REVIEW_UNSAFE__" in window)).toBe(
        false,
      );

      const added = await page.request.post("/api/library", {
        timeout: 45_000,
        headers: { Origin: baseURL! },
        data: { workId: f.work.id, mutationKey: randomUUID() },
      });
      expect(added.status()).toBe(200);
      const entry = (await added.json()) as { id: string; revision: number };
      libraryId = entry.id;
      const privateResponse = await page.request.patch(
        `/api/library/${libraryId}/personal?locale=${locale}`,
        {
          timeout: 45_000,
          headers: { Origin: baseURL! },
          data: {
            revision: entry.revision,
            mutationKey: randomUUID(),
            patch: { ratingHalfStars: 10, notes: privateNote },
          },
        },
      );
      expect(privateResponse.status()).toBe(200);
      expect(
        personalHttpDetailsSchema.parse(await privateResponse.json()),
      ).toMatchObject({ ratingHalfStars: 10, notes: privateNote });
      expect((await publicList()).statistics).toEqual({
        reviewCount: 1,
        ratedReviewCount: 0,
        meanRating: null,
      });
      const other = await f.admin.request.post(path, {
        timeout: 45_000,
        headers: { Origin: baseURL! },
        data: {
          mutationKey: randomUUID(),
          body: "Synthetic independently deliberate second public review",
          bodySpoiler: false,
          spoilerContext: null,
          publicSubmissionAcknowledged: true,
          rating: 8,
        },
      });
      expect(other.status()).toBe(200);
      reviewMutationResponseSchema.parse(await other.json());
      expect((await publicList()).statistics).toEqual({
        reviewCount: 2,
        ratedReviewCount: 1,
        meanRating: 4,
      });

      await page
        .getByRole("button", { name: t.newReview, exact: true })
        .click();
      await expect(page.getByText(t.reserved, { exact: true })).toBeVisible();
      expect(await page.content()).not.toContain(hiddenBody);
      await expect(
        page.getByRole("form", { name: t.newReview, exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: t.edit, exact: true }).click();
      const replacement = page.getByRole("form", {
        name: t.replacement,
        exact: true,
      });
      await expect(
        replacement.getByLabel(t.reviewBody, { exact: true }),
      ).toHaveValue("");
      await expect(
        replacement.getByLabel(t.rating, { exact: true }),
      ).toHaveValue("");
      await expect(
        replacement.getByLabel(t.replacementIntent, { exact: true }),
      ).not.toBeChecked();
      await expect(
        replacement.getByLabel(t.intent, { exact: true }),
      ).not.toBeChecked();
      await replacement
        .getByLabel(t.reviewBody, { exact: true })
        .fill(
          "Synthetic fresh public replacement, independent of private note",
        );
      await replacement.getByLabel(t.rating, { exact: true }).selectOption("2");
      await replacement.getByLabel(t.intent, { exact: true }).check();
      await expect(
        replacement.getByRole("button", { name: t.save, exact: true }),
      ).toBeDisabled();
      await replacement
        .getByLabel(t.replacementIntent, { exact: true })
        .check();
      const edited = await mutation(page, `${path}/${id}`, "PATCH", () =>
        replacement.getByRole("button", { name: t.save, exact: true }).click(),
      );
      expect(edited.content).toMatchObject({
        revision: 2,
        ratingHalfStars: 2,
        body: {
          state: "VISIBLE",
          text: "Synthetic fresh public replacement, independent of private note",
        },
      });
      expect((await publicList()).statistics).toEqual({
        reviewCount: 2,
        ratedReviewCount: 2,
        meanRating: 2.5,
      });
      const privateStill = await page.request.get(
        `/api/library/${libraryId}/personal?locale=${locale}`,
        { timeout: 30_000 },
      );
      expect(privateStill.status()).toBe(200);
      expect(
        personalHttpDetailsSchema.parse(await privateStill.json()),
      ).toMatchObject({ ratingHalfStars: 10, notes: privateNote });
      expect(await page.content()).not.toContain(privateNote);
      const wrongOwner = await f.admin.request.get(
        `${path}/${id}/owned?locale=${locale}&contentKind=REVIEW`,
        { timeout: 30_000 },
      );
      expect(wrongOwner.status()).toBe(404);
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
          await f.anonymous.request.get(`${path}?locale=${locale}`, {
            timeout: 30_000,
          })
        ).status(),
      ).toBe(404);
      await page.goto(`/${locale}/community/reviews/manage`);
      await expect(
        page.getByRole("heading", { name: t.manage, level: 1, exact: true }),
      ).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
      );
      const ownerHtml = await page.content();
      for (const marker of [
        privateNote,
        hiddenBody,
        hiddenContext,
        f.work.slug,
        "Synthetic fresh public replacement, independent of private note",
      ])
        expect(ownerHtml).not.toContain(marker);
      const ownerResponse = await page.request.get(
        `/api/community/reviews/owned?locale=${locale}`,
        { timeout: 30_000 },
      );
      expect(ownerResponse.status()).toBe(200);
      const owned = reviewOwnedListResponseSchema.parse(
        await ownerResponse.json(),
      );
      expect(owned.items.find((item) => item.id === id)).toMatchObject({
        workAvailable: false,
        canEdit: false,
        canWithdraw: true,
      });
      expect(
        Object.keys(owned.items.find((item) => item.id === id)!).sort(),
      ).toEqual(
        [
          "id",
          "workId",
          "kind",
          "threadId",
          "parentId",
          "depth",
          "revision",
          "authorState",
          "moderationState",
          "workAvailable",
          "canEdit",
          "canWithdraw",
        ].sort(),
      );
      await page.getByLabel(t.withdrawAck, { exact: true }).check();
      const withdrawn = await mutation(
        page,
        `${path}/${id}/withdraw`,
        "POST",
        () =>
          page.getByRole("button", { name: t.withdraw, exact: true }).click(),
      );
      expect(withdrawn.content).toMatchObject({
        state: "DELETED",
        body: { state: "UNAVAILABLE", text: null },
        ratingHalfStars: null,
        spoilerContext: null,
        author: null,
      });
      expect(
        (
          await f.sql`select body,rating_half_stars,spoiler_context,author_state from community_contents where id=${id}`
        )[0],
      ).toMatchObject({
        body: "",
        rating_half_stars: null,
        spoiler_context: null,
        author_state: "DELETED",
      });
      const restored = await f.admin.request.post(
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
      expect(restored.status()).toBe(200);
      const final = await publicList();
      expect(final.statistics).toEqual({
        reviewCount: 1,
        ratedReviewCount: 1,
        meanRating: 4,
      });
      expect(final.items.some((item) => item.id === id)).toBe(false);
    } finally {
      requireTestDatabase();
      if (libraryId)
        await f.sql`delete from library_entries where id=${libraryId} and user_id=${f.owner!.id!} and work_id=${f.work.id}`;
      await f.close();
    }
  });
}
