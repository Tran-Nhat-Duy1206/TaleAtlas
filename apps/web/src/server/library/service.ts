import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { user } from "@taleatlas/database/schema";
import { works, editions, workTitles } from "@taleatlas/database/catalog";
import {
  libraryEntries,
  readingSessions,
  libraryEvents,
  readingProgressEvents,
} from "@taleatlas/database/library";
import {
  LIBRARY_MAX_ENTRIES_PER_OWNER,
  LIBRARY_MAX_EVENTS_PER_ENTRY,
  LIBRARY_MAX_SESSIONS_PER_ENTRY,
  type LibraryEventKind,
} from "@taleatlas/database/library-types";
import { getDatabase } from "../database";
import { requireSession } from "../session";
import { HttpError, limitCatalogMutation } from "../http";
import { logServerError } from "../logger";
import { loadWorks } from "../catalog/repository";
import type { AggregateWork } from "../../features/catalog/contracts";
import {
  libraryAddSchema,
  libraryRemoveSchema,
  libraryPatchSchema,
  readingProgressSchema,
  readingSessionActionSchema,
  libraryQuerySchema,
  historyQuerySchema,
  canonicalLibraryCommand,
  type LibraryPatchInput,
} from "../../features/library/contracts";

type Tx = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];
type Entry = typeof libraryEntries.$inferSelect;
type Session = typeof readingSessions.$inferSelect;
type Input = unknown | (() => Promise<unknown>);
const uuid = (value: string) => z.uuid().parse(value).toLowerCase();
const localeValue = (value: string) => z.enum(["en", "vi"]).parse(value);
const iso = (value: Date | null) => value?.toISOString() ?? null;
const scope = (entry: Entry) => ({
  entryId: entry.id,
  userId: entry.userId,
  workId: entry.workId,
});
async function safe<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof HttpError ||
      error instanceof z.ZodError ||
      (error instanceof Error &&
        ["AuthorizationError", "AuthenticationUnavailableError"].includes(
          error.name,
        ))
    )
      throw error;
    const cause =
      (error as { cause?: { code?: string }; code?: string })?.cause ??
      (error as { code?: string });
    if (
      cause?.code === "23505" ||
      cause?.code === "40001" ||
      cause?.code === "40P01"
    )
      throw new HttpError(409, "CONFLICT");
    logServerError("library.service", error);
    throw new HttpError(503, "SERVICE_UNAVAILABLE");
  }
}
async function command<T>(
  headers: Headers,
  schema: z.ZodType<T>,
  input: Input,
) {
  const actor = (await requireSession(headers)).user.id;
  await limitCatalogMutation(actor);
  const value = schema.parse(
    typeof input === "function" ? await input() : input,
  );
  return { actor, value };
}
function hash(actor: string, target: string, kind: string, value: unknown) {
  const canonical = canonicalLibraryCommand({ actor, target, kind, value });
  if (Buffer.byteLength(canonical, "utf8") > 24000)
    throw new HttpError(400, "PAYLOAD_TOO_LARGE");
  return createHash("sha256").update(canonical).digest("hex");
}
async function now(tx: Tx) {
  const rows = await tx.execute(sql`select clock_timestamp()::text as value`);
  const value = rows[0]?.value;
  if (typeof value !== "string")
    throw new HttpError(503, "SERVICE_UNAVAILABLE");
  return new Date(value);
}
async function lockEntry(tx: Tx, owner: string, id: string) {
  const [entry] = await tx
    .select()
    .from(libraryEntries)
    .where(and(eq(libraryEntries.id, id), eq(libraryEntries.userId, owner)))
    .for("update");
  if (!entry) throw new HttpError(404, "ENTRY_NOT_FOUND");
  return entry;
}
async function replay(
  tx: Tx,
  owner: string,
  key: string,
  targetWork: string,
  requestHash: string,
) {
  const [event] = await tx
    .select()
    .from(libraryEvents)
    .where(
      and(eq(libraryEvents.userId, owner), eq(libraryEvents.mutationKey, key)),
    );
  if (!event) return false;
  if (event.workId !== targetWork || event.requestHash !== requestHash)
    throw new HttpError(409, "IDEMPOTENCY_CONFLICT");
  return true;
}
function fence(entry: Entry, revision: number, allowRemoved = false) {
  if (!allowRemoved && entry.removedAt)
    throw new HttpError(404, "ENTRY_NOT_FOUND");
  if (entry.revision !== revision) throw new HttpError(409, "STALE_REVISION");
}
function ensureRoom(entry: Entry) {
  if (entry.eventCount >= LIBRARY_MAX_EVENTS_PER_ENTRY)
    throw new HttpError(409, "HISTORY_LIMIT_REACHED");
}
async function append(
  tx: Tx,
  entry: Entry,
  key: string,
  requestHash: string,
  kind: LibraryEventKind,
  snapshot: Record<string, unknown>,
  at: Date,
) {
  if (Buffer.byteLength(JSON.stringify(snapshot), "utf8") > 24000)
    throw new HttpError(400, "PAYLOAD_TOO_LARGE");
  await tx.insert(libraryEvents).values({
    ...scope(entry),
    entryRevision: entry.revision,
    mutationKey: key,
    requestHash,
    kind,
    snapshot,
    createdAt: at,
  });
}
async function openSession(tx: Tx, entry: Entry) {
  const [row] = await tx
    .select()
    .from(readingSessions)
    .where(
      and(
        eq(readingSessions.entryId, entry.id),
        eq(readingSessions.userId, entry.userId),
        inArray(readingSessions.state, ["ACTIVE", "PAUSED"]),
      ),
    );
  return row;
}
async function completedBefore(tx: Tx, entry: Entry) {
  const [row] = await tx
    .select({ id: readingSessions.id })
    .from(readingSessions)
    .where(
      and(
        eq(readingSessions.entryId, entry.id),
        eq(readingSessions.userId, entry.userId),
        eq(readingSessions.state, "COMPLETED"),
      ),
    )
    .limit(1);
  return Boolean(row);
}
async function createRead(
  tx: Tx,
  entry: Entry,
  at: Date,
  state: "ACTIVE" | "COMPLETED",
  options: {
    startedOn?: string | null;
    notes?: string;
    acknowledgeReread?: boolean;
  } = {},
) {
  ensureRoom(entry);
  if (entry.sessionCount >= LIBRARY_MAX_SESSIONS_PER_ENTRY)
    throw new HttpError(409, "SESSION_LIMIT_REACHED");
  const reread = await completedBefore(tx, entry);
  if (reread && !options.acknowledgeReread)
    throw new HttpError(409, "REREAD_ACKNOWLEDGMENT_REQUIRED");
  const [session] = await tx
    .insert(readingSessions)
    .values({
      ...scope(entry),
      sequence: entry.sessionCount + 1,
      kind: reread ? "REREAD" : "FIRST_READ",
      state,
      startedAt: at,
      lastActivityAt: at,
      completedAt: state === "COMPLETED" ? at : null,
      closedAt: state === "COMPLETED" ? at : null,
      startedOn: options.startedOn ?? null,
      notes: options.notes ?? "",
    })
    .returning();
  await tx
    .update(libraryEntries)
    .set({ sessionCount: entry.sessionCount + 1 })
    .where(eq(libraryEntries.id, entry.id));
  return session;
}
async function changeReadState(
  tx: Tx,
  session: Session,
  state: Session["state"],
  at: Date,
  notes?: string,
) {
  if (!["ACTIVE", "PAUSED"].includes(session.state))
    throw new HttpError(409, "SESSION_CLOSED");
  const terminal = state === "COMPLETED" || state === "ABANDONED";
  const [updated] = await tx
    .update(readingSessions)
    .set({
      state,
      revision: session.revision + 1,
      ...(notes === undefined ? {} : { notes }),
      ...((state === "ACTIVE" && session.state !== "ACTIVE") || terminal
        ? { lastActivityAt: at }
        : {}),
      completedAt: state === "COMPLETED" ? at : null,
      closedAt: terminal ? at : null,
    })
    .where(eq(readingSessions.id, session.id))
    .returning();
  return updated;
}
async function statusSession(
  tx: Tx,
  entry: Entry,
  next: Entry["status"],
  at: Date,
  acknowledgeReread = false,
) {
  const session = await openSession(tx, entry);
  if (next === "READING") {
    if (session?.state === "PAUSED")
      return changeReadState(tx, session, "ACTIVE", at);
    return (
      session ?? createRead(tx, entry, at, "ACTIVE", { acknowledgeReread })
    );
  }
  if (next === "COMPLETED") {
    if (session) return changeReadState(tx, session, "COMPLETED", at);
    if (entry.status === "COMPLETED") return undefined;
    return createRead(tx, entry, at, "COMPLETED", { acknowledgeReread });
  }
  if (session)
    return changeReadState(
      tx,
      session,
      next === "DROPPED" ? "ABANDONED" : "PAUSED",
      at,
    );
}
async function changed(
  tx: Tx,
  entry: Entry,
  at: Date,
  fields: Partial<typeof libraryEntries.$inferInsert> = {},
) {
  ensureRoom(entry);
  const [updated] = await tx
    .update(libraryEntries)
    .set({
      ...fields,
      revision: entry.revision + 1,
      eventCount: entry.eventCount + 1,
      updatedAt: at,
    })
    .where(eq(libraryEntries.id, entry.id))
    .returning();
  return updated;
}
function projectProgress(
  row: Session | typeof readingProgressEvents.$inferSelect,
) {
  return {
    chapterNumber: row.chapterNumber,
    chapterLabel: row.chapterLabel,
    volumeNumber: row.volumeNumber,
    volumeLabel: row.volumeLabel,
    personalChapterTotal: row.personalChapterTotal,
    progressNotes: row.progressNotes,
    editionId: row.editionId,
    lastActivityAt: iso(row.lastActivityAt),
  };
}
function projectSession(row: Session) {
  return {
    id: row.id,
    sequence: row.sequence,
    kind: row.kind,
    state: row.state,
    revision: row.revision,
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    closedAt: iso(row.closedAt),
    startedOn: row.startedOn,
    finishedOn: row.finishedOn,
    notes: row.notes,
    ...projectProgress(row),
  };
}
function projectEntry(row: Entry) {
  return {
    id: row.id,
    workId: row.workId,
    status: row.status,
    favorite: row.favorite,
    ratingHalfStars: row.ratingHalfStars,
    notes: row.notes,
    revision: row.revision,
    archived: Boolean(row.removedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
async function currentWorks(
  tx: Tx,
  rows: Entry[],
  locale: "en" | "vi",
): Promise<Map<string, AggregateWork>> {
  const ids = rows.map((row) => row.workId);
  if (!ids.length) return new Map();
  const published = await tx
    .select({ id: works.id })
    .from(works)
    .where(and(inArray(works.id, ids), eq(works.visibility, "PUBLISHED")));
  const aggregates = await loadWorks(
    tx,
    published.map((row) => row.id),
    locale,
  );
  return new Map(aggregates.map((work) => [work.id, work as AggregateWork]));
}
async function entryDetail(
  owner: string,
  id: string,
  locale: "en" | "vi",
  allowRemoved = false,
) {
  return getDatabase().transaction(
    async (tx) => {
      const [row] = await tx
        .select()
        .from(libraryEntries)
        .where(
          and(
            eq(libraryEntries.id, id),
            eq(libraryEntries.userId, owner),
            allowRemoved ? undefined : isNull(libraryEntries.removedAt),
          ),
        );
      if (!row) throw new HttpError(404, "ENTRY_NOT_FOUND");
      const catalog = await currentWorks(tx, [row], locale);
      const [last] = await tx
        .select()
        .from(readingSessions)
        .where(
          and(
            eq(readingSessions.entryId, row.id),
            eq(readingSessions.userId, owner),
          ),
        )
        .orderBy(desc(readingSessions.sequence))
        .limit(1);
      const work = catalog.get(row.workId);
      return {
        ...projectEntry(row),
        work: work
          ? { available: true as const, ...work }
          : { available: false as const, id: row.workId },
        currentSession: last ? projectSession(last) : null,
        hasCompletedRead: await completedBefore(tx, row),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function getLibraryEntry(
  id: string,
  headers: Headers,
  locale = "en",
) {
  return safe(async () => {
    const owner = (await requireSession(headers)).user.id;
    return entryDetail(owner, uuid(id), localeValue(locale));
  });
}
export async function getOwnWorkLibraryState(workId: string, headers: Headers) {
  return safe(async () => {
    const owner = (await requireSession(headers)).user.id;
    const [row] = await getDatabase()
      .select()
      .from(libraryEntries)
      .where(
        and(
          eq(libraryEntries.userId, owner),
          eq(libraryEntries.workId, uuid(workId)),
        ),
      );
    return row
      ? {
          id: row.id,
          revision: row.revision,
          status: row.status,
          favorite: row.favorite,
          archived: Boolean(row.removedAt),
        }
      : null;
  });
}
export async function addLibraryEntry(input: Input, headers: Headers) {
  return safe(async () => {
    const { actor, value } = await command(headers, libraryAddSchema, input);
    const requestHash = hash(actor, value.workId, "ADD", value);
    const id = await getDatabase().transaction(async (tx) => {
      // Serialize per-owner creation/count/restore and account deletion. No public identity from a client.
      const [owner] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, actor))
        .for("update");
      if (!owner) throw new HttpError(401, "AUTHENTICATION_REQUIRED");
      const [existing] = await tx
        .select()
        .from(libraryEntries)
        .where(
          and(
            eq(libraryEntries.userId, actor),
            eq(libraryEntries.workId, value.workId),
          ),
        )
        .for("update");
      const prior = await replay(
        tx,
        actor,
        value.mutationKey,
        value.workId,
        requestHash,
      );
      if (prior) {
        if (!existing) throw new HttpError(409, "CONFLICT");
        return existing.id;
      }
      if (existing && !existing.removedAt) return existing.id;
      const [work] = await tx
        .select({ id: works.id })
        .from(works)
        .where(
          and(eq(works.id, value.workId), eq(works.visibility, "PUBLISHED")),
        )
        .for("share");
      if (!work) throw new HttpError(404, "WORK_UNAVAILABLE");
      const at = await now(tx);
      if (existing) {
        if (value.revision === undefined)
          throw new HttpError(409, "RESTORE_REVISION_REQUIRED");
        fence(existing, value.revision, true);
        const restored = await changed(tx, existing, at, {
          removedAt: null,
          status: "WANT_TO_READ",
        });
        await append(
          tx,
          restored,
          value.mutationKey,
          requestHash,
          "RESTORE",
          { command: value, status: restored.status },
          at,
        );
        return restored.id;
      }
      const [count] = await tx
        .select({ total: sql<number>`count(*)`.mapWith(Number) })
        .from(libraryEntries)
        .where(eq(libraryEntries.userId, actor));
      if (count.total >= LIBRARY_MAX_ENTRIES_PER_OWNER)
        throw new HttpError(409, "LIBRARY_LIMIT_REACHED");
      const [entry] = await tx
        .insert(libraryEntries)
        .values({
          userId: actor,
          workId: value.workId,
          createdAt: at,
          updatedAt: at,
        })
        .returning();
      await append(
        tx,
        entry,
        value.mutationKey,
        requestHash,
        "ADD",
        { command: value, status: entry.status },
        at,
      );
      return entry.id;
    });
    return entryDetail(actor, id, "en", true);
  });
}
async function mutate<T extends { revision: number; mutationKey: string }>(
  id: string,
  input: Input,
  headers: Headers,
  schema: z.ZodType<T>,
  kind: LibraryEventKind | ((value: T) => LibraryEventKind),
  run: (
    tx: Tx,
    entry: Entry,
    value: T,
    at: Date,
  ) => Promise<{
    fields?: Partial<typeof libraryEntries.$inferInsert>;
    snapshot?: Record<string, unknown>;
    progress?: Session;
    noop?: boolean;
  }>,
) {
  return safe(async () => {
    const { actor, value } = await command(headers, schema, input);
    const effectiveKind = typeof kind === "function" ? kind(value) : kind;
    const target = uuid(id),
      requestHash = hash(actor, target, effectiveKind, value);
    await getDatabase().transaction(async (tx) => {
      const entry = await lockEntry(tx, actor, target);
      if (await replay(tx, actor, value.mutationKey, entry.workId, requestHash))
        return;
      fence(entry, value.revision);
      const at = await now(tx);
      const result = await run(tx, entry, value, at);
      if (result.noop) return;
      const updated = await changed(tx, entry, at, result.fields);
      await append(
        tx,
        updated,
        value.mutationKey,
        requestHash,
        effectiveKind,
        { command: value, ...result.snapshot },
        at,
      );
      if (result.progress) {
        const s = result.progress;
        await tx.insert(readingProgressEvents).values({
          ...scope(updated),
          sessionId: s.id,
          entryRevision: updated.revision,
          chapterNumber: s.chapterNumber,
          chapterLabel: s.chapterLabel,
          volumeNumber: s.volumeNumber,
          volumeLabel: s.volumeLabel,
          personalChapterTotal: s.personalChapterTotal,
          progressNotes: s.progressNotes,
          editionId: s.editionId,
          editionWorkId: s.editionWorkId,
          lastActivityAt: s.lastActivityAt,
          recordedAt: at,
        });
      }
    });
    return entryDetail(actor, target, "en", true);
  });
}
export async function removeLibraryEntry(
  id: string,
  input: Input,
  headers: Headers,
) {
  return mutate(
    id,
    input,
    headers,
    libraryRemoveSchema,
    "REMOVE",
    async (tx, entry, _value, at) => {
      ensureRoom(entry);
      const session = await openSession(tx, entry);
      if (session) await changeReadState(tx, session, "ABANDONED", at);
      return {
        fields: { removedAt: at },
        snapshot: { archived: true, sessionId: session?.id ?? null },
      };
    },
  );
}
export async function updateLibraryEntry(
  id: string,
  input: Input,
  headers: Headers,
) {
  return mutate(
    id,
    input,
    headers,
    libraryPatchSchema,
    "UPDATE",
    async (tx, entry, value: LibraryPatchInput, at) => {
      const differs = Object.entries(value.patch).some(
        ([key, next]) => next !== entry[key as keyof Entry],
      );
      if (!differs) return { noop: true };
      ensureRoom(entry);
      const session =
        value.patch.status && value.patch.status !== entry.status
          ? await statusSession(
              tx,
              entry,
              value.patch.status,
              at,
              value.acknowledgeReread,
            )
          : undefined;
      return {
        fields: value.patch,
        snapshot: {
          fromStatus: entry.status,
          toStatus: value.patch.status ?? entry.status,
          sessionId: session?.id ?? null,
        },
      };
    },
  );
}
export async function recordReadingProgress(
  id: string,
  input: Input,
  headers: Headers,
) {
  return mutate(
    id,
    input,
    headers,
    readingProgressSchema,
    "PROGRESS",
    async (tx, entry, value, at) => {
      // Work lock precedes reading/updating live Edition pointers, matching V1's Work->Edition order.
      const [work] = await tx
        .select({ visibility: works.visibility })
        .from(works)
        .where(eq(works.id, entry.workId))
        .for("share");
      const session = await openSession(tx, entry);
      if (!session || session.id !== value.sessionId)
        throw new HttpError(409, "SESSION_NOT_OPEN");
      const differs = Object.entries(value.patch).some(
        ([key, next]) =>
          (key === "progressNotes" ? (next ?? "") : next) !==
          session[key as keyof Session],
      );
      if (!differs) return { noop: true };
      ensureRoom(entry);
      if (
        value.patch.editionId &&
        value.patch.editionId !== session.editionId
      ) {
        if (work?.visibility !== "PUBLISHED")
          throw new HttpError(404, "WORK_UNAVAILABLE");
        const [edition] = await tx
          .select({ id: editions.id })
          .from(editions)
          .where(
            and(
              eq(editions.id, value.patch.editionId),
              eq(editions.workId, entry.workId),
            ),
          )
          .for("share");
        if (!edition) throw new HttpError(400, "INVALID_EDITION");
      }
      const { editionId, progressNotes, ...fields } = value.patch;
      const [updated] = await tx
        .update(readingSessions)
        .set({
          ...fields,
          ...(progressNotes === undefined
            ? {}
            : { progressNotes: progressNotes ?? "" }),
          ...(editionId === undefined
            ? {}
            : { editionId, editionWorkId: editionId ? entry.workId : null }),
          revision: session.revision + 1,
          lastActivityAt: at,
        })
        .where(eq(readingSessions.id, session.id))
        .returning();
      return { progress: updated, snapshot: { sessionId: updated.id } };
    },
  );
}
export async function readingSessionAction(
  id: string,
  input: Input,
  headers: Headers,
) {
  return mutate(
    id,
    input,
    headers,
    readingSessionActionSchema,
    (value) => value.action,
    async (tx, entry, value, at) => {
      const current = await openSession(tx, entry);
      if (value.action === "START_READ" || value.action === "START_REREAD") {
        if (current) throw new HttpError(409, "SESSION_ALREADY_OPEN");
        const reread = await completedBefore(tx, entry);
        if ((value.action === "START_REREAD") !== reread)
          throw new HttpError(
            409,
            reread ? "REREAD_ACKNOWLEDGMENT_REQUIRED" : "NO_COMPLETED_READ",
          );
        const session = await createRead(tx, entry, at, "ACTIVE", {
          startedOn: value.startedOn,
          notes: value.notes,
          acknowledgeReread: value.action === "START_REREAD",
        });
        return {
          fields: { status: "READING" },
          snapshot: { action: value.action, sessionId: session.id },
        };
      }
      if (!current || current.id !== value.sessionId) {
        if (value.action === "COMPLETE") {
          const [closed] = await tx
            .select()
            .from(readingSessions)
            .where(
              and(
                eq(readingSessions.id, value.sessionId),
                eq(readingSessions.entryId, entry.id),
                eq(readingSessions.userId, entry.userId),
              ),
            );
          if (
            closed?.state === "COMPLETED" &&
            (value.notes === undefined || value.notes === closed.notes) &&
            (value.startedOn === undefined ||
              value.startedOn === closed.startedOn) &&
            (value.finishedOn === undefined ||
              value.finishedOn === closed.finishedOn)
          )
            return { noop: true };
        }
        throw new HttpError(409, "SESSION_NOT_OPEN");
      }
      if (value.action === "RESUME") {
        if (
          current.state === "ACTIVE" &&
          (value.notes === undefined || value.notes === current.notes)
        )
          return { noop: true };
        ensureRoom(entry);
        const session = await changeReadState(
          tx,
          current,
          "ACTIVE",
          at,
          value.notes,
        );
        return {
          fields: { status: "READING" },
          snapshot: { action: value.action, sessionId: session.id },
        };
      }
      const startedOn =
        value.startedOn === undefined ? current.startedOn : value.startedOn;
      const finishedOn =
        value.finishedOn === undefined ? current.finishedOn : value.finishedOn;
      if (startedOn && finishedOn && startedOn > finishedOn)
        throw new HttpError(400, "INVALID_PERSONAL_DATES");
      ensureRoom(entry);
      const session = await changeReadState(
        tx,
        current,
        "COMPLETED",
        at,
        value.notes,
      );
      await tx
        .update(readingSessions)
        .set({ startedOn, finishedOn })
        .where(eq(readingSessions.id, session.id));
      return {
        fields: { status: "COMPLETED" },
        snapshot: { action: value.action, sessionId: session.id },
      };
    },
  );
}
// Same deterministic current locale-title fallback as V1; hidden metadata is not even a sort key.
function displayTitleSql(locale: string) {
  return sql<string>`case when ${works.visibility} = 'PUBLISHED' then case when ${works.primaryTitleLanguage} = ${locale} then ${works.primaryTitle} else coalesce((select ${workTitles.title} from ${workTitles} where ${workTitles.workId} = ${works.id} and ${workTitles.kind} = 'PRIMARY' and ${workTitles.language} = ${locale} order by ${workTitles.language} collate "C", ${workTitles.title} collate "C" limit 1), (select ${workTitles.title} from ${workTitles} where ${workTitles.workId} = ${works.id} and ${workTitles.kind} = 'ORIGINAL' order by case when ${workTitles.language} = ${works.originalLanguage} then 0 else 1 end, ${workTitles.language} collate "C", ${workTitles.title} collate "C" limit 1), ${works.primaryTitle}) end else null end`;
}
export async function listLibraryEntries(query: unknown, headers: Headers) {
  return safe(async () => {
    const owner = (await requireSession(headers)).user.id,
      value = libraryQuerySchema.parse(query);
    return getDatabase().transaction(
      async (tx) => {
        const condition = and(
          eq(libraryEntries.userId, owner),
          isNull(libraryEntries.removedAt),
          value.status ? eq(libraryEntries.status, value.status) : undefined,
          value.favorite === undefined
            ? undefined
            : eq(libraryEntries.favorite, value.favorite),
        );
        const order =
          value.sort === "ADDED_DESC"
            ? desc(libraryEntries.createdAt)
            : value.sort === "TITLE_ASC"
              ? sql`${displayTitleSql(value.locale)} collate "C" asc nulls last`
              : value.sort === "RATING_DESC"
                ? sql`${libraryEntries.ratingHalfStars} desc nulls last`
                : desc(libraryEntries.updatedAt);
        const rows = await tx
          .select({ entry: libraryEntries })
          .from(libraryEntries)
          .leftJoin(works, eq(works.id, libraryEntries.workId))
          .where(condition)
          .orderBy(order, asc(libraryEntries.id))
          .limit(50)
          .offset((value.page - 1) * 50);
        const entries = rows.map((row) => row.entry),
          catalog = await currentWorks(tx, entries, value.locale);
        const [count] = await tx
          .select({ total: sql<number>`count(*)`.mapWith(Number) })
          .from(libraryEntries)
          .where(condition);
        return {
          page: value.page,
          pageSize: 50,
          total: count.total,
          hasNext: value.page * 50 < count.total,
          items: entries.map((entry) => {
            const work = catalog.get(entry.workId);
            return {
              ...projectEntry(entry),
              work: work
                ? {
                    available: true as const,
                    id: work.id,
                    slug: work.slug,
                    displayTitle: work.displayTitle,
                    displayTitleLanguage: work.displayTitleLanguage,
                    format: work.format,
                    cover: work.cover,
                  }
                : { available: false as const, id: entry.workId },
            };
          }),
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  });
}
export async function libraryEntryHistory(
  id: string,
  query: unknown,
  headers: Headers,
) {
  return safe(async () => {
    const owner = (await requireSession(headers)).user.id,
      target = uuid(id),
      value = historyQuerySchema.parse(query);
    if (value.beforeSequence !== undefined)
      throw new HttpError(400, "INVALID_HISTORY_CURSOR");
    return getDatabase().transaction(
      async (tx) => {
        const [entry] = await tx
          .select({ id: libraryEntries.id })
          .from(libraryEntries)
          .where(
            and(
              eq(libraryEntries.id, target),
              eq(libraryEntries.userId, owner),
              isNull(libraryEntries.removedAt),
            ),
          );
        if (!entry) throw new HttpError(404, "ENTRY_NOT_FOUND");
        const rows = await tx
          .select()
          .from(libraryEvents)
          .where(
            and(
              eq(libraryEvents.entryId, target),
              eq(libraryEvents.userId, owner),
              value.beforeRevision
                ? lt(libraryEvents.entryRevision, value.beforeRevision)
                : undefined,
            ),
          )
          .orderBy(desc(libraryEvents.entryRevision))
          .limit(50);
        return {
          items: rows.map((row) => ({
            id: row.id,
            revision: row.entryRevision,
            kind: row.kind,
            snapshot: row.snapshot,
            recordedAt: iso(row.createdAt),
          })),
          nextBeforeRevision:
            rows.length === 50 ? rows.at(-1)!.entryRevision : null,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  });
}
export async function readingSessionHistory(
  id: string,
  query: unknown,
  headers: Headers,
) {
  return safe(async () => {
    const owner = (await requireSession(headers)).user.id,
      target = uuid(id),
      value = historyQuerySchema.parse(query);
    if (value.beforeRevision !== undefined)
      throw new HttpError(400, "INVALID_HISTORY_CURSOR");
    return getDatabase().transaction(
      async (tx) => {
        const [entry] = await tx
          .select({ id: libraryEntries.id })
          .from(libraryEntries)
          .where(
            and(
              eq(libraryEntries.id, target),
              eq(libraryEntries.userId, owner),
              isNull(libraryEntries.removedAt),
            ),
          );
        if (!entry) throw new HttpError(404, "ENTRY_NOT_FOUND");
        const rows = await tx
          .select()
          .from(readingSessions)
          .where(
            and(
              eq(readingSessions.entryId, target),
              eq(readingSessions.userId, owner),
              value.beforeSequence
                ? lt(readingSessions.sequence, value.beforeSequence)
                : undefined,
            ),
          )
          .orderBy(desc(readingSessions.sequence))
          .limit(50);
        return {
          items: rows.map(projectSession),
          nextBeforeSequence: rows.length === 50 ? rows.at(-1)!.sequence : null,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  });
}
export async function readingProgressHistory(
  id: string,
  sessionId: string,
  query: unknown,
  headers: Headers,
) {
  return safe(async () => {
    const owner = (await requireSession(headers)).user.id,
      target = uuid(id),
      session = uuid(sessionId),
      value = historyQuerySchema.parse(query);
    if (value.beforeSequence !== undefined)
      throw new HttpError(400, "INVALID_HISTORY_CURSOR");
    return getDatabase().transaction(
      async (tx) => {
        const [row] = await tx
          .select({ id: readingSessions.id })
          .from(readingSessions)
          .innerJoin(
            libraryEntries,
            eq(libraryEntries.id, readingSessions.entryId),
          )
          .where(
            and(
              eq(readingSessions.id, session),
              eq(readingSessions.entryId, target),
              eq(readingSessions.userId, owner),
              isNull(libraryEntries.removedAt),
            ),
          );
        if (!row) throw new HttpError(404, "SESSION_NOT_FOUND");
        const events = await tx
          .select()
          .from(readingProgressEvents)
          .where(
            and(
              eq(readingProgressEvents.entryId, target),
              eq(readingProgressEvents.userId, owner),
              eq(readingProgressEvents.sessionId, session),
              value.beforeRevision
                ? lt(readingProgressEvents.entryRevision, value.beforeRevision)
                : undefined,
            ),
          )
          .orderBy(desc(readingProgressEvents.entryRevision))
          .limit(50);
        return {
          items: events.map((event) => ({
            id: event.id,
            revision: event.entryRevision,
            recordedAt: iso(event.recordedAt),
            ...projectProgress(event),
          })),
          nextBeforeRevision:
            events.length === 50 ? events.at(-1)!.entryRevision : null,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  });
}
export type LibraryEntryDetail = Awaited<ReturnType<typeof getLibraryEntry>>;
export type LibraryPage = Awaited<ReturnType<typeof listLibraryEntries>>;
export type SessionHistoryPage = Awaited<
  ReturnType<typeof readingSessionHistory>
>;
export type ProgressHistoryPage = Awaited<
  ReturnType<typeof readingProgressHistory>
>;
