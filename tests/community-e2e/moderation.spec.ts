import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../helpers/browser-test";
import { communityBrowserFixture } from "../helpers/community-browser-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import { communityCopy } from "../../apps/web/src/lib/community-i18n";
import { reviewCopy } from "../../apps/web/src/lib/review-i18n";
import { moderationCopy } from "../../apps/web/src/lib/moderation-i18n";
import {
  discussionListResponseSchema,
  discussionMutationResponseSchema,
  discussionPublicSchema,
} from "../../apps/web/src/features/community/http-contracts";
import {
  reviewListResponseSchema,
  reviewMutationResponseSchema,
  reviewSlotResponseSchema,
} from "../../apps/web/src/features/community/review-http-contracts";
import {
  communityCommandResponseSchema,
  moderationCommandSchema,
  moderationEvidenceInputSchema,
  moderationEvidenceResponseSchema,
  moderationHistoryResponseSchema,
  moderationQueueResponseSchema,
  moderationTargetSchema,
  ownedReportListResponseSchema,
  ownedReportSchema,
  reportCreateSchema,
  type CommunityCommandResponseDTO,
} from "../../apps/web/src/features/community/moderation-http-contracts";
import { personalHttpDetailsSchema } from "../../apps/web/src/features/library/personal-http-contracts";

