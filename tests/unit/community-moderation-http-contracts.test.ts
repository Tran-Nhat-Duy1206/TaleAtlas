import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  communityTargetScopeSchema,
  reportCreateSchema,
  moderationCommandSchema,
  communityCommandResponseSchema,
  moderationTargetSchema,
  ownedReportSchema,
  ownedReportQuerySchema,
  ownedReportListResponseSchema,
  moderationQueueItemSchema,
  moderationQueueResponseSchema,
  moderationEvidenceInputSchema,
  moderationEvidenceResponseSchema,
  moderationEventSchema,
  moderationActionSchema,
  moderationHistoryResponseSchema,
  parseModerationQueueQuery,
  parseOwnedReportQuery,
  parseOwnedReportDetailQuery,
  parseModerationMetadataQuery,
  parseModerationHistoryQuery,
  communityHttpCommand,
  moderationHttpEvidence,
  requireModerationScope,
} from "../../apps/web/src/features/community/moderation-http-contracts";
const id = randomUUID(),
  workId = randomUUID(),
  reportId = randomUUID(),
  actionId = randomUUID(),
  at = "2026-01-01T00:00:00.123456Z";
const target = (patch = {}) => ({
  id,
  workId,
  kind: "THREAD",
  revision: 1,
  authorState: "ACTIVE",
  moderationState: "VISIBLE",
  workAvailable: true,
  canHide: true,
  canRestore: true,
  ...patch,
});
const owned = (patch = {}) => ({
  id: reportId,
  workId,
  contentId: id,
  contentKind: "THREAD",
  state: "OPEN",
  revision: 1,
  targetRevision: 1,
  targetAuthorState: "ACTIVE",
  targetModerationState: "VISIBLE",
  workAvailable: true,
  ...patch,
});
const report = (patch = {}) => ({
  mutationKey: randomUUID(),
  contentKind: "THREAD",
  expectedRevision: 1,
  reason: "SPAM",
  explanation: "",
  ...patch,
});
const command = (patch = {}) => ({
  mutationKey: randomUUID(),
  contentKind: "THREAD",
  expectedRevision: 1,
  action: "HIDE",
  reportId: null,
  expectedReportRevision: null,
  reason: "Synthetic manual decision",
  ...patch,
});
const selection = (patch = {}) => ({
  workId,
  targetId: id,
  contentKind: "THREAD",
  expectedRevision: 1,
  selection: "BODY",
  reportId: null,
  expectedReportRevision: null,
  actionId: null,
  actionSequence: null,
  evidenceSelectionAcknowledged: true,
  spoilerRevealAcknowledged: true,
  ...patch,
});
const field = (patch = {}) => ({
  id,
  workId,
  kind: "THREAD",
  revision: 1,
  selection: "BODY",
  state: "AVAILABLE",
  text: "Synthetic selected plain evidence",
  ...patch,
});
const foundation = (patch = {}) => ({
  content: {
    id,
    workId,
    kind: "THREAD",
    threadId: null,
    parentId: null,
    depth: null,
    revision: 1,
    state: "ACTIVE",
    title: { state: "MASKED", text: null },
    body: { state: "MASKED", text: null },
    spoilerContext: null,
    ratingHalfStars: null,
    author: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    editedAt: null,
    lastActivityAt: "2026-01-01T00:00:00.000Z",
  },
  report: { id: reportId, state: "OPEN", revision: 1 },
  replayed: false,
  ...patch,
});
const event = (patch = {}) => ({
  id: randomUUID(),
  command: "HIDE",
  contentRevision: 2,
  beforeAuthorState: "ACTIVE",
  afterAuthorState: "ACTIVE",
  beforeModerationState: "VISIBLE",
  afterModerationState: "HIDDEN",
  createdAt: at,
  ...patch,
});
const action = (patch = {}) => ({
  id: actionId,
  action: "HIDE",
  sequence: 1,
  contentRevision: 2,
  reportId,
  reportRevision: 2,
  evidenceRedacted: false,
  createdAt: at,
  ...patch,
});
const url = (query: string) => `http://localhost/api/community${query}`;
describe("V4D strict array/object prototypes", () => {
  it("permits ordinary arrays and null-prototype plain records", () => {
    const record = Object.assign(Object.create(null), owned());
    expect(ownedReportSchema.safeParse(record).success).toBe(true);
    expect(
      ownedReportListResponseSchema.safeParse({ items: [record], pageSize: 25 })
        .success,
    ).toBe(true);
    const items = [owned()];
    Object.setPrototypeOf(items, null);
    expect(
      ownedReportListResponseSchema.safeParse({ items, pageSize: 25 }).success,
    ).toBe(true);
  });
  it("rejects custom prototype arrays, Array subclasses and accessor elements without invoking them", () => {
    const custom = [owned()];
    Object.setPrototypeOf(custom, { inherited: true });
    class CustomArray extends Array<ReturnType<typeof owned>> {}
    const subclass = new CustomArray();
    subclass.push(owned());
    let calls = 0;
    const accessor = Object.defineProperty([], "0", {
      enumerable: true,
      get() {
        calls++;
        return owned();
      },
    });
    for (const items of [custom, subclass, accessor])
      expect(
        ownedReportListResponseSchema.safeParse({ items, pageSize: 25 })
          .success,
      ).toBe(false);
    expect(calls).toBe(0);
  });
});
describe("V4D foundation report/moderation input isolation", () => {
  it.each([
    "SPAM",
    "HARASSMENT",
    "HATE",
    "SEXUAL_CONTENT",
    "ILLEGAL_CONTENT",
    "COPYRIGHT",
    "OTHER",
  ])("supports reason %s without invented acknowledgments", (reason) =>
    expect(
      reportCreateSchema.safeParse(
        report({
          reason,
          explanation: reason === "OTHER" ? "Synthetic detail" : "",
        }),
      ).success,
    ).toBe(true),
  );
  it.each(["THREAD", "REPLY", "REVIEW"])(
    "supports exact kind %s",
    (contentKind) =>
      expect(
        reportCreateSchema.safeParse(report({ contentKind })).success,
      ).toBe(true),
  );
  it.each([
    { reason: "OTHER", explanation: "xx" },
    { reason: "UNKNOWN" },
    { explanation: "x".repeat(1001) },
    { actorId: id },
    { publicSubmissionAcknowledged: true },
    { spoilerRevealAcknowledged: true },
    { privateNotes: "Never" },
    { explanation: "unsafe\u0000" },
    { expectedRevision: 0 },
  ])("rejects report patch %j", (patch) =>
    expect(reportCreateSchema.safeParse(report(patch)).success).toBe(false),
  );
  it("new input exports reject custom prototypes and getters without invoking them", () => {
    let calls = 0;
    for (const [schema, value] of [
      [reportCreateSchema, report()],
      [moderationCommandSchema, command()],
      [ownedReportQuerySchema, { locale: "en" }],
    ] as const) {
      expect(
        schema.safeParse(
          Object.assign(Object.create({ inherited: true }), value),
        ).success,
      ).toBe(false);
      const guardedInput = Object.defineProperty({ ...value }, "unknown", {
        get() {
          calls++;
          return "Never";
        },
      });
      expect(schema.safeParse(guardedInput).success).toBe(false);
      expect(schema.safeParse(new Date()).success).toBe(false);
      const cycle: Record<string, unknown> = { ...value };
      cycle.self = cycle;
      expect(schema.safeParse(cycle).success).toBe(false);
    }
    expect(calls).toBe(0);
  });
  it("normalizes foundation explanation NFC and counts UTF16 units", () => {
    expect(
      reportCreateSchema.parse(
        report({ reason: "OTHER", explanation: "e\u0301😀" }),
      ).explanation,
    ).toBe("é😀");
    expect(
      reportCreateSchema.safeParse(report({ explanation: "😀".repeat(500) }))
        .success,
    ).toBe(true);
    expect(
      reportCreateSchema.safeParse(report({ explanation: "😀".repeat(501) }))
        .success,
    ).toBe(false);
  });
  it.each([
    { action: "DISMISS" },
    { reportId, expectedReportRevision: null },
    { reason: "" },
    { action: "AUTO_HIDE" },
    { owner: id },
  ])("rejects moderation patch %j", (patch) =>
    expect(moderationCommandSchema.safeParse(command(patch)).success).toBe(
      false,
    ),
  );
  it("allows paired DISMISS and literal HIDE/RESTORE with mandatory reason", () => {
    expect(
      moderationCommandSchema.safeParse(
        command({ action: "DISMISS", reportId, expectedReportRevision: 1 }),
      ).success,
    ).toBe(true);
    expect(
      moderationCommandSchema.safeParse(command({ action: "RESTORE" })).success,
    ).toBe(true);
  });
});
describe("V4D metadata and sanitized command allowlists", () => {
  it("exports a guarded four-field scope without forged capabilities", () => {
    expect(
      communityTargetScopeSchema.safeParse({
        id,
        workId,
        kind: "REVIEW",
        revision: 1,
      }).success,
    ).toBe(true);
    expect(
      communityTargetScopeSchema.safeParse({
        id,
        workId,
        kind: "REVIEW",
        revision: 1,
        canHide: true,
      }).success,
    ).toBe(false);
  });
  it("minimal command adapter never returns authored fields even masked/live", () => {
    const result = communityHttpCommand(
      foundation(),
      workId,
      id,
      reportCreateSchema.parse(report()),
      "REPORT",
    );
    expect(result).toEqual({
      content: { id, workId, kind: "THREAD", revision: 1 },
      report: { id: reportId, state: "OPEN", revision: 1 },
      replayed: false,
    });
    expect(communityCommandResponseSchema.safeParse(foundation()).success).toBe(
      false,
    );
    expect(() =>
      communityHttpCommand(
        foundation(),
        randomUUID(),
        id,
        reportCreateSchema.parse(report()),
        "REPORT",
      ),
    ).toThrow();
    expect(() =>
      communityHttpCommand(
        foundation(),
        workId,
        randomUUID(),
        reportCreateSchema.parse(report()),
        "REPORT",
      ),
    ).toThrow();
  });
  it("fences report/decision content and pairedreport revisions without forbidding current replay", () => {
    const original = foundation();
    expect(() =>
      communityHttpCommand(
        { ...original, content: { ...original.content, revision: 2 } },
        workId,
        id,
        reportCreateSchema.parse(report()),
        "REPORT",
      ),
    ).toThrow();
    expect(
      communityHttpCommand(
        {
          ...original,
          content: { ...original.content, revision: 3 },
          report: { id: reportId, state: "UPHELD", revision: 2 },
          replayed: true,
        },
        workId,
        id,
        reportCreateSchema.parse(report()),
        "REPORT",
      ).content.revision,
    ).toBe(3);
    const decision = moderationCommandSchema.parse(
      command({ reportId, expectedReportRevision: 1 }),
    );
    expect(
      communityHttpCommand(
        {
          ...original,
          content: { ...original.content, revision: 2 },
          report: { id: reportId, state: "UPHELD", revision: 2 },
        },
        workId,
        id,
        decision,
        "MODERATION",
      ).report?.revision,
    ).toBe(2);
    expect(() =>
      communityHttpCommand(original, workId, id, decision, "MODERATION"),
    ).toThrow();
    expect(
      communityHttpCommand(
        { ...original, report: null, replayed: true },
        workId,
        id,
        decision,
        "MODERATION",
      ).report,
    ).toBeNull();
  });
  it("nonreplayed paired decisions require exact target increment and correct action state, replay stays current", () => {
    const original = foundation(),
      decision = moderationCommandSchema.parse(
        command({ reportId, expectedReportRevision: 1 }),
      );
    const resolved = {
      ...original,
      content: { ...original.content, revision: 2 },
      report: { id: reportId, state: "UPHELD", revision: 2 },
    };
    expect(() =>
      communityHttpCommand(
        { ...resolved, content: { ...original.content, revision: 1 } },
        workId,
        id,
        decision,
        "MODERATION",
      ),
    ).toThrow();
    expect(() =>
      communityHttpCommand(
        { ...resolved, report: { ...resolved.report, state: "DISMISSED" } },
        workId,
        id,
        decision,
        "MODERATION",
      ),
    ).toThrow();
    expect(() =>
      communityHttpCommand(resolved, workId, id, decision, "REPORT"),
    ).toThrow();
    expect(
      communityHttpCommand(
        {
          ...resolved,
          content: { ...original.content, revision: 4 },
          report: { ...resolved.report, state: "DISMISSED", revision: 3 },
          replayed: true,
        },
        workId,
        id,
        decision,
        "MODERATION",
      ).report?.state,
    ).toBe("DISMISSED");
    for (const action of ["DISMISS", "RESTORE"]) {
      const input = moderationCommandSchema.parse(
        command({ action, reportId, expectedReportRevision: 1 }),
      );
      expect(
        communityHttpCommand(
          { ...resolved, report: { ...resolved.report, state: "DISMISSED" } },
          workId,
          id,
          input,
          "MODERATION",
        ).report?.state,
      ).toBe("DISMISSED");
      expect(() =>
        communityHttpCommand(resolved, workId, id, input, "MODERATION"),
      ).toThrow();
    }
  });
  it.each([
    "title",
    "body",
    "reason",
    "explanation",
    "ratingHalfStars",
    "author",
    "actorId",
    "reporterId",
    "createdAt",
    "catalogTitle",
    "slug",
    "history",
    "metadata",
  ])("rejects private extra metadata field %s", (key) => {
    expect(
      moderationTargetSchema.safeParse(target({ [key]: "Never" })).success,
    ).toBe(false);
    expect(ownedReportSchema.safeParse(owned({ [key]: "Never" })).success).toBe(
      false,
    );
  });
  it("preserves unavailable and deleted capabilities without resurrecting erased content", () => {
    expect(
      moderationTargetSchema.safeParse(
        target({ workAvailable: false, canRestore: false }),
      ).success,
    ).toBe(true);
    expect(
      moderationTargetSchema.safeParse(target({ authorState: "DELETED" }))
        .success,
    ).toBe(true);
    expect(
      moderationTargetSchema.safeParse(
        target({ authorState: "ERASED", canHide: false, canRestore: false }),
      ).success,
    ).toBe(true);
    expect(
      moderationTargetSchema.safeParse(target({ authorState: "ERASED" }))
        .success,
    ).toBe(false);
    expect(
      moderationQueueItemSchema.safeParse({
        id: reportId,
        state: "OPEN",
        revision: 1,
        evidenceRedacted: true,
        canDismiss: true,
        target: target({
          authorState: "ERASED",
          canHide: false,
          canRestore: false,
        }),
      }).success,
    ).toBe(true);
  });
  it("bounds queue/owner pages, checks dismiss eligibility, and never exposes taxonomy", () => {
    const item = {
      id: reportId,
      state: "OPEN",
      revision: 1,
      evidenceRedacted: false,
      canDismiss: true,
      target: target(),
    };
    expect(
      moderationQueueResponseSchema.safeParse({
        items: [item],
        pageSize: 25,
        nextCursor: { id: reportId, timestamp: at },
      }).success,
    ).toBe(true);
    expect(
      moderationQueueResponseSchema.safeParse({
        items: Array(26).fill(item),
        pageSize: 25,
        nextCursor: null,
      }).success,
    ).toBe(false);
    expect(
      moderationQueueItemSchema.safeParse({ ...item, reason: "SPAM" }).success,
    ).toBe(false);
    expect(
      moderationQueueItemSchema.safeParse({ ...item, state: "UPHELD" }).success,
    ).toBe(false);
    expect(
      ownedReportListResponseSchema.safeParse({
        items: Array(26).fill(owned()),
        pageSize: 25,
      }).success,
    ).toBe(false);
  });
});
describe("V4D explicit evidence selection and response binding", () => {
  it.each([
    { selection: "TITLE", contentKind: "THREAD" },
    { selection: "BODY", contentKind: "THREAD" },
    { selection: "BODY", contentKind: "REPLY" },
    { selection: "BODY", contentKind: "REVIEW" },
    { selection: "SPOILER_CONTEXT", contentKind: "REVIEW" },
    { selection: "REPORT", reportId, expectedReportRevision: 1 },
    { selection: "ACTION_REASON", actionId, actionSequence: 1 },
    { selection: "BODY", reportId, expectedReportRevision: 1 },
  ])("accepts selected scope %j", (patch) =>
    expect(
      moderationEvidenceInputSchema.safeParse(selection(patch)).success,
    ).toBe(true),
  );
  it.each([
    { selection: "TITLE", contentKind: "REPLY" },
    { selection: "TITLE", contentKind: "REVIEW" },
    { selection: "REPORT" },
    { selection: "ACTION_REASON" },
    { actionId, actionSequence: 1 },
    { reportId },
    { expectedReportRevision: 1 },
    { evidenceSelectionAcknowledged: false },
    { spoilerRevealAcknowledged: false },
    { selection: "ALL" },
    { rating: 2 },
    { actorId: id },
  ])("rejects selected scope %j", (patch) =>
    expect(
      moderationEvidenceInputSchema.safeParse(selection(patch)).success,
    ).toBe(false),
  );
  it("requires unavailable/redacted fields to be null, and selected body only", () => {
    expect(moderationEvidenceResponseSchema.safeParse(field()).success).toBe(
      true,
    );
    expect(
      moderationEvidenceResponseSchema.safeParse(
        field({ state: "REDACTED", text: null }),
      ).success,
    ).toBe(true);
    expect(
      moderationEvidenceResponseSchema.safeParse(
        field({ state: "UNAVAILABLE", text: "Secret" }),
      ).success,
    ).toBe(false);
    expect(
      moderationEvidenceResponseSchema.safeParse(field({ title: "Secret" }))
        .success,
    ).toBe(false);
    expect(
      moderationEvidenceResponseSchema.safeParse(
        field({ spoilerContext: "Secret" }),
      ).success,
    ).toBe(false);
    expect(
      moderationEvidenceResponseSchema.safeParse(
        field({ kind: "REVIEW", text: "😀".repeat(10) }),
      ).success,
    ).toBe(true);
    expect(
      moderationEvidenceResponseSchema.safeParse(
        field({ kind: "REPLY", text: "x".repeat(4001) }),
      ).success,
    ).toBe(false);
  });
  it.each(["\u0000", "\u0085", "\u202e", "\ud800", "e\u0301"])(
    "rejects unsafe/nonNFC evidence suffix %j",
    (suffix) =>
      expect(
        moderationEvidenceResponseSchema.safeParse(
          field({ text: `Synthetic ${suffix}` }),
        ).success,
      ).toBe(false),
  );
  it("explicitly selected report has only its own reason/explanation and scope", () => {
    const value = {
      id,
      workId,
      kind: "THREAD",
      revision: 1,
      selection: "REPORT",
      state: "AVAILABLE",
      report: { id: reportId, state: "OPEN", revision: 1 },
      reason: "OTHER",
      explanation: "Synthetic selected report",
    };
    const input = moderationEvidenceInputSchema.parse(
      selection({ selection: "REPORT", reportId, expectedReportRevision: 1 }),
    );
    expect(moderationHttpEvidence(value, input)).toEqual(value);
    expect(() =>
      moderationHttpEvidence(
        { ...value, report: { ...value.report, id: randomUUID() } },
        input,
      ),
    ).toThrow();
    expect(
      moderationEvidenceResponseSchema.safeParse({
        ...value,
        state: "REDACTED",
        reason: null,
        explanation: null,
      }).success,
    ).toBe(true);
    expect(
      moderationEvidenceResponseSchema.safeParse({
        ...value,
        state: "REDACTED",
      }).success,
    ).toBe(false);
  });
  it("ACTION_REASON UUID/sequence/currentcontentrevision and every selected scope are exact", () => {
    const input = moderationEvidenceInputSchema.parse(
      selection({ selection: "ACTION_REASON", actionId, actionSequence: 1 }),
    );
    const value = field({
      selection: "ACTION_REASON",
      action: { id: actionId, sequence: 1 },
    });
    expect(moderationHttpEvidence(value, input)).toEqual(value);
    for (const patch of [
      { revision: 2 },
      { workId: randomUUID() },
      { id: randomUUID() },
      { kind: "REPLY" },
      { selection: "BODY" },
      { action: { id: randomUUID(), sequence: 1 } },
      { action: { id: actionId, sequence: 2 } },
    ])
      expect(() =>
        moderationHttpEvidence({ ...value, ...patch }, input),
      ).toThrow();
    expect(() =>
      requireModerationScope(target(), workId, id, "REVIEW"),
    ).toThrow();
  });
  it("all exported network schemas reject accessors/cycles/prototypes without execution", () => {
    let calls = 0;
    const getter = Object.defineProperty({}, "body", {
      get() {
        calls++;
        return "Secret";
      },
    });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const schema of [
      reportCreateSchema,
      moderationCommandSchema,
      communityTargetScopeSchema,
      communityCommandResponseSchema,
      moderationTargetSchema,
      ownedReportSchema,
      moderationQueueResponseSchema,
      moderationEvidenceInputSchema,
      moderationEvidenceResponseSchema,
      moderationHistoryResponseSchema,
    ]) {
      expect(schema.safeParse(getter).success).toBe(false);
      expect(schema.safeParse(cyclic).success).toBe(false);
      expect(schema.safeParse(new Date()).success).toBe(false);
    }
    expect(calls).toBe(0);
  });
});
describe("V4D bounded private metadata history and query grammar", () => {
  it("history allows metadata only, retains nullable erased-report attachment, and bounds25", () => {
    expect(moderationEventSchema.safeParse(event()).success).toBe(true);
    expect(
      moderationActionSchema.safeParse(
        action({ reportId: null, evidenceRedacted: true }),
      ).success,
    ).toBe(true);
    expect(
      moderationActionSchema.safeParse(action({ reportRevision: null }))
        .success,
    ).toBe(false);
    for (const key of ["reason", "body", "actorId", "reporterId", "snapshot"]) {
      expect(
        moderationEventSchema.safeParse(event({ [key]: "Secret" })).success,
      ).toBe(false);
      expect(
        moderationActionSchema.safeParse(action({ [key]: "Secret" })).success,
      ).toBe(false);
    }
    expect(
      moderationEventSchema.safeParse(event({ command: "REPORT" })).success,
    ).toBe(false);
    expect(
      moderationHistoryResponseSchema.safeParse({
        content: target(),
        stream: "ACTIONS",
        items: Array(26).fill(action()),
        pageSize: 25,
        nextCursor: 1,
      }).success,
    ).toBe(false);
  });
  it("queue cursor preserves microseconds, defaultsOPEN, accepts three closed/openstates", () => {
    expect(parseModerationQueueQuery(url(""))).toEqual({
      locale: "en",
      state: "OPEN",
      page: 1,
    });
    expect(
      parseModerationQueueQuery(
        url(`?cursorId=${reportId}&cursorTimestamp=${at}`),
      ).cursor?.timestamp,
    ).toBe(at);
    for (const state of ["OPEN", "DISMISSED", "UPHELD"])
      expect(
        parseModerationQueueQuery(url(`?state=${state}&page=200`)).state,
      ).toBe(state);
    expect(
      parseOwnedReportQuery(url(`?cursorId=${reportId}&cursorTimestamp=null`))
        .cursor?.timestamp,
    ).toBeNull();
    expect(parseOwnedReportDetailQuery(url(""))).toEqual({ locale: "en" });
    expect(parseModerationMetadataQuery(url("?kind=REVIEW"))).toEqual({
      locale: "en",
      kind: "REVIEW",
    });
    expect(
      parseModerationHistoryQuery(
        url("?kind=REVIEW&expectedRevision=3&stream=ACTIONS&cursor=2"),
      ),
    ).toEqual({
      locale: "en",
      kind: "REVIEW",
      expectedRevision: 3,
      stream: "ACTIONS",
      cursor: 2,
    });
  });
  it.each([
    "?state=ALL",
    "?page=201",
    "?page=01",
    "?state=OPEN&state=UPHELD",
    "?locale=en&locale=vi",
    "?reason=SPAM",
    "?cursorId=bad",
    `?cursorId=${reportId}&cursorTimestamp=null`,
    `?cursorId=${reportId}&cursorTimestamp=${at}&page=1`,
  ])("rejects queue query %s", (query) =>
    expect(() => parseModerationQueueQuery(url(query))).toThrow(),
  );
  it.each([
    "?kind=REVIEW&expectedRevision=3&stream=ACTIONS&page=201",
    "?kind=REVIEW&expectedRevision=3&stream=ACTIONS&page=1&cursor=2",
    "?kind=REVIEW&expectedRevision=3&stream=ALL",
    "?kind=REVIEW&expectedRevision=3e0&stream=EVENTS",
    "?kind=REVIEW&expectedRevision=03&stream=EVENTS",
    "?kind=REVIEW&expectedRevision=3&stream=ACTIONS&actorId=bad",
  ])("rejects history query %s", (query) =>
    expect(() => parseModerationHistoryQuery(url(query))).toThrow(),
  );
});
