import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { editions, works } from "./catalog-schema";
import { user } from "./schema";
import {
  LIBRARY_STATUSES,
  READING_SESSION_STATES,
  READING_SESSION_KINDS,
  LIBRARY_EVENT_KINDS,
  LIBRARY_MAX_SESSIONS_PER_ENTRY,
  LIBRARY_MAX_EVENTS_PER_ENTRY,
  LIBRARY_MAX_ENTRY_NOTES_LENGTH,
  LIBRARY_MAX_SESSION_NOTES_LENGTH,
  LIBRARY_MAX_PROGRESS_NOTES_LENGTH,
  LIBRARY_MAX_PROGRESS_LABEL_LENGTH,
  LIBRARY_MAX_CHAPTER_NUMBER,
  LIBRARY_MAX_VOLUME_NUMBER,
  LIBRARY_MAX_EVENT_SNAPSHOT_BYTES,
} from "./library-types";

export const libraryStatus = pgEnum("library_status", LIBRARY_STATUSES);
export const readingSessionState = pgEnum(
  "reading_session_state",
  READING_SESSION_STATES,
);
export const readingSessionKind = pgEnum(
  "reading_session_kind",
  READING_SESSION_KINDS,
);
export const libraryEventKind = pgEnum(
  "library_event_kind",
  LIBRARY_EVENT_KINDS,
);

const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const boundedText = (column: AnyPgColumn, max: number): SQL =>
  sql`char_length(${column}) <= ${sql.raw(String(max))}`;
const boundedInteger = (column: AnyPgColumn, min: number, max: number): SQL =>
  sql`${column} BETWEEN ${sql.raw(String(min))} AND ${sql.raw(String(max))}`;
const exactDate = (column: AnyPgColumn): SQL =>
  sql`${column} BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'`;

// Each call supplies fresh builders. Labels may be NULL or empty; notes preserve
// plain text (including whitespace/newlines), not HTML or catalog metadata.
const progressColumns = () => ({
  chapterNumber: integer("chapter_number"),
  chapterLabel: text("chapter_label"),
  volumeNumber: integer("volume_number"),
  volumeLabel: text("volume_label"),
  personalChapterTotal: integer("personal_chapter_total"),
  progressNotes: text("progress_notes").default("").notNull(),
  editionId: uuid("edition_id"),
  editionWorkId: uuid("edition_work_id"),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
});
type ProgressScope = {
  workId: AnyPgColumn;
  chapterNumber: AnyPgColumn;
  chapterLabel: AnyPgColumn;
  volumeNumber: AnyPgColumn;
  volumeLabel: AnyPgColumn;
  personalChapterTotal: AnyPgColumn;
  progressNotes: AnyPgColumn;
  editionId: AnyPgColumn;
  editionWorkId: AnyPgColumn;
};
const progressConstraints = (name: string, t: ProgressScope) => [
  check(
    `${name}_chapter_number_check`,
    boundedInteger(t.chapterNumber, 0, LIBRARY_MAX_CHAPTER_NUMBER),
  ),
  check(
    `${name}_chapter_label_check`,
    boundedText(t.chapterLabel, LIBRARY_MAX_PROGRESS_LABEL_LENGTH),
  ),
  check(
    `${name}_volume_number_check`,
    boundedInteger(t.volumeNumber, 0, LIBRARY_MAX_VOLUME_NUMBER),
  ),
  check(
    `${name}_volume_label_check`,
    boundedText(t.volumeLabel, LIBRARY_MAX_PROGRESS_LABEL_LENGTH),
  ),
  check(
    `${name}_personal_total_check`,
    boundedInteger(t.personalChapterTotal, 1, LIBRARY_MAX_CHAPTER_NUMBER),
  ),
  check(
    `${name}_progress_notes_check`,
    boundedText(t.progressNotes, LIBRARY_MAX_PROGRESS_NOTES_LENGTH),
  ),
  check(
    `${name}_edition_scope_check`,
    sql`(${t.editionId} IS NULL AND ${t.editionWorkId} IS NULL) OR (${t.editionId} IS NOT NULL AND ${t.editionWorkId} IS NOT NULL AND ${t.editionWorkId} = ${t.workId})`,
  ),
  // SET NULL affects both nullable reference columns, NEVER the scoped workId.
  // Existing V1 Edition removal therefore retains progress and private history.
  foreignKey({
    columns: [t.editionId, t.editionWorkId],
    foreignColumns: [editions.id, editions.workId],
    name: `${name}_edition_work_fk`,
  }).onDelete("set null"),
  index(`${name}_edition_work_idx`).on(t.editionId, t.editionWorkId),
];