test.describe.configure({ retries: 0 });
type Kind = "THREAD" | "REPLY" | "REVIEW";
type Target = { id: string; kind: Kind; revision: number };
async function browserResponse(
  page: Page,
  path: string,
  method: string,
  action: () => Promise<void>,
) {
  const pending = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === path &&
      response.request().method() === method,
    { timeout: method === "GET" ? 30_000 : 45_000 },
  );
  await action();
  const response = await pending;
  expect(response.status()).toBe(200);
  return response;
}
function minimalCommand(
  value: unknown,
  target: Target,
  workId: string,
): CommunityCommandResponseDTO {
  const result = communityCommandResponseSchema.parse(value);
  expect(result.content).toMatchObject({
    id: target.id,
    workId,
    kind: target.kind,
  });
  expect(Object.keys(result.content).sort()).toEqual(
    ["id", "workId", "kind", "revision"].sort(),
  );
  return result;
}
for (const locale of ["en", "vi"] as const) {
  test(`actual ${locale} private reports, scoped moderator evidence, manual decisions, visibility-only restore and erasure isolation`, async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(360_000);
    expect(baseURL).toBeTruthy();
    const f = await communityBrowserFixture(page, browser, baseURL!);
    const t = moderationCopy[locale],
      b = communityCopy[locale],
      r = reviewCopy[locale];
    const threadMarker = `D-private-thread-${f.run}`,
      replyMarker = `D-private-reply-${f.run}`;
    const childMarker = `D-private-child-${f.run}`,
      reviewMarker = `D-private-review-${f.run}`;
    const title = `D-private-title-${f.run}`,
      context = `D-private-context-${f.run}`;
    const reviewBody = `<script>window.__V4D_UNSAFE__=true</script> ${reviewMarker}`;
    const explanation = `Private review report quote ${reviewMarker}`;
    const hideReason = `Manual private hide quote ${reviewMarker}`;
    const privateNote = `D-private-library-note-${f.run}`;
    const authoredMarkers = [
      threadMarker,
      replyMarker,
      childMarker,
      reviewMarker,
      title,
      context,
    ];
    const privateMarkers = [
      ...authoredMarkers,
      explanation,
      hideReason,
      privateNote,
      `Synthetic ${f.run}`,
      f.owner!.email,
      f.work.slug,
      `Synthetic public work ${f.run}`,
    ];
    const contentsRoot = `/api/community/works/${f.work.id}/contents`;
    const reviewRoot = `/api/community/works/${f.work.id}/reviews`;
    const threadRoot = `/api/community/works/${f.work.id}/threads`;
    const reports = new Map<
      string,
      { id: string; state: "OPEN" | "DISMISSED" | "UPHELD"; revision: number }
    >();
    let libraryId: string | undefined;
    let evidenceRequests = 0,
      publicReveals = 0,
      privateReadRequests = 0;
    const moderatorDiagnostics: string[] = [];
    f.admin.on("pageerror", (error) => moderatorDiagnostics.push(error.name));
    f.admin.on("console", (message) => {
      if (
        /hydration failed|hydrated.*didn't match|text content does not match/i.test(
          message.text(),
        )
      )
        moderatorDiagnostics.push("React hydration diagnostic");
    });
    const documents = new Map<string, number>();
    for (const targetPage of [page, f.admin]) {
      targetPage.on("response", (response) => {
        if (response.request().resourceType() === "document")
          documents.set(new URL(response.url()).pathname, response.status());
      });
      targetPage.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        if (path.endsWith("/moderation/context")) evidenceRequests++;
        if (
          path.startsWith("/api/community/") &&
          (path.includes("/moderation/") || path.endsWith("/moderation"))
        )
          privateReadRequests++;
        if (path.endsWith("/reveal")) publicReveals++;
      });
    }
    function absent(text: string, markers = privateMarkers) {
      for (const marker of markers) expect(text).not.toContain(marker);
    }
    async function targetMetadata(target: Target) {
      const response = await f.admin.request.get(
        `${contentsRoot}/${target.id}/moderation/metadata?locale=${locale}&kind=${target.kind}`,
        { timeout: 30_000 },
      );
      expect(response.status()).toBe(200);
      absent(await response.text());
      const result = moderationTargetSchema.parse(await response.json());
      expect(result).toMatchObject({
        id: target.id,
        workId: f.work.id,
        kind: target.kind,
      });
      return result;
    }
    async function publicReviews() {
      const response = await f.anonymous.request.get(
        `${reviewRoot}?locale=${locale}`,
        { timeout: 30_000 },
      );
      expect(response.status()).toBe(200);
      absent(await response.text());
      return reviewListResponseSchema.parse(await response.json());
    }
    async function queue(state: "OPEN" | "DISMISSED" | "UPHELD") {
      const response = await f.admin.request.get(
        `/api/community/moderation/reports?locale=${locale}&state=${state}`,
        { timeout: 30_000 },
      );
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect(response.headers()["x-robots-tag"]).toBe("noindex");
      absent(await response.text());
      return moderationQueueResponseSchema.parse(await response.json());
    }
    async function selectReport(
      target: Target,
      state: "OPEN" | "DISMISSED" | "UPHELD",
      reload = true,
    ) {
      if (reload) {
        await f.admin.getByLabel(t.filter, { exact: true }).selectOption(state);
        const response = await browserResponse(
          f.admin,
          "/api/community/moderation/reports",
          "GET",
          () =>
            f.admin
              .getByRole("button", { name: t.refresh, exact: true })
              .click(),
        );
        absent(await response.text());
        const data = moderationQueueResponseSchema.parse(await response.json());
        expect(
          data.items.some(
            (item) =>
              item.id === reports.get(target.id)!.id &&
              item.target.id === target.id,
          ),
        ).toBe(true);
      }
      const item = f.admin.getByRole("article", {
        name: `${t.reportId} ${reports.get(target.id)!.id}`,
        exact: true,
      });
      const before = evidenceRequests,
        beforePrivateRead = privateReadRequests;
      await item
        .getByRole("button", { name: t.selectTarget, exact: true })
        .hover();
      await item
        .getByRole("button", { name: t.selectTarget, exact: true })
        .click();
      const panel = f.admin.getByRole("region", {
        name: `${t.content} ${target.id}`,
        exact: true,
      });
      await expect(
        panel.getByLabel(t.evidenceSection, { exact: true }),
      ).toHaveValue("");
      await expect(panel.getByLabel(t.reason, { exact: true })).toHaveValue("");
      expect(evidenceRequests).toBe(before);
      expect(privateReadRequests).toBe(beforePrivateRead);
      return panel;
    }
    async function selectedEvidence(
      panel: Locator,
      target: Target,
      selection:
        | "TITLE"
        | "BODY"
        | "SPOILER_CONTEXT"
        | "REPORT"
        | "ACTION_REASON",
    ) {
      await panel
        .getByLabel(t.evidenceSection, { exact: true })
        .selectOption(selection);
      await expect(
        panel.getByLabel(t.evidenceAck, { exact: true }),
      ).not.toBeChecked();
      await expect(
        panel.getByLabel(t.revealAck, { exact: true }),
      ).not.toBeChecked();
      await panel.getByLabel(t.evidenceAck, { exact: true }).check();
      await expect(
        panel.getByRole("button", { name: t.revealEvidence, exact: true }),
      ).toBeDisabled();
      await panel.getByLabel(t.revealAck, { exact: true }).check();
      const response = await browserResponse(
        f.admin,
        `${contentsRoot}/${target.id}/moderation/context`,
        "POST",
        () =>
          panel
            .getByRole("button", { name: t.revealEvidence, exact: true })
            .click(),
      );
      const input = moderationEvidenceInputSchema.parse(
        response.request().postDataJSON(),
      );
      expect(input).toMatchObject({
        workId: f.work.id,
        targetId: target.id,
        contentKind: target.kind,
        selection,
        evidenceSelectionAcknowledged: true,
        spoilerRevealAcknowledged: true,
      });
      const result = moderationEvidenceResponseSchema.parse(
        await response.json(),
      );
      expect(result).toMatchObject({
        id: target.id,
        workId: f.work.id,
        kind: target.kind,
        revision: input.expectedRevision,
        selection,
      });
      await expect(panel.getByLabel(t.reason, { exact: true })).toHaveValue("");
      await expect(
        panel.getByLabel(t.evidenceAck, { exact: true }),
      ).not.toBeChecked();
      await expect(
        panel.getByLabel(t.revealAck, { exact: true }),
      ).not.toBeChecked();
      return result;
    }
    async function uiDecision(
      panel: Locator,
      target: Target,
      action: "DISMISS" | "HIDE" | "RESTORE",
      reason: string,
    ) {
      await panel
        .getByRole("combobox", { name: t.action, exact: true })
        .selectOption(action);
      await expect(panel.getByLabel(t.reason, { exact: true })).toHaveValue("");
      await expect(
        panel.getByLabel(t.actionIntent, { exact: true }),
      ).not.toBeChecked();
      await panel.getByLabel(t.reason, { exact: true }).fill(reason);
      await expect(
        panel.getByRole("button", { name: t.apply, exact: true }),
      ).toBeDisabled();
      await panel.getByLabel(t.actionIntent, { exact: true }).check();
      const response = await browserResponse(
        f.admin,
        `${contentsRoot}/${target.id}/moderation`,
        "POST",
        () => panel.getByRole("button", { name: t.apply, exact: true }).click(),
      );
      const input = moderationCommandSchema.parse(
        response.request().postDataJSON(),
      );
      expect(input).toMatchObject({ contentKind: target.kind, action, reason });
      expect(response.request().postDataJSON()).not.toHaveProperty(
        "actionIntent",
      );
      const result = minimalCommand(await response.json(), target, f.work.id);
      if (action === "RESTORE")
        expect(input).toMatchObject({
          reportId: null,
          expectedReportRevision: null,
        });
      else
        expect(input).toMatchObject({
          reportId: reports.get(target.id)!.id,
          expectedReportRevision: 1,
        });
      await expect(
        f.admin.getByText(t.decisionSuccess, { exact: true }),
      ).toBeVisible();
      return result;
    }
    async function directDecision(
      target: Target,
      action: "HIDE" | "RESTORE",
      expectedStatus = 200,
      expectedError = "COMMUNITY_NOT_FOUND",
    ) {
      const metadata = await targetMetadata(target);
      const response = await f.admin.request.post(
        `${contentsRoot}/${target.id}/moderation`,
        {
          timeout: 45_000,
          headers: { Origin: baseURL! },
          data: {
            mutationKey: randomUUID(),
            action,
            contentKind: target.kind,
            expectedRevision: metadata.revision,
            reportId: null,
            expectedReportRevision: null,
            reason: `Deliberate synthetic ${action.toLowerCase()} decision`,
          },
        },
      );
      expect(response.status()).toBe(expectedStatus);
      if (expectedStatus !== 200) {
        expect(await response.json()).toEqual({ error: expectedError });
        return null;
      }
      const result = minimalCommand(await response.json(), target, f.work.id);
      expect(result.report).toBeNull();
      return result;
    }
    async function ownStatus(
      target: Target,
      state: "OPEN" | "DISMISSED" | "UPHELD",
    ) {
      const response = await page.request.get(
        `/api/community/reports/${reports.get(target.id)!.id}/owned?locale=${locale}`,
        { timeout: 30_000 },
      );
      expect(response.status()).toBe(200);
      absent(await response.text());
      const result = ownedReportSchema.parse(await response.json());
      expect(result).toMatchObject({
        contentId: target.id,
        contentKind: target.kind,
        workId: f.work.id,
        state,
      });
      return result;
    }
    async function reportThroughUI(
      target: Target,
      card: Locator,
      reason: "SPAM" | "HARASSMENT" | "OTHER",
      text = "",
    ) {
      await card.getByRole("button", { name: t.report, exact: true }).click();
      const form = card.getByRole("form", { name: t.reportForm, exact: true });
      await expect(
        form.getByLabel(t.reportReason, { exact: true }),
      ).toHaveValue("");
      await expect(form.getByLabel(t.explanation, { exact: true })).toHaveValue(
        "",
      );
      await expect(form.getByLabel(b.intent, { exact: true })).toHaveCount(0);
      await form
        .getByLabel(t.reportReason, { exact: true })
        .selectOption(reason);
      if (reason === "OTHER") {
        await expect(
          form.getByRole("button", { name: t.submitReport, exact: true }),
        ).toBeDisabled();
        await form.getByLabel(t.explanation, { exact: true }).fill(text);
      }
      const response = await browserResponse(
        page,
        `${contentsRoot}/${target.id}/reports`,
        "POST",
        () =>
          form
            .getByRole("button", { name: t.submitReport, exact: true })
            .click(),
      );
      const raw = response.request().postDataJSON();
      expect(Object.keys(raw).sort()).toEqual(
        [
          "mutationKey",
          "contentKind",
          "expectedRevision",
          "reason",
          "explanation",
        ].sort(),
      );
      expect(reportCreateSchema.parse(raw)).toMatchObject({
        contentKind: target.kind,
        expectedRevision: target.revision,
        reason,
        explanation: text,
      });
      const result = minimalCommand(await response.json(), target, f.work.id);
      expect(result.report).toMatchObject({ state: "OPEN", revision: 1 });
      expect(result.content.revision).toBe(target.revision);
      reports.set(target.id, result.report!);
      await expect(
        card.getByText(t.reportSuccess, { exact: true }),
      ).toBeVisible();
      const statusResponse = await browserResponse(
        page,
        `/api/community/reports/${result.report!.id}/owned`,
        "GET",
        () =>
          card
            .getByRole("button", { name: t.refreshReport, exact: true })
            .click(),
      );
      absent(await statusResponse.text());
      expect(
        ownedReportSchema.parse(await statusResponse.json()),
      ).toMatchObject({
        id: result.report!.id,
        contentId: target.id,
        contentKind: target.kind,
        state: "OPEN",
        revision: 1,
      });
      expect(publicReveals).toBe(0);
      return result;
    }
    async function privateFingerprint() {
      return (
        await f.sql`select md5(row_to_json(e)::text) as entry,
        (select md5(coalesce(string_agg(row_to_json(v)::text,'' order by v.id),'')) from library_events v where v.entry_id=e.id and v.user_id=${f.owner!.id!}) as events
        from library_entries e where e.id=${libraryId!} and e.user_id=${f.owner!.id!} and e.work_id=${f.work.id}`
      )[0];
    }
    try {
      expect(
        (
          await f.sql`select count(*)::int as count from library_entries where user_id=${f.owner!.id!}`
        )[0].count,
      ).toBe(0);
      const threadResponse = await page.request.post(threadRoot, {
        timeout: 45_000,
        headers: { Origin: baseURL! },
        data: {
          mutationKey: randomUUID(),
          title,
          body: threadMarker,
          titleSpoiler: true,
          bodySpoiler: true,
          spoilerContext: context,
          publicSubmissionAcknowledged: true,
        },
      });
      expect(threadResponse.status()).toBe(200);
      const threadContent = discussionMutationResponseSchema.parse(
        await threadResponse.json(),
      ).content;
      const thread: Target = {
        id: threadContent.id,
        kind: "THREAD",
        revision: 1,
      };
      async function createReply(
        body: string,
        parentId: string | null,
        depth: number,
      ) {
        const response = await page.request.post(
          `${threadRoot}/${thread.id}/replies`,
          {
            timeout: 45_000,
            headers: { Origin: baseURL! },
            data: {
              mutationKey: randomUUID(),
              body,
              bodySpoiler: true,
              spoilerContext: context,
              publicSubmissionAcknowledged: true,
              threadId: thread.id,
              parentId,
              depth,
            },
          },
        );
        expect(response.status()).toBe(200);
        return discussionMutationResponseSchema.parse(await response.json())
          .content;
      }
      const rootContent = await createReply(replyMarker, null, 0);
      const childContent = await createReply(childMarker, rootContent.id, 1);
      const reply: Target = { id: rootContent.id, kind: "REPLY", revision: 1 };
      const reviewResponse = await page.request.post(reviewRoot, {
        timeout: 45_000,
        headers: { Origin: baseURL! },
        data: {
          mutationKey: randomUUID(),
          body: reviewBody,
          bodySpoiler: true,
          spoilerContext: context,
          publicSubmissionAcknowledged: true,
          rating: 8,
        },
      });
      expect(reviewResponse.status()).toBe(200);
      const reviewContent = reviewMutationResponseSchema.parse(
        await reviewResponse.json(),
      ).content;
      const review: Target = {
        id: reviewContent.id,
        kind: "REVIEW",
        revision: 1,
      };
      expect((await publicReviews()).statistics).toEqual({
        reviewCount: 1,
        ratedReviewCount: 1,
        meanRating: 4,
      });

      await page.goto(`/${locale}/works/${f.work.slug}`);
      await page
        .getByRole("link", { name: b.discussions, exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: b.discussions,
          level: 1,
          exact: true,
        }),
      ).toBeVisible();
      expect(documents.get(`/${locale}/works/${f.work.slug}/discussions`)).toBe(
        200,
      );
      absent(await page.content(), [...authoredMarkers, privateNote]);
      await reportThroughUI(thread, page.locator("article").first(), "SPAM");
      await page
        .getByRole("link", { name: b.openDiscussion, exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: b.conversation,
          level: 1,
          exact: true,
        }),
      ).toBeVisible();
      expect(
        documents.get(
          `/${locale}/works/${f.work.slug}/discussions/${thread.id}`,
        ),
      ).toBe(200);
      await reportThroughUI(
        reply,
        page.locator("article").filter({
          has: page.getByText(`${b.replyLevel} 1`, { exact: true }),
        }),
        "HARASSMENT",
      );
      absent(await page.content(), [...authoredMarkers, privateNote]);
      await page.goto(`/${locale}/works/${f.work.slug}`);
      await page
        .getByRole("link", {
          name: locale === "vi" ? "Đánh giá công khai" : r.reviews,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", { name: r.reviews, level: 1, exact: true }),
      ).toBeVisible();
      expect(documents.get(`/${locale}/works/${f.work.slug}/reviews`)).toBe(
        200,
      );
      await reportThroughUI(
        review,
        page.locator("article").first(),
        "OTHER",
        explanation,
      );
      expect(
        (
          await f.sql`select count(*)::int as count from library_entries where user_id=${f.owner!.id!}`
        )[0].count,
      ).toBe(0);
      expect(publicReveals).toBe(0);

      await page.goto(`/${locale}/settings`);
      await page.getByRole("link", { name: t.reports, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: t.reports, level: 1, exact: true }),
      ).toBeVisible();
      expect(documents.get(`/${locale}/community/reports/manage`)).toBe(200);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
      );
      absent(await page.content());
      const own = await page.request.get(
        `/api/community/reports/owned?locale=${locale}`,
        { timeout: 30_000 },
      );
      expect(own.status()).toBe(200);
      absent(await own.text());
      const ownReports = ownedReportListResponseSchema.parse(await own.json());
      expect(ownReports.items).toHaveLength(3);
      for (const target of [thread, reply, review])
        await ownStatus(target, "OPEN");

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
      const beforePrivate = await privateFingerprint();

      const denied = await page.request.post(
        `${contentsRoot}/${review.id}/moderation/context`,
        {
          timeout: 45_000,
          headers: { Origin: baseURL!, "Content-Type": "application/json" },
          data: "{invalid-json",
        },
      );
      expect(denied.status()).toBe(403);
      const initialSSR = await f.admin.request.get(
        `/${locale}/community/moderation`,
        { timeout: 30_000 },
      );
      expect(initialSSR.status()).toBe(200);
      absent(await initialSSR.text());
      expect(await initialSSR.text()).not.toContain(f.work.slug);
      await f.admin.goto(`/${locale}/settings`);
      await f.admin
        .getByRole("link", { name: t.moderation, exact: true })
        .click();
      await expect(
        f.admin.getByRole("heading", {
          name: t.moderation,
          level: 1,
          exact: true,
        }),
      ).toBeVisible();
      expect(documents.get(`/${locale}/community/moderation`)).toBe(200);
      await expect(f.admin.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
      );
      absent(await f.admin.content());
      expect(evidenceRequests).toBe(0);
      expect(privateReadRequests).toBe(0);
      expect(
        (await queue("OPEN")).items.filter(
          (item) => item.target.workId === f.work.id,
        ),
      ).toHaveLength(3);
      let panel = await selectReport(thread, "OPEN", false);
      expect(await selectedEvidence(panel, thread, "TITLE")).toMatchObject({
        selection: "TITLE",
        state: "AVAILABLE",
        text: title,
      });
      expect(await f.admin.content()).not.toContain(threadMarker);
      expect(await f.admin.content()).not.toContain(context);
      expect(await selectedEvidence(panel, thread, "BODY")).toMatchObject({
        selection: "BODY",
        state: "AVAILABLE",
        text: threadMarker,
      });
      expect(await f.admin.content()).not.toContain(title);
      expect(
        await selectedEvidence(panel, thread, "SPOILER_CONTEXT"),
      ).toMatchObject({
        selection: "SPOILER_CONTEXT",
        state: "AVAILABLE",
        text: context,
      });
      expect(await f.admin.content()).not.toContain(threadMarker);
      const reportEvidence = await selectedEvidence(panel, thread, "REPORT");
      expect(reportEvidence).toMatchObject({
        selection: "REPORT",
        state: "AVAILABLE",
        reason: "SPAM",
        explanation: "",
      });
      expect(reportEvidence).not.toHaveProperty("text");
      const eventsResponse = await browserResponse(
        f.admin,
        `${contentsRoot}/${thread.id}/moderation/history`,
        "GET",
        () =>
          panel.getByRole("button", { name: t.events, exact: true }).click(),
      );
      absent(await eventsResponse.text());
      const events = moderationHistoryResponseSchema.parse(
        await eventsResponse.json(),
      );
      expect(events).toMatchObject({
        stream: "EVENTS",
        pageSize: 25,
        nextCursor: null,
      });
      expect(events.items).toHaveLength(1);

      panel = await selectReport(review, "OPEN", false);
      expect(await f.admin.content()).not.toContain(context);
      expect(await selectedEvidence(panel, review, "BODY")).toMatchObject({
        selection: "BODY",
        state: "AVAILABLE",
        text: reviewBody,
      });
      await expect(
        f.admin.getByText(reviewBody, { exact: true }),
      ).toBeVisible();
      expect(await f.admin.evaluate(() => "__V4D_UNSAFE__" in window)).toBe(
        false,
      );
      await panel
        .getByRole("combobox", { name: t.action, exact: true })
        .selectOption("HIDE");
      await panel.getByLabel(t.reason, { exact: true }).fill(hideReason);
      await panel.getByLabel(t.actionIntent, { exact: true }).check();
      const frozen: string[] = [];
      let committed: CommunityCommandResponseDTO | undefined;
      const hidePath = `${contentsRoot}/${review.id}/moderation`;
      await f.admin.route(`**${hidePath}`, async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        frozen.push(route.request().postData()!);
        const response = await route.fetch({ timeout: 45_000 });
        expect(response.status()).toBe(200);
        const result = minimalCommand(await response.json(), review, f.work.id);
        if (frozen.length === 1) {
          expect(result.replayed).toBe(false);
          committed = result;
          await route.abort("connectionreset");
        } else {
          expect(result.replayed).toBe(true);
          expect(result.content).toEqual(committed!.content);
          await route.fulfill({ response });
        }
      });
      try {
        await panel.getByRole("button", { name: t.apply, exact: true }).click();
        await expect(
          panel.getByRole("button", { name: t.retry, exact: true }),
        ).toBeVisible();
        await expect(
          panel.getByLabel(t.reason, { exact: true }),
        ).toBeDisabled();
        expect(frozen).toHaveLength(1);
        expect(committed!.report).toMatchObject({
          id: reports.get(review.id)!.id,
          state: "UPHELD",
          revision: 2,
        });
        const replay = await browserResponse(f.admin, hidePath, "POST", () =>
          panel.getByRole("button", { name: t.retry, exact: true }).click(),
        );
        expect(
          minimalCommand(await replay.json(), review, f.work.id).replayed,
        ).toBe(true);
        expect(frozen).toHaveLength(2);
        expect(frozen[1]).toBe(frozen[0]);
        expect(
          moderationCommandSchema.parse(JSON.parse(frozen[0]!)),
        ).toMatchObject({
          contentKind: "REVIEW",
          action: "HIDE",
          expectedRevision: 1,
          reportId: reports.get(review.id)!.id,
          expectedReportRevision: 1,
          reason: hideReason,
        });
        expect(
          (
            await f.sql`select count(*)::int as count from community_moderation_actions where content_id=${review.id}`
          )[0].count,
        ).toBe(1);
      } finally {
        await f.admin.unroute(`**${hidePath}`);
      }
      await expect(
        f.admin.getByText(t.decisionSuccess, { exact: true }),
      ).toBeVisible();
      expect((await publicReviews()).statistics).toEqual({
        reviewCount: 0,
        ratedReviewCount: 0,
        meanRating: null,
      });
      expect((await ownStatus(review, "UPHELD")).revision).toBe(2);
      panel = await selectReport(thread, "OPEN");
      const dismissed = await uiDecision(
        panel,
        thread,
        "DISMISS",
        "Manual synthetic dismissal without hiding content",
      );
      expect(dismissed.report).toMatchObject({
        state: "DISMISSED",
        revision: 2,
      });
      const visibleThread = await f.anonymous.request.get(
        `${threadRoot}/${thread.id}`,
        { timeout: 30_000 },
      );
      expect(visibleThread.status()).toBe(200);
      expect(
        discussionPublicSchema.parse(await visibleThread.json()),
      ).toMatchObject({
        state: "ACTIVE",
        body: { state: "MASKED", text: null },
      });
      panel = await selectReport(reply, "OPEN");
      const hiddenReply = await uiDecision(
        panel,
        reply,
        "HIDE",
        "Manual synthetic branch hide",
      );
      expect(hiddenReply.report).toMatchObject({
        state: "UPHELD",
        revision: 2,
      });
      const branch = await f.anonymous.request.get(
        `${threadRoot}/${thread.id}/replies?locale=${locale}`,
        { timeout: 30_000 },
      );
      expect(branch.status()).toBe(200);
      const branchData = discussionListResponseSchema.parse(
        await branch.json(),
      );
      expect(
        branchData.items.find((item) => item.id === reply.id),
      ).toMatchObject({
        state: "HIDDEN",
        body: { state: "UNAVAILABLE", text: null },
      });
      expect(branchData.items.some((item) => item.id === childContent.id)).toBe(
        false,
      );
      await directDecision(thread, "HIDE");
      await directDecision(reply, "RESTORE");
      expect(
        (
          await f.anonymous.request.get(
            `${threadRoot}/${thread.id}/replies?locale=${locale}`,
            { timeout: 30_000 },
          )
        ).status(),
      ).toBe(404);
      expect(await targetMetadata(thread)).toMatchObject({
        moderationState: "HIDDEN",
      });
      await directDecision(thread, "RESTORE");
      const restoredBranch = await f.anonymous.request.get(
        `${threadRoot}/${thread.id}/replies?locale=${locale}`,
        { timeout: 30_000 },
      );
      expect(restoredBranch.status()).toBe(200);
      const restoredReplies = discussionListResponseSchema.parse(
        await restoredBranch.json(),
      );
      for (const id of [reply.id, childContent.id])
        expect(
          restoredReplies.items.find((item) => item.id === id),
        ).toMatchObject({
          state: "ACTIVE",
          body: { state: "MASKED", text: null },
        });
      panel = await selectReport(thread, "DISMISSED");
      await expect(
        panel
          .getByRole("combobox", { name: t.action, exact: true })
          .locator('option[value="DISMISS"]'),
      ).toHaveCount(0);

      const hideWork = await f.admin.request.post(
        `/api/admin/catalog/works/${f.work.id}/visibility`,
        {
          timeout: 45_000,
          headers: { Origin: baseURL! },
          data: { revision: f.work.revision, visibility: "HIDDEN" },
        },
      );
      expect(hideWork.status()).toBe(200);
      const hiddenWork = (await hideWork.json()) as { revision: number };
      expect(
        (
          await f.anonymous.request.get(`${reviewRoot}?locale=${locale}`, {
            timeout: 30_000,
          })
        ).status(),
      ).toBe(404);
      const unavailableQueue = await queue("UPHELD");
      expect(
        unavailableQueue.items.find((item) => item.target.id === review.id),
      ).toMatchObject({ target: { workAvailable: false, canRestore: false } });
      panel = await selectReport(review, "UPHELD");
      await expect(
        panel.getByText(t.unavailable, { exact: true }),
      ).toBeVisible();
      expect(await f.admin.content()).not.toContain(f.work.slug);
      expect(await f.admin.content()).not.toContain(
        `Synthetic public work ${f.run}`,
      );
      expect(await selectedEvidence(panel, review, "BODY")).toMatchObject({
        state: "AVAILABLE",
        text: reviewBody,
      });
      expect(
        await selectedEvidence(panel, review, "SPOILER_CONTEXT"),
      ).toMatchObject({ state: "AVAILABLE", text: context });
      expect(await selectedEvidence(panel, review, "REPORT")).toMatchObject({
        state: "AVAILABLE",
        reason: "OTHER",
        explanation,
      });
      await directDecision(review, "RESTORE", 404);
      await page.goto(`/${locale}/community/reviews/manage`);
      await expect(
        page.getByRole("heading", { name: r.manage, level: 1, exact: true }),
      ).toBeVisible();
      absent(await page.content());
      await page.getByLabel(r.withdrawAck, { exact: true }).check();
      const withdrawal = await browserResponse(
        page,
        `${reviewRoot}/${review.id}/withdraw`,
        "POST",
        () =>
          page.getByRole("button", { name: r.withdraw, exact: true }).click(),
      );
      expect(
        reviewMutationResponseSchema.parse(await withdrawal.json()).content,
      ).toMatchObject({
        state: "DELETED",
        body: { state: "UNAVAILABLE", text: null },
        ratingHalfStars: null,
      });
      const reserved = await page.request.get(
        `${reviewRoot}/owned?locale=${locale}`,
        { timeout: 30_000 },
      );
      expect(reserved.status()).toBe(200);
      expect(
        reviewSlotResponseSchema.parse(await reserved.json()).item,
      ).toMatchObject({
        id: review.id,
        authorState: "DELETED",
        moderationState: "HIDDEN",
      });
      const publishWork = await f.admin.request.post(
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
      expect(publishWork.status()).toBe(200);
      panel = await selectReport(review, "UPHELD");
      expect(await selectedEvidence(panel, review, "BODY")).toMatchObject({
        state: "UNAVAILABLE",
        text: null,
      });
      const restoredReview = await uiDecision(
        panel,
        review,
        "RESTORE",
        "Clear moderation visibility without recovering withdrawn content",
      );
      expect(restoredReview.report).toBeNull();
      expect(await targetMetadata(review)).toMatchObject({
        authorState: "DELETED",
        moderationState: "VISIBLE",
      });
      expect(
        (
          await f.sql`select body,rating_half_stars,spoiler_context from community_contents where id=${review.id}`
        )[0],
      ).toMatchObject({
        body: "",
        rating_half_stars: null,
        spoiler_context: null,
      });
      const released = await page.request.get(
        `${reviewRoot}/owned?locale=${locale}`,
        { timeout: 30_000 },
      );
      expect(released.status()).toBe(200);
      expect(
        reviewSlotResponseSchema.parse(await released.json()).item,
      ).toBeNull();
      expect((await publicReviews()).statistics).toEqual({
        reviewCount: 0,
        ratedReviewCount: 0,
        meanRating: null,
      });
      panel = await selectReport(review, "UPHELD");
      const actionResponse = await browserResponse(
        f.admin,
        `${contentsRoot}/${review.id}/moderation/history`,
        "GET",
        () =>
          panel.getByRole("button", { name: t.actions, exact: true }).click(),
      );
      absent(await actionResponse.text());
      const history = moderationHistoryResponseSchema.parse(
        await actionResponse.json(),
      );
      expect(history.stream).toBe("ACTIONS");
      if (history.stream !== "ACTIONS")
        throw new Error("Expected selected action metadata stream");
      expect(history.items).toHaveLength(2);
      const hideAction = history.items.find((item) => item.action === "HIDE")!;
      await panel
        .getByRole("article")
        .filter({ has: f.admin.getByText(hideAction.id, { exact: true }) })
        .getByRole("button", { name: t.actionReasonEvidence, exact: true })
        .click();
      expect(
        await selectedEvidence(panel, review, "ACTION_REASON"),
      ).toMatchObject({
        state: "AVAILABLE",
        text: hideReason,
        action: { id: hideAction.id, sequence: hideAction.sequence },
      });
      expect(await privateFingerprint()).toEqual(beforePrivate);
      const stillPrivate = await page.request.get(
        `/api/library/${libraryId}/personal?locale=${locale}`,
        { timeout: 30_000 },
      );
      expect(stillPrivate.status()).toBe(200);
      expect(
        personalHttpDetailsSchema.parse(await stillPrivate.json()),
      ).toMatchObject({ ratingHalfStars: 10, notes: privateNote });
      requireTestDatabase();
      await f.sql`delete from library_entries where id=${libraryId!} and user_id=${f.owner!.id!} and work_id=${f.work.id}`;
      libraryId = undefined;
      await f.sql`delete from users where id=${f.owner!.id!} and email=${f.owner!.email}`;
      const erased = await targetMetadata(review);
      expect(erased).toMatchObject({
        authorState: "ERASED",
        canHide: false,
        canRestore: false,
      });
      const erasedHistoryResponse = await f.admin.request.get(
        `${contentsRoot}/${review.id}/moderation/history?locale=${locale}&kind=REVIEW&expectedRevision=${erased.revision}&stream=ACTIONS`,
        { timeout: 30_000 },
      );
      expect(erasedHistoryResponse.status()).toBe(200);
      absent(await erasedHistoryResponse.text());
      const erasedHistory = moderationHistoryResponseSchema.parse(
        await erasedHistoryResponse.json(),
      );
      expect(erasedHistory.stream).toBe("ACTIONS");
      if (erasedHistory.stream !== "ACTIONS")
        throw new Error("Expected erased target action metadata stream");
      expect(
        erasedHistory.items.every(
          (item) => item.evidenceRedacted && item.reportId === null,
        ),
      ).toBe(true);
      for (const selection of ["BODY", "ACTION_REASON"] as const) {
        const response = await f.admin.request.post(
          `${contentsRoot}/${review.id}/moderation/context`,
          {
            timeout: 45_000,
            headers: { Origin: baseURL! },
            data: moderationEvidenceInputSchema.parse({
              workId: f.work.id,
              targetId: review.id,
              contentKind: "REVIEW",
              expectedRevision: erased.revision,
              selection,
              reportId: null,
              expectedReportRevision: null,
              actionId: selection === "ACTION_REASON" ? hideAction.id : null,
              actionSequence:
                selection === "ACTION_REASON" ? hideAction.sequence : null,
              evidenceSelectionAcknowledged: true,
              spoilerRevealAcknowledged: true,
            }),
          },
        );
        expect(response.status()).toBe(200);
        absent(await response.text());
        expect(
          moderationEvidenceResponseSchema.parse(await response.json()),
        ).toMatchObject({
          state: selection === "BODY" ? "UNAVAILABLE" : "REDACTED",
          text: null,
        });
      }
      await directDecision(review, "RESTORE", 409, "CONTENT_UNAVAILABLE");
      expect(
        (
          await page.request.get(
            `/api/community/reports/owned?locale=${locale}`,
            { timeout: 30_000 },
          )
        ).status(),
      ).toBe(401);
      const sessionResponse = await f.admin.request.get(
        "/api/auth/get-session",
        { timeout: 30_000 },
      );
      expect(sessionResponse.status()).toBe(200);
      const signed = (await sessionResponse.json()) as {
        user: { id: string; email: string };
      };
      requireTestDatabase();
      expect(signed.user.email).toContain(f.run);
      const [administrator] =
        await f.sql`select role,email_verified from users where id=${signed.user.id} and email=${signed.user.email}`;
      expect(administrator).toMatchObject({
        role: "admin",
        email_verified: true,
      });
      const budgetKeys = ["post", "report", "safety", "modread", "ownread"].map(
        (bucket) => `community.${bucket}:${signed.user.id}`,
      );
      budgetKeys.push(`catalog.write:${signed.user.id}`);
      async function authorityBudgets() {
        return (
          await f.sql`select md5(coalesce(string_agg(row_to_json(v)::text,'' order by v.key),'')) as fingerprint from rate_limits v where v.key=any(${budgetKeys}::text[])`
        )[0].fingerprint;
      }
      const beforeDemoted = await authorityBudgets();
      await f.sql`update users set role='user' where id=${signed.user.id} and email=${signed.user.email}`;
      for (const leaf of ["moderation/context", "moderation"]) {
        const response = await f.admin.request.post(
          `${contentsRoot}/${review.id}/${leaf}`,
          {
            timeout: 45_000,
            headers: { Origin: baseURL!, "Content-Type": "application/json" },
            data: "{invalid-json",
          },
        );
        expect(response.status()).toBe(403);
        expect(Object.keys(await response.json())).toEqual(["error"]);
      }
      expect(await authorityBudgets()).toBe(beforeDemoted);
      expect(
        (
          await f.admin.request.get(
            `/api/community/moderation/reports?locale=${locale}`,
            { timeout: 30_000 },
          )
        ).status(),
      ).toBe(403);
      await f.admin.goto(`/${locale}/community/moderation`);
      await expect(
        f.admin.getByText(t.deniedModeration, { exact: true }),
      ).toBeVisible();
      absent(await f.admin.content());
      expect(publicReveals).toBe(0);
      expect(
        moderatorDiagnostics,
        "No moderator runtime or React hydration errors",
      ).toEqual([]);
    } finally {
      requireTestDatabase();
      if (libraryId)
        await f.sql`delete from library_entries where id=${libraryId} and user_id=${f.owner!.id!} and work_id=${f.work.id}`;
      await f.close();
    }
  });
}
