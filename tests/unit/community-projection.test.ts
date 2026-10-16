import { describe, expect, it } from "vitest";
import {
  projectCommunityContent,
  projectCommunityReveal,
  communityPublicMetadata,
  type CommunityContentRow,
} from "../../apps/web/src/features/community/projection";
const id = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const workId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const row = {
  id,
  workId,
  kind: "THREAD",
  authorId: "NEVER_OWNER",
  authorState: "ACTIVE",
  moderationState: "VISIBLE",
  title: "SPOILER_TITLE",
  body: "SPOILER_BODY",
  titleSpoiler: true,
  bodySpoiler: true,
  spoilerContext: "SPOILER_CONTEXT",
  ratingHalfStars: null,
  threadId: null,
  threadKind: null,
  parentId: null,
  parentKind: null,
  parentDepth: null,
  depth: null,
  revision: 1,
  eventCount: 1,
  reportCount: 1,
  moderationActionCount: 0,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  editedAt: null,
  lastActivityAt: new Date("2026-01-01T00:00:00Z"),
} as CommunityContentRow;
const reveal = {
  workId,
  targetId: id,
  contentKind: "THREAD" as const,
  expectedRevision: 1,
  title: true,
  body: false,
  spoilerRevealAcknowledged: true as const,
};
describe("V4 projection adversarial matrix", () => {
  it.each(
    (["ACTIVE", "DELETED", "ERASED"] as const).flatMap((authorState) =>
      (["VISIBLE", "HIDDEN"] as const).map(
        (moderationState) => [authorState, moderationState] as const,
      ),
    ),
  )(
    "projects exact author/moderation pair %s/%s",
    (authorState, moderationState) => {
      const dto = projectCommunityContent(
        { ...row, authorState, moderationState, ratingHalfStars: 10 },
        "Current",
      );
      const live = authorState === "ACTIVE" && moderationState === "VISIBLE";
      expect(dto.author).toEqual(live ? { displayName: "Current" } : null);
      expect(dto.ratingHalfStars).toBe(live ? 10 : null);
      expect(dto.createdAt).toBe(live ? row.createdAt!.toISOString() : null);
      expect(dto.state).toBe(
        authorState !== "ACTIVE"
          ? authorState
          : moderationState === "HIDDEN"
            ? "HIDDEN"
            : "ACTIVE",
      );
      if (!live)
        expect(JSON.stringify(dto)).not.toMatch(/SPOILER|Current|2026-/);
    },
  );
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    "independently masks title=%s and body=%s",
    (titleSpoiler, bodySpoiler) => {
      const dto = projectCommunityContent(
        { ...row, titleSpoiler, bodySpoiler },
        "Current",
      );
      expect(dto.title).toEqual(
        titleSpoiler
          ? { state: "MASKED", text: null }
          : { state: "VISIBLE", text: row.title },
      );
      expect(dto.body).toEqual(
        bodySpoiler
          ? { state: "MASKED", text: null }
          : { state: "VISIBLE", text: row.body },
      );
      expect(dto.spoilerContext).toBeNull();
    },
  );
  it.each([
    [true, false],
    [false, true],
    [true, true],
  ])("returns only selected title=%s/body=%s", (title, body) => {
    const result = projectCommunityReveal(row, { ...reveal, title, body });
    expect(Object.hasOwn(result, "title")).toBe(title);
    expect(Object.hasOwn(result, "body")).toBe(body);
    expect(Object.hasOwn(result, "spoilerContext")).toBe(title && body);
    expect(result).not.toHaveProperty("author");
    expect(result).not.toHaveProperty("children");
  });
  it.each([
    ["revision", { revision: 2 }],
    ["work", { workId: id }],
    ["target", { id: workId }],
    ["kind", { kind: "REPLY" }],
    ["deleted", { authorState: "DELETED" }],
    ["erased", { authorState: "ERASED" }],
    ["hidden", { moderationState: "HIDDEN" }],
  ] as const)("rejects reveal with changed %s", (_label, patch) => {
    expect(() => projectCommunityReveal({ ...row, ...patch }, reveal)).toThrow(
      "COMMUNITY_REVEAL_CONFLICT",
    );
  });
  it.each(["REPLY", "REVIEW"] as const)(
    "does not expose nonexistent %s title or descendants",
    (kind) => {
      const dto = projectCommunityContent(
        {
          ...row,
          kind,
          title: "",
          titleSpoiler: false,
          bodySpoiler: true,
          threadId: id,
        },
        "Current",
      );
      expect(dto.title).toEqual({ state: "UNAVAILABLE", text: null });
      expect(dto.body).toEqual({ state: "MASKED", text: null });
      expect(dto).not.toHaveProperty("children");
    },
  );
  it.each(["en", "vi"] as const)(
    "returns fixed generic %s metadata regardless of authored text",
    (locale) => {
      const expected =
        locale === "en"
          ? {
              title: "Work community",
              description: "Public discussion of works.",
            }
          : {
              title: "Cộng đồng tác phẩm",
              description: "Thảo luận công khai về tác phẩm.",
            };
      expect(communityPublicMetadata(locale)).toEqual(expected);
      expect(JSON.stringify(communityPublicMetadata(locale))).not.toMatch(
        /SPOILER|NEVER_OWNER|Current/,
      );
    },
  );
  it.each([null, "", "   ", "\u202eUnsafe", "\u0085Unsafe", "a".repeat(161)])(
    "omits unsafe/missing current author display %j",
    (name) => {
      expect(projectCommunityContent(row, name).author).toBeNull();
    },
  );
  it("normalizes only current server author display, never uses cached author facts", () => {
    expect(
      projectCommunityContent(
        { ...row, authorSnapshot: "NEVER_SNAPSHOT" } as CommunityContentRow,
        " e\u0301 ",
      ).author,
    ).toEqual({ displayName: "é" });
  });
});

