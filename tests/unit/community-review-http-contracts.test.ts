import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { communityReviewCreateSchema } from "../../apps/web/src/features/community/contracts";
import {
  reviewCreateSchema,
  reviewEditSchema,
  reviewWithdrawSchema,
  reviewRevealSchema,
  reviewPublicSchema,
  reviewOwnedSchema,
  reviewStatisticsSchema,
  reviewStatisticsFromAggregate,
  reviewListResponseSchema,
  reviewOwnedListResponseSchema,
  reviewSlotResponseSchema,
  reviewMutationResponseSchema,
  reviewRevealResponseSchema,
  reviewHttpMutation,
  reviewHttpReveal,
  parseReviewQuery,
  parseReviewOwnedQuery,
  parseReviewOwnedContextQuery,
  parseReviewSlotQuery,
  requireReviewScope,
} from "../../apps/web/src/features/community/review-http-contracts";
const id = randomUUID(),
  workId = randomUUID(),
  at = "2026-01-01T00:00:00.000Z";
const input = (patch: Record<string, unknown> = {}) => ({
  mutationKey: randomUUID(),
  body: "Synthetic public review body only.",
  bodySpoiler: false,
  spoilerContext: null,
  publicSubmissionAcknowledged: true,
  rating: null,
  ...patch,
});
const dto = (patch: Record<string, unknown> = {}) => ({
  id,
  workId,
  kind: "REVIEW",
  threadId: null,
  parentId: null,
  depth: null,
  revision: 1,
  state: "ACTIVE",
  title: { state: "UNAVAILABLE", text: null },
  body: { state: "VISIBLE", text: input().body },
  spoilerContext: null,
  ratingHalfStars: null,
  author: { displayName: "Synthetic author" },
  createdAt: at,
  editedAt: null,
  lastActivityAt: at,
  ...patch,
});
const owned = (patch: Record<string, unknown> = {}) => ({
  id,
  workId,
  kind: "REVIEW",
  threadId: null,
  parentId: null,
  depth: null,
  revision: 1,
  authorState: "ACTIVE",
  moderationState: "VISIBLE",
  workAvailable: true,
  canEdit: true,
  canWithdraw: true,
  ...patch,
});
const selection = (patch: Record<string, unknown> = {}) => ({
  workId,
  targetId: id,
  contentKind: "REVIEW",
  expectedRevision: 1,
  title: false,
  body: true,
  spoilerRevealAcknowledged: true,
  ...patch,
});
const url = (query: string) => `http://localhost/api/community${query}`;
describe("V4C UTF-16 review response text bounds", () => {
  const revealed = (body: string, patch: Record<string, unknown> = {}) => ({
    id,
    workId,
    kind: "REVIEW",
    revision: 1,
    body,
    ...patch,
  });
  it.each([
    {
      label: "minimum 20 UTF-16 units / 10 astral characters",
      body: "😀".repeat(10),
      units: 20,
    },
    {
      label: "maximum 8000 UTF-16 units / 4000 astral characters",
      body: "😀".repeat(4000),
      units: 8000,
    },
  ])(
    "accepts $label in foundation create, shared create, public and reveal",
    ({ body, units }) => {
      expect(body.length).toBe(units);
      expect(
        communityReviewCreateSchema.safeParse(input({ body })).success,
      ).toBe(true);
      expect(reviewCreateSchema.safeParse(input({ body })).success).toBe(true);
      expect(
        reviewPublicSchema.safeParse(
          dto({ body: { state: "VISIBLE", text: body } }),
        ).success,
      ).toBe(true);
      expect(reviewRevealResponseSchema.safeParse(revealed(body)).success).toBe(
        true,
      );
    },
  );
  it.each([
    { label: "19 UTF-16 units", body: "😀".repeat(9) + "x", units: 19 },
    {
      label: "8001 UTF-16 units below byte cap",
      body: "😀".repeat(4000) + "x",
      units: 8001,
    },
    {
      label: "16000 UTF-16 units at 32000-byte cap",
      body: "😀".repeat(8000),
      units: 16000,
    },
  ])(
    "rejects $label in foundation create, shared create, public and reveal",
    ({ body, units }) => {
      expect(body.length).toBe(units);
      expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(32000);
      expect(
        communityReviewCreateSchema.safeParse(input({ body })).success,
      ).toBe(false);
      expect(reviewCreateSchema.safeParse(input({ body })).success).toBe(false);
      expect(
        reviewPublicSchema.safeParse(
          dto({ body: { state: "VISIBLE", text: body } }),
        ).success,
      ).toBe(false);
      expect(reviewRevealResponseSchema.safeParse(revealed(body)).success).toBe(
        false,
      );
    },
  );
  it.each([
    { units: 160, count: 80, accepted: true },
    { units: 162, count: 81, accepted: false },
  ])(
    "bounds author at 160 UTF-16 units independently of 640-byte guard ($units)",
    ({ units, count, accepted }) => {
      const displayName = "😀".repeat(count);
      expect(displayName.length).toBe(units);
      expect(new TextEncoder().encode(displayName).length).toBeLessThanOrEqual(
        640,
      );
      expect(
        reviewPublicSchema.safeParse(dto({ author: { displayName } })).success,
      ).toBe(accepted);
    },
  );
  it.each([
    { units: 80, count: 40, accepted: true },
    { units: 82, count: 41, accepted: false },
  ])(
    "bounds revealed context at 80 UTF-16 units independently of 320-byte guard ($units)",
    ({ units, count, accepted }) => {
      const spoilerContext = "😀".repeat(count);
      expect(spoilerContext.length).toBe(units);
      expect(
        new TextEncoder().encode(spoilerContext).length,
      ).toBeLessThanOrEqual(320);
      expect(
        reviewRevealResponseSchema.safeParse(
          revealed(input().body, { spoilerContext }),
        ).success,
      ).toBe(accepted);
    },
  );
});
describe("V4C strict review inputs", () => {
  it("accepts independent nullable and omitted rating, normalizes foundation text", () => {
    const omitted = input();
    delete (omitted as Partial<typeof omitted>).rating;
    expect(reviewCreateSchema.parse(omitted).rating).toBeNull();
    expect(
      reviewCreateSchema.parse(input({ body: `  ${input().body}  ` })).body,
    ).toBe(input().body);
  });
  it.each([2, 3, 4, 5, 6, 7, 8, 9, 10, null])(
    "accepts half-star %s",
    (rating) =>
      expect(reviewCreateSchema.safeParse(input({ rating })).success).toBe(
        true,
      ),
  );
  it.each([1, 11, 2.5, "2", false, NaN, Infinity])(
    "rejects invalid rating %s",
    (rating) =>
      expect(reviewCreateSchema.safeParse(input({ rating })).success).toBe(
        false,
      ),
  );
  it.each([
    { body: "x".repeat(19) },
    { body: "x".repeat(8001) },
    { title: "No title" },
    { publicSubmissionAcknowledged: false },
    { publicSubmissionAcknowledged: undefined },
    { spoilerContext: "Context with no flag" },
    { body: "Synthetic\u0000unsafe body text" },
    { actorId: id },
    { workId },
  ])("rejects invalid/authority create %j", (patch) =>
    expect(reviewCreateSchema.safeParse(input(patch)).success).toBe(false),
  );
  it("requires full REVIEW edit and body-only acknowledged reveal", () => {
    expect(
      reviewEditSchema.safeParse(
        input({ contentKind: "REVIEW", expectedRevision: 1 }),
      ).success,
    ).toBe(true);
    for (const kind of ["THREAD", "REPLY"]) {
      expect(
        reviewEditSchema.safeParse(
          input({ contentKind: kind, expectedRevision: 1 }),
        ).success,
      ).toBe(false);
      expect(
        reviewWithdrawSchema.safeParse({
          mutationKey: id,
          contentKind: kind,
          expectedRevision: 1,
        }).success,
      ).toBe(false);
      expect(
        reviewRevealSchema.safeParse(selection({ contentKind: kind })).success,
      ).toBe(false);
    }
    for (const patch of [
      { title: true },
      { body: false },
      { spoilerRevealAcknowledged: false },
      { rating: 2 },
    ])
      expect(reviewRevealSchema.safeParse(selection(patch)).success).toBe(
        false,
      );
  });
  it("never invokes getters on requests/responses", () => {
    let calls = 0;
    for (const schema of [
      reviewCreateSchema,
      reviewPublicSchema,
      reviewOwnedSchema,
      reviewStatisticsSchema,
    ]) {
      const getter = Object.defineProperty({}, "rating", {
        get() {
          calls++;
          return 2;
        },
      });
      expect(schema.safeParse(getter).success).toBe(false);
    }
    expect(calls).toBe(0);
  });
});
describe("V4C guarded minimal responses", () => {
  it("allows visible/masked active body, optional no author, but no implicit context", () => {
    expect(reviewPublicSchema.safeParse(dto()).success).toBe(true);
    expect(
      reviewPublicSchema.safeParse(
        dto({
          body: { state: "MASKED", text: null },
          author: null,
          ratingHalfStars: 10,
        }),
      ).success,
    ).toBe(true);
    for (const patch of [
      { kind: "THREAD" },
      { threadId: id },
      { parentId: id },
      { depth: 0 },
      { title: { state: "VISIBLE", text: "Secret" } },
      { spoilerContext: "Secret" },
      { ratingHalfStars: 1 },
      { body: { state: "UNAVAILABLE", text: null } },
      { createdAt: null },
      { authorId: id },
    ])
      expect(reviewPublicSchema.safeParse(dto(patch)).success).toBe(false);
  });
  it.each(["DELETED", "ERASED", "HIDDEN"])(
    "requires %s tombstones to contain no authored data",
    (state) => {
      const blank = dto({
        state,
        body: { state: "UNAVAILABLE", text: null },
        ratingHalfStars: null,
        author: null,
        createdAt: null,
        editedAt: null,
        lastActivityAt: null,
      });
      expect(reviewPublicSchema.safeParse(blank).success).toBe(true);
      for (const patch of [
        { ratingHalfStars: 2 },
        { author: { displayName: "Secret" } },
        { createdAt: at },
        { body: { state: "VISIBLE", text: input().body } },
      ])
        expect(
          reviewPublicSchema.safeParse({ ...blank, ...patch }).success,
        ).toBe(false);
    },
  );
  it("owner allowlist rejects every authored/private field and impossible capability", () => {
    expect(reviewOwnedSchema.safeParse(owned()).success).toBe(true);
    for (const key of [
      "title",
      "body",
      "rating",
      "ratingHalfStars",
      "actorId",
      "authorId",
      "author",
      "displayName",
      "createdAt",
      "editedAt",
      "lastActivityAt",
      "reason",
      "history",
      "metadata",
      "catalogTitle",
    ])
      expect(reviewOwnedSchema.safeParse(owned({ [key]: null })).success).toBe(
        false,
      );
    for (const patch of [
      { kind: "REPLY" },
      { workAvailable: false },
      { authorState: "DELETED" },
      { moderationState: "HIDDEN" },
      { revision: 2147483647 },
    ])
      expect(reviewOwnedSchema.safeParse(owned(patch)).success).toBe(false);
    expect(
      reviewOwnedSchema.safeParse(
        owned({ workAvailable: false, canEdit: false }),
      ).success,
    ).toBe(true);
    expect(reviewSlotResponseSchema.safeParse({ item: null }).success).toBe(
      true,
    );
  });
  it("validates mutation/reveal exact scope and strips only foundation report:null", () => {
    expect(
      reviewHttpMutation(
        { content: dto(), replayed: true, report: null },
        workId,
        id,
      ),
    ).toEqual({ content: dto(), replayed: true });
    expect(() =>
      reviewHttpMutation(
        { content: dto(), replayed: true, report: null, extra: true },
        workId,
      ),
    ).toThrow();
    expect(() =>
      reviewHttpMutation(
        { content: dto(), replayed: true, report: null },
        randomUUID(),
      ),
    ).toThrow();
    const revealed = {
      id,
      workId,
      kind: "REVIEW",
      revision: 1,
      body: input().body,
      spoilerContext: "Selected context",
    };
    expect(
      reviewHttpReveal(revealed, reviewRevealSchema.parse(selection())),
    ).toEqual(revealed);
    expect(() =>
      reviewHttpReveal(
        { ...revealed, revision: 2 },
        reviewRevealSchema.parse(selection()),
      ),
    ).toThrow();
    expect(
      reviewRevealResponseSchema.safeParse({ ...revealed, title: "Forbidden" })
        .success,
    ).toBe(false);
    expect(
      reviewMutationResponseSchema.safeParse({
        content: dto(),
        replayed: false,
        report: null,
      }).success,
    ).toBe(false);
    expect(() => requireReviewScope(dto(), workId, randomUUID())).toThrow();
  });
  it("rejects list tombstones and page counts incoherent with snapshot statistics", () => {
    expect(
      reviewListResponseSchema.safeParse({
        items: [dto()],
        pageSize: 25,
        statistics: { reviewCount: 0, ratedReviewCount: 0, meanRating: null },
      }).success,
    ).toBe(false);
    expect(
      reviewListResponseSchema.safeParse({
        items: [dto({ ratingHalfStars: 2 })],
        pageSize: 25,
        statistics: { reviewCount: 1, ratedReviewCount: 0, meanRating: null },
      }).success,
    ).toBe(false);
    const blank = dto({
      state: "DELETED",
      body: { state: "UNAVAILABLE", text: null },
      author: null,
      createdAt: null,
      lastActivityAt: null,
    });
    expect(
      reviewListResponseSchema.safeParse({
        items: [blank],
        pageSize: 25,
        statistics: { reviewCount: 1, ratedReviewCount: 0, meanRating: null },
      }).success,
    ).toBe(false);
  });
  it("bounds all list envelopes at 25 and rejects unknown envelope fields", () => {
    const statistics = {
      reviewCount: 1,
      ratedReviewCount: 0,
      meanRating: null,
    };
    expect(
      reviewListResponseSchema.safeParse({
        items: [dto()],
        pageSize: 25,
        statistics,
      }).success,
    ).toBe(true);
    expect(
      reviewListResponseSchema.safeParse({
        items: Array(26).fill(dto()),
        pageSize: 25,
        statistics,
      }).success,
    ).toBe(false);
    expect(
      reviewOwnedListResponseSchema.safeParse({
        items: Array(26).fill(owned()),
        pageSize: 25,
      }).success,
    ).toBe(false);
  });
});
describe("V4C exact public review statistics", () => {
  it.each([
    [0, 0, 0, null],
    [1, 0, 0, null],
    [3, 3, 20, 10 / 3],
    [2000, 2000, 4000, 1],
    [2000, 2000, 20000, 5],
  ])(
    "derives unrounded bounded mean %j",
    (reviewCount, ratedReviewCount, ratingSum, meanRating) =>
      expect(
        reviewStatisticsFromAggregate({
          reviewCount,
          ratedReviewCount,
          ratingSum,
        }),
      ).toEqual({ reviewCount, ratedReviewCount, meanRating }),
  );
  it.each([
    { reviewCount: 2001, ratedReviewCount: 0, ratingSum: 0 },
    { reviewCount: 0, ratedReviewCount: 1, ratingSum: 2 },
    { reviewCount: 1, ratedReviewCount: 0, ratingSum: 2 },
    { reviewCount: 1, ratedReviewCount: 1, ratingSum: 11 },
    { reviewCount: 1, ratedReviewCount: 1, ratingSum: 1 },
    { reviewCount: 1, ratedReviewCount: 1, ratingSum: 2.5 },
    { reviewCount: "1e0", ratedReviewCount: 1, ratingSum: 2 },
    { reviewCount: null, ratedReviewCount: 0, ratingSum: 0 },
  ])("rejects aggregate %j", (value) =>
    expect(() => reviewStatisticsFromAggregate(value)).toThrow(),
  );
  it.each([
    { reviewCount: 1, ratedReviewCount: 0, meanRating: 1 },
    { reviewCount: 1, ratedReviewCount: 1, meanRating: null },
    { reviewCount: 1, ratedReviewCount: 1, meanRating: Infinity },
    { reviewCount: 1, ratedReviewCount: 1, meanRating: 5, ratingSum: 10 },
  ])("rejects malformed/nonminimal stats %j", (value) =>
    expect(reviewStatisticsSchema.safeParse(value).success).toBe(false),
  );
});
describe("V4C strict bounded queries", () => {
  it("defaults locales, owner UUID null cursor, and explicit owner kind", () => {
    expect(parseReviewQuery(url(""))).toEqual({ locale: "en", page: 1 });
    expect(
      parseReviewOwnedQuery(url(`?cursorId=${id}&cursorTimestamp=null`)),
    ).toEqual({ locale: "en", cursor: { id, timestamp: null } });
    expect(parseReviewOwnedContextQuery(url("?contentKind=REVIEW"))).toEqual({
      locale: "en",
      contentKind: "REVIEW",
    });
    expect(parseReviewSlotQuery(url("?locale=vi"))).toEqual({ locale: "vi" });
  });
  it.each([
    "?contentKind=THREAD",
    "?contentKind=REPLY",
    "?contentKind=REVIEW&locale=fr",
    "?contentKind=REVIEW&locale=en&locale=vi",
    "?contentKind=REVIEW&title=secret",
    "",
  ])("rejects owned query %s", (query) =>
    expect(() => parseReviewOwnedContextQuery(url(query))).toThrow(),
  );
  it.each([
    "?page=201",
    "?page=01",
    "?page=1e2",
    "?locale=en&locale=vi",
    "?privateRating=2",
  ])("rejects list query %s", (query) =>
    expect(() => parseReviewQuery(url(query))).toThrow(),
  );
  it("rejects owner authored timestamps and slot pagination", () => {
    expect(() =>
      parseReviewOwnedQuery(url(`?cursorId=${id}&cursorTimestamp=${at}`)),
    ).toThrow();
    expect(() => parseReviewSlotQuery(url("?page=1"))).toThrow();
  });
});
