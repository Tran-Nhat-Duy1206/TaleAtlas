import { z } from "zod";
import {
  LIBRARY_STATUSES,
  type LibraryStatus,
  type ReadingSessionState,
} from "@taleatlas/database/library-types";
import type { AggregateWork } from "../catalog/contracts";
import { libraryPatchSchema } from "./contracts";

export type LibraryHttpEntryDetail = {
  id: string;
  workId: string;
  status: LibraryStatus;
  favorite: boolean;
  revision: number;
  archived: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  work:
    | ({ available: true } & AggregateWork)
    | { available: false; id: string };
  hasCompletedRead: boolean;
  currentSession: {
    id: string;
    state: ReadingSessionState;
    kind: "FIRST_READ" | "REREAD";
  } | null;
};

/** V3B intentionally excludes rating/notes and all advanced reading commands. */
export const libraryHttpPatchSchema = libraryPatchSchema.extend({
  patch: z
    .object({
      status: z.enum(LIBRARY_STATUSES).optional(),
      favorite: z.boolean().optional(),
    })
    .strict()
    .refine(
      (value) => Object.values(value).some((field) => field !== undefined),
      "Provide at least one entry change",
    ),
});
export const libraryDetailQuerySchema = z
  .object({ locale: z.enum(["en", "vi"]).default("en") })
  .strict();

/** URLSearchParams otherwise silently loses duplicate keys. */
export function strictLibrarySearchParams(url: string): Record<string, string> {
  const values: Record<string, string> = Object.create(null);
  for (const [key, value] of new URL(url).searchParams) {
    if (Object.hasOwn(values, key)) {
      throw new z.ZodError([
        { code: "custom", path: [key], message: "Duplicate query parameter" },
      ]);
    }
    values[key] = value;
  }
  return values;
}

/** Allowlist the B entry envelope; no history snapshots or C/D fields. */
export function libraryHttpEntry<
  T extends {
    id: string;
    workId: string;
    status: string;
    favorite: boolean;
    revision: number;
    archived: boolean;
    createdAt: string | null;
    updatedAt: string | null;
    work: unknown;
    hasCompletedRead?: boolean;
    currentSession?: {
      id: string;
      state: ReadingSessionState;
      kind: "FIRST_READ" | "REREAD";
    } | null;
  },
>(entry: T) {
  return {
    id: entry.id,
    workId: entry.workId,
    status: entry.status,
    favorite: entry.favorite,
    revision: entry.revision,
    archived: entry.archived,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    work: entry.work,
    ...(entry.currentSession === undefined
      ? {}
      : {
          currentSession: entry.currentSession
            ? {
                id: entry.currentSession.id,
                state: entry.currentSession.state,
                kind: entry.currentSession.kind,
              }
            : null,
        }),
    ...(entry.hasCompletedRead === undefined
      ? {}
      : { hasCompletedRead: entry.hasCompletedRead }),
  };
}
