import { describe, expect, it } from "vitest";
import {
  communityUuidSchema,
  communityCommandSchema,
  communityDeleteSchema,
  communityThreadCreateSchema as thread,
  communityReplyCreateSchema as reply,
  communityReviewCreateSchema as review,
  communityEditSchema,
  communityReportSchema,
  communityModerationSchema,
  communityRevealSchema,
  communityQuerySchema,
  canonicalCommunityCommand,
} from "../../apps/web/src/features/community/contracts";
const id = "AAAAAAAA-AAAA-4AAA-AAAA-AAAAAAAAAAAA";
const base = {
  mutationKey: id,
  title: " Title ",
  body: " Body ",
  titleSpoiler: false,
  bodySpoiler: false,
  spoilerContext: null,
  publicSubmissionAcknowledged: true,
};
const replyInput = {
  mutationKey: id,
  body: "reply",
  bodySpoiler: false,
  spoilerContext: null,
  publicSubmissionAcknowledged: true,
  threadId: id,
  parentId: null,
  depth: 0,
};
const reviewInput = {
  mutationKey: id,
  body: "a".repeat(20),
  bodySpoiler: false,
  spoilerContext: null,
  publicSubmissionAcknowledged: true,
  rating: null,
};
const reportInput = {
  mutationKey: id,
  contentKind: "THREAD",
  expectedRevision: 1,
  reason: "SPAM",
  explanation: "",
};
const moderationInput = {
  mutationKey: id,
  contentKind: "THREAD",
  expectedRevision: 1,
  reportId: id,
  expectedReportRevision: 1,
  reason: "Reviewed",
};
const commands = [
  { kind: "CREATE_THREAD", input: base },
  { kind: "CREATE_REPLY", input: replyInput },
  { kind: "CREATE_REVIEW", input: reviewInput },
  {
    kind: "EDIT",
    input: { ...base, contentKind: "THREAD", expectedRevision: 1 },
  },
  {
    kind: "WITHDRAW",
    input: { mutationKey: id, contentKind: "THREAD", expectedRevision: 1 },
  },
  { kind: "REPORT", input: reportInput },
  ...["DISMISS", "HIDE", "RESTORE"].map((kind) => ({
    kind,
    input: { ...moderationInput, action: kind },
  })),
];