describe("V4 public allowlist projections", () => {
  it("omits initial spoiler text/context and raw owner/evidence", () => {
    const extra = {
      ...row,
      email: "NEVER_EMAIL",
      reports: [{ explanation: "NEVER_REPORT" }],
      privateNotes: "NEVER_PRIVATE",
      authorSnapshot: "NEVER_SNAPSHOT",
    };
    const dto = projectCommunityContent(extra, "Current name");
    expect(dto.title).toEqual({ state: "MASKED", text: null });
    expect(dto.body).toEqual({ state: "MASKED", text: null });
    expect(dto.author).toEqual({ displayName: "Current name" });
    const serialized = JSON.stringify(dto);
    for (const secret of [
      "SPOILER_TITLE",
      "SPOILER_BODY",
      "SPOILER_CONTEXT",
      "NEVER_OWNER",
      "NEVER_EMAIL",
      "NEVER_REPORT",
      "NEVER_PRIVATE",
      "NEVER_SNAPSHOT",
    ])
      expect(serialized).not.toContain(secret);
  });
  it("masks independent flags and does not hide untagged body with title", () => {
    const dto = projectCommunityContent(
      { ...row, bodySpoiler: false },
      "Current",
    );
    expect(dto.title.state).toBe("MASKED");
    expect(dto.body).toEqual({ state: "VISIBLE", text: row.body });
    expect(dto.spoilerContext).toBeNull();
    const inverse = projectCommunityContent(
      { ...row, titleSpoiler: false },
      "Current",
    );
    expect(inverse.title).toEqual({ state: "VISIBLE", text: row.title });
    expect(inverse.body.state).toBe("MASKED");
  });
  it("strips text/rating/author/timestamps in all non-live states even for inconsistent source rows", () => {
    for (const patch of [
      { authorState: "DELETED" as const },
      { authorState: "ERASED" as const },
      { moderationState: "HIDDEN" as const },
    ]) {
      const dto = projectCommunityContent(
        { ...row, ...patch, ratingHalfStars: 10 },
        "NEVER_NAME",
      );
      expect(dto).toMatchObject({
        title: { text: null },
        body: { text: null },
        spoilerContext: null,
        ratingHalfStars: null,
        author: null,
        createdAt: null,
        editedAt: null,
        lastActivityAt: null,
      });
      for (const secret of ["SPOILER", "NEVER_NAME", "2026-"])
        expect(JSON.stringify(dto)).not.toContain(secret);
      expect(dto.id).toBe(id);
    }
  });
  it("reveals only explicitly selected revision-bound sections, no parent/child traversal", () => {
    expect(projectCommunityReveal(row, reveal)).toEqual({
      id,
      workId,
      kind: "THREAD",
      revision: 1,
      title: row.title,
    });
    expect(
      projectCommunityReveal(row, { ...reveal, title: false, body: true }),
    ).not.toHaveProperty("title");
    expect(
      projectCommunityReveal(row, { ...reveal, body: true }),
    ).toMatchObject({
      title: row.title,
      body: row.body,
      spoilerContext: row.spoilerContext,
    });
    for (const patch of [
      { revision: 2 },
      { moderationState: "HIDDEN" as const },
      { authorState: "ERASED" as const },
      { workId: id },
    ])
      expect(() =>
        projectCommunityReveal({ ...row, ...patch }, reveal),
      ).toThrow("COMMUNITY_REVEAL_CONFLICT");
    expect(() =>
      projectCommunityReveal(row, {
        ...reveal,
        spoilerRevealAcknowledged: false,
      } as never),
    ).toThrow();
  });
  it("uses only current safe author display and fixed generic metadata", () => {
    expect(projectCommunityContent(row, "\u202eUnsafe").author).toBeNull();
    expect(projectCommunityContent(row, null).author).toBeNull();
    for (const locale of ["en", "vi"] as const)
      expect(JSON.stringify(communityPublicMetadata(locale))).not.toContain(
        "SPOILER",
      );
  });
});
