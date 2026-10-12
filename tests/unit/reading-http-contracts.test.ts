import { describe, expect, expectTypeOf, it } from "vitest";
import type { LibraryEntryDetail } from "../../apps/web/src/server/library/service";
import type { LibraryHttpEntryDetail } from "../../apps/web/src/features/library/http-contracts";
import {
  libraryHttpEntry,
  strictLibrarySearchParams,
} from "../../apps/web/src/features/library/http-contracts";
import {
  historyQuerySchema,
  readingProgressSchema,
  readingSessionActionSchema,
} from "../../apps/web/src/features/library/contracts";
import {
  readingHttpEntry,
  readingHttpSession,
  readingHttpProgressEvent,
  readingHttpSessionActionSchema,
  readingMutationResponseSchema,
  readingSessionResponseSchema,
  readingSessionHistoryResponseSchema,
  readingProgressHistoryResponseSchema,
  readingEntryHistoryResponseSchema,
  type ReadingHttpDetails,
} from "../../apps/web/src/features/library/reading-http-contracts";

const id = "d41e3408-ff4f-4f92-a799-5506f1f79bf1";
const key = "d41e3408-ff4f-4f92-a799-5506f1f79bf2";
const at = "2026-01-01T00:00:00.000Z";
const session = {
  id,
  sequence: 1,
  kind: "FIRST_READ" as const,
  state: "ACTIVE" as const,
  revision: 1,
  startedAt: at,
  completedAt: null,
  closedAt: null,
  startedOn: null,
  finishedOn: null,
  notes: "Attempt note",
  chapterNumber: 0,
  chapterLabel: "Prologue",
  volumeNumber: null,
  volumeLabel: null,
  personalChapterTotal: null,
  progressNotes: "Private progress",
  editionId: null,
  lastActivityAt: at,
};
const entry: LibraryEntryDetail = {
  id,
  workId: id,
  status: "READING",
  favorite: false,
  revision: 1,
  archived: false,
  createdAt: at,
  updatedAt: at,
  ratingHalfStars: 8,
  notes: "D ENTRY SECRET",
  work: { available: false, id },
  currentSession: session,
  hasCompletedRead: false,
};