// Aggregate owner/session/event bounds and cross-row lifecycle transitions are
// enforced by the service under its owned entry lock; CHECKs bound stored values.
export const libraryEntries = pgTable(
  "library_entries",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workId: uuid("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "restrict" }),
    status: libraryStatus("status").default("WANT_TO_READ").notNull(),
    favorite: boolean("favorite").default(false).notNull(),
    ratingHalfStars: integer("rating_half_stars"),
    notes: text("notes").default("").notNull(),
    revision: integer("revision").default(1).notNull(),
    eventCount: integer("event_count").default(1).notNull(),
    sessionCount: integer("session_count").default(0).notNull(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("library_entries_user_work_unique").on(t.userId, t.workId),
    unique("library_entries_id_user_work_unique").on(t.id, t.userId, t.workId),
    check(
      "library_entries_rating_check",
      boundedInteger(t.ratingHalfStars, 2, 10),
    ),
    check(
      "library_entries_notes_check",
      boundedText(t.notes, LIBRARY_MAX_ENTRY_NOTES_LENGTH),
    ),
    check(
      "library_entries_revision_check",
      boundedInteger(t.revision, 1, LIBRARY_MAX_EVENTS_PER_ENTRY),
    ),
    check(
      "library_entries_event_count_check",
      boundedInteger(t.eventCount, 1, LIBRARY_MAX_EVENTS_PER_ENTRY),
    ),
    check(
      "library_entries_session_count_check",
      boundedInteger(t.sessionCount, 0, LIBRARY_MAX_SESSIONS_PER_ENTRY),
    ),
    index("library_entries_owner_archive_updated_idx").on(
      t.userId,
      t.removedAt,
      t.updatedAt.desc(),
      t.id.desc(),
    ),
    index("library_entries_owner_archive_created_idx").on(
      t.userId,
      t.removedAt,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index("library_entries_owner_status_updated_idx").on(
      t.userId,
      t.removedAt,
      t.status,
      t.updatedAt.desc(),
      t.id.desc(),
    ),
    index("library_entries_owner_favorite_updated_idx").on(
      t.userId,
      t.removedAt,
      t.favorite,
      t.updatedAt.desc(),
      t.id.desc(),
    ),
    index("library_entries_work_idx").on(t.workId),
  ],
);

export const readingSessions = pgTable(
  "reading_sessions",
  {
    id: id(),
    entryId: uuid("entry_id").notNull(),
    userId: text("user_id").notNull(),
    workId: uuid("work_id").notNull(),
    sequence: integer("sequence").notNull(),
    kind: readingSessionKind("kind").notNull(),
    state: readingSessionState("state").default("ACTIVE").notNull(),
    revision: integer("revision").default(1).notNull(),
    // Command markers only: no defaults or inference for actual personal dates.
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    startedOn: date("started_on", { mode: "string" }),
    finishedOn: date("finished_on", { mode: "string" }),
    notes: text("notes").default("").notNull(),
    ...progressColumns(),
  },
  (t) => [
    foreignKey({
      columns: [t.entryId, t.userId, t.workId],
      foreignColumns: [
        libraryEntries.id,
        libraryEntries.userId,
        libraryEntries.workId,
      ],
      name: "reading_sessions_entry_scope_fk",
    }).onDelete("cascade"),
    unique("reading_sessions_id_entry_user_work_unique").on(
      t.id,
      t.entryId,
      t.userId,
      t.workId,
    ),
    unique("reading_sessions_entry_sequence_unique").on(t.entryId, t.sequence),
    uniqueIndex("reading_sessions_one_unfinished_unique")
      .on(t.entryId)
      .where(sql`${t.state} IN ('ACTIVE', 'PAUSED')`),
    check(
      "reading_sessions_sequence_check",
      boundedInteger(t.sequence, 1, LIBRARY_MAX_SESSIONS_PER_ENTRY),
    ),
    check("reading_sessions_revision_check", sql`${t.revision} > 0`),
    check(
      "reading_sessions_notes_check",
      boundedText(t.notes, LIBRARY_MAX_SESSION_NOTES_LENGTH),
    ),
    check("reading_sessions_started_on_check", exactDate(t.startedOn)),
    check("reading_sessions_finished_on_check", exactDate(t.finishedOn)),
    check(
      "reading_sessions_personal_chronology_check",
      sql`${t.startedOn} IS NULL OR ${t.finishedOn} IS NULL OR ${t.startedOn} <= ${t.finishedOn}`,
    ),
    check(
      "reading_sessions_terminal_markers_check",
      sql`(${t.state} IN ('ACTIVE', 'PAUSED') AND ${t.completedAt} IS NULL AND ${t.closedAt} IS NULL) OR (${t.state} = 'COMPLETED' AND ${t.completedAt} IS NOT NULL AND ${t.closedAt} IS NOT NULL) OR (${t.state} = 'ABANDONED' AND ${t.completedAt} IS NULL AND ${t.closedAt} IS NOT NULL)`,
    ),
    check(
      "reading_sessions_marker_chronology_check",
      sql`(${t.completedAt} IS NULL OR ${t.completedAt} >= ${t.startedAt}) AND (${t.closedAt} IS NULL OR ${t.closedAt} >= ${t.startedAt}) AND (${t.completedAt} IS NULL OR ${t.closedAt} >= ${t.completedAt})`,
    ),
    ...progressConstraints("reading_sessions", t),
    index("reading_sessions_entry_history_idx").on(
      t.entryId,
      t.sequence.desc(),
      t.id.desc(),
    ),
    index("reading_sessions_owner_history_idx").on(
      t.userId,
      t.startedAt.desc(),
      t.id.desc(),
    ),
  ],
);

// Private facts and UUIDs only; the service must exclude all cached catalog
// metadata and bind canonical SHA-256 to command, owner, target and input.
export const libraryEvents = pgTable(
  "library_events",
  {
    id: id(),
    entryId: uuid("entry_id").notNull(),
    userId: text("user_id").notNull(),
    workId: uuid("work_id").notNull(),
    entryRevision: integer("entry_revision").notNull(),
    mutationKey: uuid("mutation_key").notNull(),
    requestHash: text("request_hash").notNull(),
    kind: libraryEventKind("kind").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.entryId, t.userId, t.workId],
      foreignColumns: [
        libraryEntries.id,
        libraryEntries.userId,
        libraryEntries.workId,
      ],
      name: "library_events_entry_scope_fk",
    }).onDelete("cascade"),
    unique("library_events_entry_revision_unique").on(
      t.entryId,
      t.entryRevision,
    ),
    unique("library_events_entry_key_unique").on(t.entryId, t.mutationKey),
    // An owner's key cannot be rebound to another entry/Work or command.
    unique("library_events_owner_key_unique").on(t.userId, t.mutationKey),
    check(
      "library_events_revision_check",
      boundedInteger(t.entryRevision, 1, LIBRARY_MAX_EVENTS_PER_ENTRY),
    ),
    check(
      "library_events_request_hash_check",
      sql`char_length(${t.requestHash}) = 64 AND ${t.requestHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "library_events_snapshot_check",
      sql`jsonb_typeof(${t.snapshot}) = 'object' AND octet_length(${t.snapshot}::text) <= ${sql.raw(String(LIBRARY_MAX_EVENT_SNAPSHOT_BYTES))}`,
    ),
    index("library_events_entry_timeline_idx").on(
      t.entryId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
  ],
);

export const readingProgressEvents = pgTable(
  "reading_progress_events",
  {
    id: id(),
    entryId: uuid("entry_id").notNull(),
    userId: text("user_id").notNull(),
    workId: uuid("work_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    entryRevision: integer("entry_revision").notNull(),
    ...progressColumns(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // These two scopes imply the entry/user/Work scope without redundant FKs.
    foreignKey({
      columns: [t.sessionId, t.entryId, t.userId, t.workId],
      foreignColumns: [
        readingSessions.id,
        readingSessions.entryId,
        readingSessions.userId,
        readingSessions.workId,
      ],
      name: "reading_progress_events_session_scope_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.entryId, t.entryRevision],
      foreignColumns: [libraryEvents.entryId, libraryEvents.entryRevision],
      name: "reading_progress_events_entry_revision_fk",
    }).onDelete("cascade"),
    unique("reading_progress_events_entry_revision_unique").on(
      t.entryId,
      t.entryRevision,
    ),
    check(
      "reading_progress_events_revision_check",
      boundedInteger(t.entryRevision, 1, LIBRARY_MAX_EVENTS_PER_ENTRY),
    ),
    ...progressConstraints("reading_progress_events", t),
    index("reading_progress_events_entry_timeline_idx").on(
      t.entryId,
      t.recordedAt.desc(),
      t.id.desc(),
    ),
    index("reading_progress_events_session_timeline_idx").on(
      t.sessionId,
      t.recordedAt.desc(),
      t.id.desc(),
    ),
  ],
);
