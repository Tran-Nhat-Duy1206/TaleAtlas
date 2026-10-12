import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  discussionThreadCreateSchema,
  discussionReplyCreateSchema,
  discussionEditSchema,
  discussionWithdrawSchema,
  discussionRevealSchema,
  discussionPublicSchema,
  discussionListResponseSchema,
  discussionMutationResponseSchema,
  discussionRevealResponseSchema,
  communityOwnedSchema,
  communityOwnedListResponseSchema,
  discussionHttpMutation,
  discussionHttpReveal,
  parseDiscussionQuery,
  parseCommunityOwnedQuery,
  parseCommunityOwnedContextQuery,
  strictCommunitySearchParams,
  requireDiscussionScope,
} from "../../apps/web/src/features/community/http-contracts";
const id = randomUUID(),
  workId = randomUUID(),
  threadId = randomUUID();
const at = "2026-01-01T00:00:00.000Z";
const input = () => ({
  mutationKey: randomUUID(),
  title: "Synthetic topic",
  body: "Synthetic text",
  titleSpoiler: false,
  bodySpoiler: false,
  spoilerContext: null,
  publicSubmissionAcknowledged: true,
});
const dto = (overrides: Record<string, unknown> = {}) => ({
  id,
  workId,
  kind: "THREAD",
  threadId: null,
  parentId: null,
  depth: null,
  revision: 1,
  state: "ACTIVE",
  title: { state: "VISIBLE", text: "Synthetic title" },
  body: { state: "VISIBLE", text: "Synthetic text" },
  spoilerContext: null,
  ratingHalfStars: null,
  author: { displayName: "Synthetic author" },
  createdAt: at,
  editedAt: null,
  lastActivityAt: at,
  ...overrides,
});
const owned = (overrides: Record<string, unknown> = {}) => ({
  id,
  workId,
  kind: "THREAD",
  threadId: null,
  parentId: null,
  depth: null,
  revision: 1,
  authorState: "ACTIVE",
  moderationState: "VISIBLE",
  workAvailable: true,
  canEdit: true,
  canWithdraw: true,
  ...overrides,
});
const url = (query: string) => `http://localhost/api/community/owned${query}`;
describe("V4B guarded request contracts", () => {
  it("uses foundation normalization and rejects extra rating/review authority", () => {
    expect(discussionThreadCreateSchema.parse(input()).body).toBe(
      "Synthetic text",
    );
    expect(
      discussionThreadCreateSchema.safeParse({ ...input(), rating: null })
        .success,
    ).toBe(false);
    expect(
      discussionEditSchema.safeParse({
        ...input(),
        contentKind: "THREAD",
        expectedRevision: 1,
      }).success,
    ).toBe(true);
    expect(
      discussionEditSchema.safeParse({
        ...input(),
        contentKind: "REVIEW",
        expectedRevision: 1,
      }).success,
    ).toBe(false);
    expect(
      discussionWithdrawSchema.safeParse({
        mutationKey: randomUUID(),
        contentKind: "REVIEW",
        expectedRevision: 1,
      }).success,
    ).toBe(false);
    expect(
      discussionRevealSchema.safeParse({
        workId,
        targetId: id,
        contentKind: "REVIEW",
        expectedRevision: 1,
        title: false,
        body: true,
        spoilerRevealAcknowledged: true,
      }).success,
    ).toBe(false);
  });
  it("strict reply input binds parent to bounded depth", () => {
    const reply = {
      mutationKey: randomUUID(),
      body: "Synthetic reply",
      bodySpoiler: false,
      spoilerContext: null,
      publicSubmissionAcknowledged: true,
      threadId,
      parentId: null,
      depth: 0,
    };
    expect(discussionReplyCreateSchema.safeParse(reply).success).toBe(true);
    for (const patch of [
      { depth: 3 },
      { depth: 1 },
      { rating: null },
      { title: "Not a reply title" },
      { workId },
    ])
      expect(
        discussionReplyCreateSchema.safeParse({ ...reply, ...patch }).success,
      ).toBe(false);
  });
  it("rejects getters before invoking them", () => {
    let called = false;
    const value = Object.defineProperty(input(), "title", {
      get() {
        called = true;
        return "Leak";
      },
    });
    expect(discussionThreadCreateSchema.safeParse(value).success).toBe(false);
    expect(called).toBe(false);
  });
});
describe("bounded strict query wire grammar", () => {
  it("defaults to en/page1 and accepts page200 and locale vi", () => {
    expect(parseDiscussionQuery(url(""))).toEqual({ locale: "en", page: 1 });
    expect(parseDiscussionQuery(url("?locale=vi&page=200"))).toEqual({
      locale: "vi",
      page: 200,
    });
  });
  it("maps keyset null literally without leaking authored timestamps to owned lists", () => {
    expect(
      parseDiscussionQuery(url(`?cursorId=${id}&cursorTimestamp=null`)),
    ).toEqual({ locale: "en", cursor: { id, timestamp: null } });
    expect(
      parseDiscussionQuery(url(`?cursorId=${id}&cursorTimestamp=${at}`)),
    ).toEqual({ locale: "en", cursor: { id, timestamp: at } });
    expect(() =>
      parseCommunityOwnedQuery(url(`?cursorId=${id}&cursorTimestamp=${at}`)),
    ).toThrow();
    expect(
      parseCommunityOwnedQuery(url(`?cursorId=${id}&cursorTimestamp=null`))
        .cursor?.timestamp,
    ).toBeNull();
  });
  it.each([
    "?locale=en&locale=vi",
    "?page=1&page=1",
    "?locale=fr",
    "?page=0",
    "?page=201",
    "?page=01",
    "?page=1.0",
    "?page=1e2",
    "?page=-1",
    "?page=Infinity",
    "?page=%20",
    "?contentKind=REVIEW",
    "?__proto__=a",
    "?cursorId=bad",
    `?cursorId=${id}`,
    "?cursorTimestamp=null",
    `?cursorId=${id}&cursorTimestamp=undefined`,
    `?cursorId=${id}&cursorTimestamp=null&page=1`,
    "?cursorTimestamp=" + "x".repeat(65),
  ])("rejects invalid wire query %s", (query) => {
    expect(() => parseDiscussionQuery(url(query))).toThrow();
  });
  it("owns only contentKind on context reads; duplicate/unknown keys fail", () => {
    expect(parseCommunityOwnedContextQuery(url("?contentKind=REPLY"))).toEqual({
      contentKind: "REPLY",
    });
    for (const query of [
      "",
      "?contentKind=REVIEW",
      "?contentKind=THREAD&locale=en",
      "?contentKind=THREAD&contentKind=THREAD",
    ])
      expect(() => parseCommunityOwnedContextQuery(url(query))).toThrow();
    expect(() => strictCommunitySearchParams("x".repeat(8193))).toThrow();
  });
});
describe("strict safeParse unknown public and owner response contracts", () => {
  it("accepts current UUIDs, masked fields, and author-less live projections", () => {
    expect(discussionPublicSchema.safeParse(dto()).success).toBe(true);
    expect(
      discussionPublicSchema.safeParse(
        dto({
          title: { state: "MASKED", text: null },
          body: { state: "MASKED", text: null },
          author: null,
        }),
      ).success,
    ).toBe(true);
  });
  it.each([
    { authorId: "private" },
    { owned: true },
    { report: null },
    { ratingHalfStars: 4 },
    { spoilerContext: "leak" },
    { kind: "REVIEW" },
    { revision: 0 },
    { revision: 2147483648 },
    { revision: 1.5 },
    { id: "not-a-uuid" },
    { createdAt: "yesterday" },
    { depth: 0 },
    { title: { state: "MASKED", text: "leak" } },
    { body: { state: "UNAVAILABLE", text: null } },
    { author: { displayName: "Synthetic", id: "private" } },
    { author: { displayName: "unsafe\u202e" } },
    { body: { state: "VISIBLE", text: "x".repeat(8001) } },
  ])("rejects public violation %j", (patch) => {
    expect(discussionPublicSchema.safeParse(dto(patch)).success).toBe(false);
  });
  it.each(["DELETED", "ERASED", "HIDDEN"])(
    "fences all nonlive authored fields for %s",
    (state) => {
      const tombstone = dto({
        state,
        title: { state: "UNAVAILABLE", text: null },
        body: { state: "UNAVAILABLE", text: null },
        author: null,
        createdAt: null,
        editedAt: null,
        lastActivityAt: null,
      });
      expect(discussionPublicSchema.safeParse(tombstone).success).toBe(true);
      for (const patch of [
        { title: dto().title },
        { body: dto().body },
        { author: dto().author },
        { createdAt: at },
        { editedAt: at },
        { lastActivityAt: at },
        { spoilerContext: "leak" },
        { ratingHalfStars: 2 },
      ])
        expect(
          discussionPublicSchema.safeParse({ ...tombstone, ...patch }).success,
        ).toBe(false);
    },
  );
  it("requires reply title UNAVAILABLE and correct bounded topology/text", () => {
    const reply = dto({
      kind: "REPLY",
      threadId,
      depth: 0,
      title: { state: "UNAVAILABLE", text: null },
    });
    expect(discussionPublicSchema.safeParse(reply).success).toBe(true);
    for (const patch of [
      { title: dto().title },
      { depth: 1 },
      { threadId: null },
      { threadId: id },
      { parentId: id, depth: 1 },
      { parentId: threadId, depth: 1 },
      { body: { state: "VISIBLE", text: "x".repeat(4001) } },
    ])
      expect(
        discussionPublicSchema.safeParse({ ...reply, ...patch }).success,
      ).toBe(false);
  });
  it("guards response getters and strict nested extra keys", () => {
    let called = false;
    const value = Object.defineProperty(dto(), "body", {
      get() {
        called = true;
        return {};
      },
    });
    expect(discussionPublicSchema.safeParse(value).success).toBe(false);
    expect(called).toBe(false);
  });
  it("bounds lists and rejects response envelopes/reports", () => {
    expect(
      discussionListResponseSchema.safeParse({ items: [dto()], pageSize: 25 })
        .success,
    ).toBe(true);
    for (const value of [
      { items: Array.from({ length: 26 }, () => dto()), pageSize: 25 },
      { items: [], pageSize: 24 },
      { data: { items: [], pageSize: 25 } },
    ])
      expect(discussionListResponseSchema.safeParse(value).success).toBe(false);
    expect(
      discussionMutationResponseSchema.safeParse({
        content: dto(),
        replayed: false,
        report: null,
      }).success,
    ).toBe(false);
    expect(
      discussionHttpMutation(
        { content: dto(), replayed: false, report: null },
        workId,
        "THREAD",
        id,
      ),
    ).toEqual({ content: dto(), replayed: false });
    expect(() =>
      discussionHttpMutation(
        { content: dto(), replayed: false, report: { id } },
        workId,
        "THREAD",
      ),
    ).toThrow();
    expect(() =>
      discussionHttpMutation(
        { content: dto(), replayed: false, report: null, private: "leak" },
        workId,
        "THREAD",
      ),
    ).toThrow();
    expect(() =>
      requireDiscussionScope(
        dto() as Parameters<typeof requireDiscussionScope>[0],
        randomUUID(),
        "THREAD",
      ),
    ).toThrow();
  });
  it("requires exact selected reveal scope and current revision, not generic unknown casts", () => {
    const selection = discussionRevealSchema.parse({
      workId,
      targetId: id,
      contentKind: "THREAD",
      expectedRevision: 1,
      title: true,
      body: false,
      spoilerRevealAcknowledged: true,
    });
    const reveal = {
      id,
      workId,
      kind: "THREAD",
      revision: 1,
      title: "Selected text",
    };
    expect(discussionHttpReveal(reveal, selection)).toEqual(reveal);
    for (const patch of [
      { id: randomUUID() },
      { workId: randomUUID() },
      { kind: "REPLY" },
      { revision: 2 },
      { body: "Unselected text" },
      { title: undefined },
      { rating: null },
      { authorId: "private" },
    ])
      expect(() =>
        discussionHttpReveal({ ...reveal, ...patch }, selection),
      ).toThrow();
    expect(
      discussionRevealResponseSchema.safeParse({
        id,
        workId,
        kind: "THREAD",
        revision: 1,
        spoilerContext: "alone",
      }).success,
    ).toBe(false);
  });
  it("owns only UUID/state/capability data, never metadata/authored data", () => {
    expect(communityOwnedSchema.safeParse(owned()).success).toBe(true);
    expect(
      communityOwnedSchema.safeParse(
        owned({ workAvailable: false, canEdit: false }),
      ).success,
    ).toBe(true);
    for (const patch of [
      { authorId: "private" },
      { body: "private" },
      { title: "private" },
      { rating: 4 },
      { work: { id: workId } },
      { createdAt: at },
      { kind: "REVIEW" },
      { authorState: "DELETED" },
      { moderationState: "HIDDEN" },
      { workAvailable: false },
    ])
      expect(communityOwnedSchema.safeParse(owned(patch)).success).toBe(false);
    expect(
      communityOwnedListResponseSchema.safeParse({
        items: [owned()],
        pageSize: 25,
      }).success,
    ).toBe(true);
    expect(
      communityOwnedListResponseSchema.safeParse({
        items: Array.from({ length: 26 }, () => owned()),
        pageSize: 25,
      }).success,
    ).toBe(false);
  });
});