describe("V3C shared HTTP allowlists", () => {
  it("extends the B detail type without changing the minimal currentSession", () => {
    expectTypeOf<ReadingHttpDetails>().toExtend<LibraryHttpEntryDetail>();
    const projected = readingHttpEntry(entry);
    expectTypeOf(projected).toEqualTypeOf<ReadingHttpDetails>();
    expect(projected.currentSession).toEqual(
      libraryHttpEntry(entry).currentSession,
    );
    expect(Object.keys(projected.currentSession!)).toEqual([
      "id",
      "state",
      "kind",
    ]);
    expect(projected.readingSession).toEqual(session);
    expect(projected).not.toHaveProperty("notes");
    expect(projected).not.toHaveProperty("ratingHalfStars");
    expect(readingMutationResponseSchema.parse(projected)).toEqual(projected);
    expect(
      readingHttpEntry({ ...entry, currentSession: null }).readingSession,
    ).toBeNull();
  });

  it("removes future internal identity/hash fields and strips unavailable metadata", () => {
    const rich = {
      ...session,
      userId: "secret",
      mutationKey: key,
      requestHash: "secret",
      editionWorkId: id,
    };
    expect(readingHttpSession(rich)).toEqual(session);
    const hidden = {
      ...entry,
      ownerId: "secret",
      work: { available: false as const, id, primaryTitle: "HIDDEN" },
    };
    expect(readingHttpEntry(hidden).work).toEqual({ available: false, id });
    const event = {
      ...session,
      revision: 2,
      recordedAt: at,
      snapshot: { notes: "SECRET" },
      userId: "secret",
    };
    const projected = readingHttpProgressEvent(event);
    expect(projected).not.toHaveProperty("notes");
    expect(projected).not.toHaveProperty("snapshot");
    expect(projected).not.toHaveProperty("userId");
    expect(
      readingProgressHistoryResponseSchema.safeParse({
        items: [projected],
        nextBeforeRevision: null,
      }).success,
    ).toBe(true);
  });

  it("strictly validates rich sessions and envelopes without rejecting available public Work metadata", () => {
    const projected = readingHttpEntry(entry);
    const available = {
      ...projected,
      work: { available: true, id, displayTitle: "Public", editions: [] },
    };
    expect(readingMutationResponseSchema.parse(available).work).toEqual(
      available.work,
    );
    for (const value of [
      { ...projected, notes: "D" },
      { ...projected, ratingHalfStars: 8 },
      { ...projected, work: { available: false, id, displayTitle: "HIDDEN" } },
      { ...projected, currentSession: session },
    ])
      expect(readingMutationResponseSchema.safeParse(value).success).toBe(
        false,
      );
    for (const value of [
      { ...session, ownerId: id },
      { ...session, chapterNumber: -1 },
      { ...session, personalChapterTotal: 0 },
      { ...session, id: "bad" },
    ])
      expect(readingSessionResponseSchema.safeParse(value).success).toBe(false);
  });

  it("requires explicit HTTP completion while preserving the frozen service contract", () => {
    const complete = {
      revision: 1,
      mutationKey: key,
      action: "COMPLETE",
      sessionId: id,
    };
    expect(readingSessionActionSchema.safeParse(complete).success).toBe(true);
    expect(readingHttpSessionActionSchema.safeParse(complete).success).toBe(
      false,
    );
    expect(
      readingHttpSessionActionSchema.safeParse({
        ...complete,
        confirmCompletion: false,
      }).success,
    ).toBe(false);
    expect(
      readingHttpSessionActionSchema.parse({
        ...complete,
        confirmCompletion: true,
      }),
    ).toEqual(complete);
    expect(
      readingHttpSessionActionSchema.safeParse({
        ...complete,
        confirmCompletion: true,
        startedOn: "2026-02-02",
        finishedOn: "2026-02-01",
      }).success,
    ).toBe(false);
    expect(
      readingHttpSessionActionSchema.safeParse({
        revision: 1,
        mutationKey: key,
        action: "START_REREAD",
        acknowledgeReread: true,
      }).success,
    ).toBe(true);
    expect(
      readingHttpSessionActionSchema.safeParse({
        revision: 1,
        mutationKey: key,
        action: "START_REREAD",
        confirmReread: true,
      }).success,
    ).toBe(false);
    expect(
      readingHttpSessionActionSchema.safeParse({
        revision: 1,
        mutationKey: key,
        action: "START_READ",
        confirmCompletion: true,
      }).success,
    ).toBe(false);
  });

  it("preserves zero, omitted and explicit null progress, rejecting unsupported/private commands", () => {
    const command = { revision: 1, mutationKey: key, sessionId: id };
    expect(
      readingProgressSchema.parse({ ...command, patch: { chapterNumber: 0 } })
        .patch,
    ).toEqual({ chapterNumber: 0 });
    expect(
      readingProgressSchema.parse({
        ...command,
        patch: { chapterNumber: null },
      }).patch,
    ).toEqual({ chapterNumber: null });
    for (const patch of [
      {},
      { chapterNumber: "0" },
      { notes: "D" },
      { ratingHalfStars: 8 },
      { percentage: 10 },
      { duration: 1 },
      { startedOn: "2020-01-01" },
    ])
      expect(
        readingProgressSchema.safeParse({ ...command, patch }).success,
      ).toBe(false);
    for (const field of [
      "ownerId",
      "userId",
      "admin",
      "snapshot",
      "requestHash",
    ])
      expect(
        readingProgressSchema.safeParse({
          ...command,
          [field]: id,
          patch: { chapterNumber: 0 },
        }).success,
      ).toBe(false);
  });

  it("bounds history response pages and rejects snapshots and malformed/duplicate cursors", () => {
    expect(
      readingSessionHistoryResponseSchema.safeParse({
        items: [session],
        nextBeforeSequence: 1001,
      }).success,
    ).toBe(true);
    expect(
      readingSessionHistoryResponseSchema.safeParse({
        items: Array(51).fill(session),
        nextBeforeSequence: null,
      }).success,
    ).toBe(false);
    const summary = { id, revision: 1, kind: "PROGRESS", recordedAt: at };
    expect(
      readingEntryHistoryResponseSchema.safeParse({
        items: [summary],
        nextBeforeRevision: 10001,
      }).success,
    ).toBe(true);
    expect(
      readingEntryHistoryResponseSchema.safeParse({
        items: [{ ...summary, snapshot: {} }],
        nextBeforeRevision: null,
      }).success,
    ).toBe(false);
    for (const query of [
      "beforeRevision=0",
      "beforeRevision=10002",
      "beforeSequence=1002",
      "beforeSequence=01",
      "beforeRevision=1&beforeSequence=1",
      "owner=x",
      "limit=1",
    ])
      expect(
        historyQuerySchema.safeParse(
          strictLibrarySearchParams(`https://example.invalid/?${query}`),
        ).success,
      ).toBe(false);
    expect(() =>
      strictLibrarySearchParams(
        "https://example.invalid/?beforeRevision=1&beforeRevision=2",
      ),
    ).toThrow();
  });
});