describe("V4 stable non-identifying keyset cursors", () => {
  it.each([null, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00+07:00"])(
    "accepts timestamp anchor %j including erased null tail",
    (timestamp) => {
      expect(
        communityQuerySchema.parse({ locale: "en", cursor: { timestamp, id } }),
      ).toEqual({ locale: "en", cursor: { timestamp, id: id.toLowerCase() } });
    },
  );
  it.each([
    undefined,
    "",
    "not-a-date",
    "2026-02-30T00:00:00Z",
    "2026-01-01",
    "2026-01-01T00:00:00",
    0,
    false,
  ])("rejects invalid keyset timestamp %j", (timestamp) => {
    expect(
      communityQuerySchema.safeParse({
        locale: "vi",
        cursor: { timestamp, id },
      }).success,
    ).toBe(false);
  });
  it("rejects mixed page and null keyset anchor", () => {
    expect(
      communityQuerySchema.safeParse({
        locale: "en",
        page: 1,
        cursor: { timestamp: null, id },
      }).success,
    ).toBe(false);
  });
});

describe("V4 command adversarial matrix", () => {
  it.each(commands.map((command) => [command.kind, command] as const))(
    "accepts strict %s command",
    (_kind, command) => {
      expect(communityCommandSchema.safeParse(command).success).toBe(true);
    },
  );
  it.each(
    commands.flatMap((command) =>
      [
        "ownerId",
        "actorId",
        "role",
        "privateRating",
        "privateNotes",
        "chapterHistory",
      ].map((field) => [command.kind, field, command] as const),
    ),
  )("rejects %s injected %s", (_kind, field, command) => {
    expect(
      communityCommandSchema.safeParse({
        ...command,
        input: { ...command.input, [field]: "private" },
      }).success,
    ).toBe(false);
  });
  it.each(commands.map((command) => [command.kind, command] as const))(
    "rejects %s unknown envelope fields",
    (_kind, command) => {
      expect(
        communityCommandSchema.safeParse({ ...command, ownerId: "private" })
          .success,
      ).toBe(false);
    },
  );
  it.each([null, 2, 3, 4, 5, 6, 7, 8, 9, 10])(
    "accepts deliberate public rating %s",
    (rating) => {
      expect(review.safeParse({ ...reviewInput, rating }).success).toBe(true);
    },
  );
  it.each([0, 1, 11, -1, 2.5, NaN, Infinity, "2", undefined, false])(
    "rejects invalid public rating %s",
    (rating) => {
      expect(review.safeParse({ ...reviewInput, rating }).success).toBe(false);
    },
  );
  it.each([0, -1, 1.5, 2_147_483_648, "1", undefined, null])(
    "rejects invalid fenced revision %s",
    (expectedRevision) => {
      expect(
        communityDeleteSchema.safeParse({
          mutationKey: id,
          contentKind: "THREAD",
          expectedRevision,
        }).success,
      ).toBe(false);
    },
  );
  it.each([
    "SPAM",
    "HARASSMENT",
    "HATE",
    "SEXUAL_CONTENT",
    "ILLEGAL_CONTENT",
    "COPYRIGHT",
    "OTHER",
  ])("accepts typed report reason %s", (reason) => {
    expect(
      communityReportSchema.safeParse({
        ...reportInput,
        reason,
        explanation: "Meaningful detail",
      }).success,
    ).toBe(true);
  });
  it.each(["spam", "ABUSE", "", null])(
    "rejects unknown report reason %s",
    (reason) => {
      expect(
        communityReportSchema.safeParse({ ...reportInput, reason }).success,
      ).toBe(false);
    },
  );
  it.each(["DISMISS", "HIDE", "RESTORE"])(
    "rejects %s mismatched moderation action",
    (kind) => {
      expect(
        communityCommandSchema.safeParse({
          kind,
          input: {
            ...moderationInput,
            action: kind === "HIDE" ? "RESTORE" : "HIDE",
          },
        }).success,
      ).toBe(false);
    },
  );
  it.each([
    "not-a-uuid",
    "aaaaaaaa-aaaa-zaaa-aaaa-aaaaaaaaaaaa",
    "aaaaaaaa-aaaa-4aaa-0aaa-aaaaaaaaaaaa",
    ` ${id}`,
    `${id} `,
  ])("rejects malformed/noncanonical UUID input %s", (value) => {
    expect(communityUuidSchema.safeParse(value).success).toBe(false);
  });
  it.each([
    "\u0000",
    "\u000b",
    "\u000c",
    "\u001f",
    "\u007f",
    "\u0085",
    "\u009f",
    "\u061c",
    "\u200e",
    "\u200f",
    "\u202a",
    "\u202e",
    "\u2066",
    "\u2069",
  ])("rejects unsafe control before trimming %j", (control) => {
    expect(
      thread.safeParse({ ...base, title: `${control}Title${control}` }).success,
    ).toBe(false);
    expect(
      communityReportSchema.safeParse({
        ...reportInput,
        explanation: `${control}detail`,
      }).success,
    ).toBe(false);
  });
  it.each([
    ["title", 160, thread, base],
    ["thread body", 8000, thread, base],
    ["reply body", 4000, reply, replyInput],
    ["review body", 8000, review, reviewInput],
    ["context", 80, thread, { ...base, titleSpoiler: true }],
    ["explanation", 1000, communityReportSchema, reportInput],
    [
      "reason",
      1000,
      communityModerationSchema,
      { ...moderationInput, action: "HIDE" },
    ],
  ] as const)(
    "enforces exact UTF16 and UTF8 boundary for %s",
    (label, max, schema, input) => {
      const field =
        label === "context"
          ? "spoilerContext"
          : label.includes("body")
            ? "body"
            : label;
      expect(
        schema.safeParse({ ...input, [field]: "😀".repeat(max / 2) }).success,
      ).toBe(true);
      expect(
        schema.safeParse({ ...input, [field]: "😀".repeat(max / 2) + "x" })
          .success,
      ).toBe(false);
      expect(
        schema.safeParse({ ...input, [field]: "界".repeat(max) }).success,
      ).toBe(true);
    },
  );
  it.each(["prototype", "getter", "toJSON", "cycle"])(
    "rejects unsafe object %s without executing user hooks",
    (mode) => {
      let calls = 0;
      let value: unknown;
      if (mode === "prototype")
        value = Object.assign(Object.create({ inherited: true }), base);
      else if (mode === "getter")
        value = {
          ...base,
          get body() {
            calls++;
            return "unsafe";
          },
        };
      else if (mode === "toJSON")
        value = {
          ...base,
          toJSON() {
            calls++;
            return base;
          },
        };
      else {
        const cyclic: Record<string, unknown> = { ...base };
        cyclic.extra = cyclic;
        value = cyclic;
      }
      expect(thread.safeParse(value).success).toBe(false);
      expect(calls).toBe(0);
    },
  );
  it.each(["CREATE_THREAD", "CREATE_REPLY", "CREATE_REVIEW", "EDIT"])(
    "requires explicit acknowledgment for %s",
    (kind) => {
      const command = commands.find((command) => command.kind === kind)!;
      expect(
        communityCommandSchema.safeParse({
          ...command,
          input: { ...command.input, publicSubmissionAcknowledged: false },
        }).success,
      ).toBe(false);
    },
  );
});
describe("V4 strict public contracts", () => {
  it("normalizes NFC/canonical UUIDs and requires deliberate public intent", () => {
    expect(thread.parse({ ...base, title: " e\u0301 " })).toMatchObject({
      title: "é",
      body: "Body",
      mutationKey: id.toLowerCase(),
    });
    for (const acknowledgment of [undefined, false, "true", 1, null])
      expect(
        thread.safeParse({
          ...base,
          publicSubmissionAcknowledged: acknowledgment,
        }).success,
      ).toBe(false);
    for (const field of [
      "ownerId",
      "actorId",
      "role",
      "privateRating",
      "privateNotes",
      "unknown",
    ])
      expect(thread.safeParse({ ...base, [field]: "secret" }).success).toBe(
        false,
      );
  });
  it("rejects unsafe controls before trim, malformed Unicode, and text overflow", () => {
    for (const control of [
      "\u0000",
      "\u000b",
      "\u0085",
      "\u202e",
      "\u2066",
      "\u061c",
    ])
      expect(
        thread.safeParse({ ...base, title: `${control}Title` }).success,
      ).toBe(false);
    expect(thread.safeParse({ ...base, body: "a\nb\tc" }).success).toBe(true);
    expect(thread.safeParse({ ...base, body: "a\r\nb" }).success).toBe(true);
    expect(
      thread.safeParse({ ...base, mutationKey: "not-a-uuid" }).success,
    ).toBe(false);
    expect(thread.safeParse({ ...base, title: "\ud800" }).success).toBe(false);
    expect(thread.safeParse({ ...base, title: "a".repeat(161) }).success).toBe(
      false,
    );
    expect(thread.safeParse({ ...base, title: "😀".repeat(80) }).success).toBe(
      true,
    );
    expect(thread.safeParse({ ...base, title: "😀".repeat(81) }).success).toBe(
      false,
    );
    expect(thread.safeParse({ ...base, body: "界".repeat(8000) }).success).toBe(
      true,
    );
    expect(thread.safeParse({ ...base, body: "a".repeat(8001) }).success).toBe(
      false,
    );
    expect(
      thread.safeParse({ ...base, spoilerContext: "context" }).success,
    ).toBe(false);
    expect(
      thread.safeParse({
        ...base,
        titleSpoiler: true,
        spoilerContext: "context",
      }).success,
    ).toBe(true);
  });
  it("binds immutable reply scope/depth and action-specific edits", () => {
    const input = {
      mutationKey: id,
      threadId: id,
      parentId: null,
      depth: 0,
      body: "Reply",
      bodySpoiler: false,
      spoilerContext: null,
      publicSubmissionAcknowledged: true,
    };
    expect(reply.safeParse(input).success).toBe(true);
    for (const patch of [
      { depth: 1 },
      { parentId: id },
      { depth: 3, parentId: id },
      { title: "not reply" },
      { body: "a".repeat(4001) },
    ])
      expect(reply.safeParse({ ...input, ...patch }).success).toBe(false);
    expect(
      communityEditSchema.safeParse({
        contentKind: "REPLY",
        mutationKey: id,
        expectedRevision: 1,
        body: "edit",
        bodySpoiler: false,
        spoilerContext: null,
        publicSubmissionAcknowledged: true,
        threadId: id,
      }).success,
    ).toBe(false);
  });
  it("separates review body and nullable integer public ratings", () => {
    const input = {
      mutationKey: id,
      body: "a".repeat(20),
      bodySpoiler: false,
      spoilerContext: null,
      rating: null,
      publicSubmissionAcknowledged: true,
    };
    for (const rating of [null, 2, 10])
      expect(review.safeParse({ ...input, rating }).success).toBe(true);
    for (const rating of [0, 1, 11, 2.5, "2", undefined])
      expect(review.safeParse({ ...input, rating }).success).toBe(false);
    expect(review.safeParse({ ...input, body: "a".repeat(19) }).success).toBe(
      false,
    );
  });
  it("fences reports/moderation and bounds locale/page/keysets", () => {
    const input = {
      mutationKey: id,
      contentKind: "THREAD",
      expectedRevision: 1,
      reason: "OTHER",
      explanation: "",
    };
    expect(communityReportSchema.safeParse(input).success).toBe(false);
    expect(
      communityReportSchema.safeParse({ ...input, explanation: "details" })
        .success,
    ).toBe(true);
    const mod = {
      mutationKey: id,
      action: "DISMISS",
      contentKind: "THREAD",
      expectedRevision: 1,
      reportId: id,
      expectedReportRevision: 1,
      reason: "Reviewed",
    };
    expect(communityModerationSchema.safeParse(mod).success).toBe(true);
    for (const patch of [
      { reportId: null },
      { expectedReportRevision: null },
      { reason: "" },
      { action: "BAN" },
    ])
      expect(
        communityModerationSchema.safeParse({ ...mod, ...patch }).success,
      ).toBe(false);
    expect(
      communityQuerySchema.safeParse({ locale: "vi", page: 200 }).success,
    ).toBe(true);
    for (const input of [
      { locale: "fr" },
      { locale: "en", page: 201 },
      {
        locale: "en",
        page: 1,
        cursor: { timestamp: "2026-01-01T00:00:00Z", id },
      },
      { locale: "en", limit: 100 },
    ])
      expect(communityQuerySchema.safeParse(input).success).toBe(false);
  });
  it("requires revision-bound acknowledged selected reveal", () => {
    const input = {
      workId: id,
      targetId: id,
      contentKind: "THREAD",
      expectedRevision: 1,
      title: true,
      body: false,
      spoilerRevealAcknowledged: true,
    };
    expect(communityRevealSchema.safeParse(input).success).toBe(true);
    for (const patch of [
      { spoilerRevealAcknowledged: false },
      { expectedRevision: 0 },
      { expectedRevision: 2_147_483_648 },
      { contentKind: "REPLY" },
      { title: false },
      { childId: id },
    ])
      expect(
        communityRevealSchema.safeParse({ ...input, ...patch }).success,
      ).toBe(false);
  });
  it("canonicalizes only strict parsed data without invoking getter/toJSON", () => {
    const envelope = {
      actorId: "signed-user",
      workId: id,
      targetId: null,
      command: { kind: "CREATE_THREAD", input: base },
    };
    const canonical = canonicalCommunityCommand(envelope);
    expect(canonical).toBe(
      canonicalCommunityCommand({
        ...envelope,
        workId: id.toLowerCase(),
        command: {
          kind: "CREATE_THREAD",
          input: { ...base, title: "Title", body: "Body" },
        },
      }),
    );
    expect(
      canonicalCommunityCommand({
        ...envelope,
        command: {
          kind: "CREATE_THREAD",
          input: { ...base, body: "Different" },
        },
      }),
    ).not.toBe(canonical);
    let calls = 0;
    const getter = {
      ...envelope,
      get toJSON() {
        calls++;
        throw new Error("unsafe");
      },
    };
    expect(() => canonicalCommunityCommand(getter)).toThrow();
    expect(() =>
      canonicalCommunityCommand({
        ...envelope,
        toJSON() {
          calls++;
        },
      }),
    ).toThrow();
    expect(() =>
      thread.parse({
        ...base,
        get body() {
          calls++;
          return "unsafe";
        },
      }),
    ).toThrow();
    expect(calls).toBe(0);
    expect(() =>
      canonicalCommunityCommand({ ...envelope, targetId: id }),
    ).toThrow();
  });
});
