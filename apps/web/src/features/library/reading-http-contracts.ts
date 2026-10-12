import { z } from "zod";
import {
  LIBRARY_EVENT_KINDS,
  LIBRARY_STATUSES,
} from "@taleatlas/database/library-types";
import type {
  LibraryEntryDetail,
  ProgressHistoryPage,
  SessionHistoryPage,
} from "../../server/library/service";
import type { LibraryHttpEntryDetail } from "./http-contracts";
import { readingSessionActionSchema } from "./contracts";

/** Completion requires explicit HTTP confirmation; frozen service input stays exact. */
export const readingHttpSessionActionSchema = z
  .discriminatedUnion("action", [
    readingSessionActionSchema.options[0],
    readingSessionActionSchema.options[1],
    readingSessionActionSchema.options[2],
    readingSessionActionSchema.options[3].extend({
      confirmCompletion: z.literal(true),
    }),
  ])
  .transform((command) => {
    if (command.action === "COMPLETE") {
      const { confirmCompletion, ...input } = command;
      void confirmCompletion;
      return input;
    }
    return command;
  })
  .pipe(readingSessionActionSchema);

const uuid = z.uuid();
const timestamp = z.iso.datetime().nullable();
const revision = z.number().int().min(1).max(10000);
const progressFields = {
  chapterNumber: z.number().int().min(0).max(1000000).nullable(),
  chapterLabel: z.string().max(200).nullable(),
  volumeNumber: z.number().int().min(0).max(100000).nullable(),
  volumeLabel: z.string().max(200).nullable(),
  personalChapterTotal: z.number().int().min(1).max(1000000).nullable(),
  progressNotes: z.string().max(2000),
  editionId: uuid.nullable(),
  lastActivityAt: timestamp,
};

/** C session notes belong to the reading attempt, never to the library entry. */
export const readingSessionResponseSchema = z
  .object({
    id: uuid,
    sequence: z.number().int().min(1).max(1000),
    kind: z.enum(["FIRST_READ", "REREAD"]),
    state: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "ABANDONED"]),
    revision,
    startedAt: timestamp,
    completedAt: timestamp,
    closedAt: timestamp,
    startedOn: z.iso.date().nullable(),
    finishedOn: z.iso.date().nullable(),
    notes: z.string().max(2000),
    ...progressFields,
  })
  .strict();
export type ReadingHttpSession = z.infer<typeof readingSessionResponseSchema>;

export const readingSessionHistoryResponseSchema = z
  .object({
    items: readingSessionResponseSchema.array().max(50),
    nextBeforeSequence: z.number().int().min(1).max(1001).nullable(),
  })
  .strict();
export const readingProgressHistoryResponseSchema = z
  .object({
    items: z
      .object({ id: uuid, revision, recordedAt: timestamp, ...progressFields })
      .strict()
      .array()
      .max(50),
    nextBeforeRevision: z.number().int().min(1).max(10001).nullable(),
  })
  .strict();
export const readingEntryHistoryResponseSchema = z
  .object({
    items: z
      .object({
        id: uuid,
        revision,
        kind: z.enum(LIBRARY_EVENT_KINDS),
        recordedAt: timestamp,
      })
      .strict()
      .array()
      .max(50),
    nextBeforeRevision: z.number().int().min(1).max(10001).nullable(),
  })
  .strict();
export type ReadingHttpSessionHistory = z.infer<
  typeof readingSessionHistoryResponseSchema
>;
export type ReadingHttpProgressHistory = z.infer<
  typeof readingProgressHistoryResponseSchema
>;
export type ReadingHttpEntryHistory = z.infer<
  typeof readingEntryHistoryResponseSchema
>;

export interface ReadingHttpDetails extends LibraryHttpEntryDetail {
  readingSession: ReadingHttpSession | null;
}

/** Available public Work metadata is preserved; unavailable Work is id-only. */
export const readingMutationResponseSchema = z
  .object({
    id: uuid,
    workId: uuid,
    status: z.enum(LIBRARY_STATUSES),
    favorite: z.boolean(),
    revision,
    archived: z.boolean(),
    createdAt: timestamp,
    updatedAt: timestamp,
    work: z.discriminatedUnion("available", [
      z.object({ available: z.literal(true), id: uuid }).passthrough(),
      z.object({ available: z.literal(false), id: uuid }).strict(),
    ]),
    hasCompletedRead: z.boolean(),
    currentSession: z
      .object({
        id: uuid,
        state: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "ABANDONED"]),
        kind: z.enum(["FIRST_READ", "REREAD"]),
      })
      .strict()
      .nullable(),
    readingSession: readingSessionResponseSchema.nullable(),
  })
  .strict();

function readingHttpProgress(progress: ProgressHistoryPage["items"][number]) {
  return {
    chapterNumber: progress.chapterNumber,
    chapterLabel: progress.chapterLabel,
    volumeNumber: progress.volumeNumber,
    volumeLabel: progress.volumeLabel,
    personalChapterTotal: progress.personalChapterTotal,
    progressNotes: progress.progressNotes,
    editionId: progress.editionId,
    lastActivityAt: progress.lastActivityAt,
  };
}

/** Explicit allowlists keep identity, keys, hashes and future private fields out. */
export function readingHttpSession(
  session: SessionHistoryPage["items"][number],
): ReadingHttpSession {
  return {
    id: session.id,
    sequence: session.sequence,
    kind: session.kind,
    state: session.state,
    revision: session.revision,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    closedAt: session.closedAt,
    startedOn: session.startedOn,
    finishedOn: session.finishedOn,
    notes: session.notes,
    chapterNumber: session.chapterNumber,
    chapterLabel: session.chapterLabel,
    volumeNumber: session.volumeNumber,
    volumeLabel: session.volumeLabel,
    personalChapterTotal: session.personalChapterTotal,
    progressNotes: session.progressNotes,
    editionId: session.editionId,
    lastActivityAt: session.lastActivityAt,
  };
}
export function readingHttpEntry(
  entry: LibraryEntryDetail,
): ReadingHttpDetails {
  return {
    id: entry.id,
    workId: entry.workId,
    status: entry.status,
    favorite: entry.favorite,
    revision: entry.revision,
    archived: entry.archived,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    work: entry.work.available
      ? entry.work
      : { available: false, id: entry.work.id },
    hasCompletedRead: entry.hasCompletedRead,
    currentSession: entry.currentSession
      ? {
          id: entry.currentSession.id,
          state: entry.currentSession.state,
          kind: entry.currentSession.kind,
        }
      : null,
    readingSession: entry.currentSession
      ? readingHttpSession(entry.currentSession)
      : null,
  };
}
export function readingHttpProgressEvent(
  event: ProgressHistoryPage["items"][number],
) {
  return {
    id: event.id,
    revision: event.revision,
    recordedAt: event.recordedAt,
    ...readingHttpProgress(event),
  };
}
