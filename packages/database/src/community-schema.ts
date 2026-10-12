import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { works } from "./catalog-schema";
import { user } from "./schema";
import * as C from "./community-types";

export const communityContentKind = pgEnum(
  "community_content_kind",
  C.COMMUNITY_CONTENT_KINDS,
);
export const communityAuthorState = pgEnum(
  "community_author_state",
  C.COMMUNITY_AUTHOR_STATES,
);
export const communityModerationState = pgEnum(
  "community_moderation_state",
  C.COMMUNITY_MODERATION_STATES,
);
export const communityReportReason = pgEnum(
  "community_report_reason",
  C.COMMUNITY_REPORT_REASONS,
);
export const communityReportState = pgEnum(
  "community_report_state",
  C.COMMUNITY_REPORT_STATES,
);
export const communityCommandKind = pgEnum(
  "community_command_kind",
  C.COMMUNITY_COMMAND_KINDS,
);
export const communityModerationActionKind = pgEnum(
  "community_moderation_action_kind",
  C.COMMUNITY_MODERATION_ACTION_KINDS,
);
export const communityMutationOutcome = pgEnum(
  "community_mutation_outcome",
  C.COMMUNITY_MUTATION_OUTCOMES,
);
const id = () => uuid("id").defaultRandom().primaryKey();
const time = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => time("created_at").defaultNow().notNull();
const bounded = (column: AnyPgColumn, max: number, bytes: number): SQL =>
  sql`char_length(${column}) + char_length(regexp_replace(${column}, U&'[^\\+010000-\\+10FFFF]', '', 'g')) <= ${sql.raw(String(max))} AND octet_length(${column}) <= ${sql.raw(String(bytes))}`;
const range = (column: AnyPgColumn, min: number, max: number): SQL =>
  sql`${column} BETWEEN ${sql.raw(String(min))} AND ${sql.raw(String(max))}`;
const scope = () => ({
  contentId: uuid("content_id").notNull(),
  workId: uuid("work_id").notNull(),
  targetKind: communityContentKind("target_kind").notNull(),
});

// Aggregate lifetime bounds are serialized by service locks, not racy CHECK subqueries.
// The forward migration supplies immutable-scope and complete privacy-erasure triggers.
export const communityContents = pgTable(
  "community_contents",
  {
    id: id(),
    workId: uuid("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "restrict" }),
    kind: communityContentKind("kind").notNull(),
    authorId: text("author_id").references(() => user.id, {
      onDelete: "set null",
    }),
    authorState: communityAuthorState("author_state")
      .default("ACTIVE")
      .notNull(),
    moderationState: communityModerationState("moderation_state")
      .default("VISIBLE")
      .notNull(),
    title: text("title").default("").notNull(),
    body: text("body").default("").notNull(),
    titleSpoiler: boolean("title_spoiler").default(false).notNull(),
    bodySpoiler: boolean("body_spoiler").default(false).notNull(),
    spoilerContext: text("spoiler_context"),
    ratingHalfStars: integer("rating_half_stars"),
    threadId: uuid("thread_id"),
    threadKind: communityContentKind("thread_kind"),
    parentId: uuid("parent_id"),
    parentKind: communityContentKind("parent_kind"),
    parentDepth: integer("parent_depth"),
    depth: integer("depth"),
    revision: integer("revision").default(1).notNull(),
    eventCount: integer("event_count").default(0).notNull(),
    reportCount: integer("report_count").default(0).notNull(),
    moderationActionCount: integer("moderation_action_count")
      .default(0)
      .notNull(),
    createdAt: time("created_at").defaultNow(),
    updatedAt: time("updated_at").defaultNow(),
    editedAt: time("edited_at"),
    lastActivityAt: time("last_activity_at").defaultNow(),
  },
  (t) => [
    unique("community_contents_scope_unique").on(t.id, t.workId, t.kind),
    unique("community_contents_parent_scope_unique").on(
      t.id,
      t.workId,
      t.threadId,
      t.kind,
      t.depth,
    ),
    foreignKey({
      columns: [t.threadId, t.workId, t.threadKind],
      foreignColumns: [t.id, t.workId, t.kind],
      name: "community_contents_thread_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.parentId, t.workId, t.threadId, t.parentKind, t.parentDepth],
      foreignColumns: [t.id, t.workId, t.threadId, t.kind, t.depth],
      name: "community_contents_parent_fk",
    }).onDelete("restrict"),
    check(
      "community_contents_structure_check",
      sql`(${t.kind} = 'REPLY' AND ${t.threadId} IS NOT NULL AND ${t.threadKind} = 'THREAD' AND ${t.threadKind} IS NOT NULL AND ${t.depth} BETWEEN 0 AND 2 AND ${t.depth} IS NOT NULL AND ((${t.depth} = 0 AND ${t.parentId} IS NULL AND ${t.parentKind} IS NULL AND ${t.parentDepth} IS NULL) OR (${t.depth} > 0 AND ${t.parentId} IS NOT NULL AND ${t.parentKind} = 'REPLY' AND ${t.parentKind} IS NOT NULL AND ${t.parentDepth} = ${t.depth} - 1 AND ${t.parentDepth} IS NOT NULL))) OR (${t.kind} IN ('THREAD','REVIEW') AND ${t.threadId} IS NULL AND ${t.threadKind} IS NULL AND ${t.parentId} IS NULL AND ${t.parentKind} IS NULL AND ${t.parentDepth} IS NULL AND ${t.depth} IS NULL)`,
    ),
    check(
      "community_contents_text_bounds_check",
      sql`${bounded(t.title, C.COMMUNITY_MAX_TITLE_LENGTH, C.COMMUNITY_MAX_TITLE_BYTES)} AND ${bounded(t.body, C.COMMUNITY_MAX_BODY_LENGTH, C.COMMUNITY_MAX_BODY_BYTES)} AND (${t.kind} <> 'REPLY' OR (${bounded(t.body, C.COMMUNITY_MAX_REPLY_BODY_LENGTH, C.COMMUNITY_MAX_REPLY_BODY_BYTES)})) AND (${t.spoilerContext} IS NULL OR (${bounded(t.spoilerContext, C.COMMUNITY_MAX_CONTEXT_LENGTH, C.COMMUNITY_MAX_CONTEXT_BYTES)} AND char_length(btrim(${t.spoilerContext})) > 0))`,
    ),
    check(
      "community_contents_flags_check",
      sql`(${t.kind} = 'THREAD' OR (${t.title} = '' AND NOT ${t.titleSpoiler})) AND (${t.spoilerContext} IS NULL OR ${t.titleSpoiler} OR ${t.bodySpoiler}) AND (${t.kind} = 'REVIEW' OR ${t.ratingHalfStars} IS NULL)`,
    ),
    check(
      "community_contents_rating_check",
      range(
        t.ratingHalfStars,
        C.COMMUNITY_MIN_RATING_HALF_STARS,
        C.COMMUNITY_MAX_RATING_HALF_STARS,
      ),
    ),
    check(
      "community_contents_author_shape_check",
      sql`(${t.authorState} = 'ERASED' AND ${t.authorId} IS NULL AND ${t.createdAt} IS NULL AND ${t.updatedAt} IS NULL AND ${t.editedAt} IS NULL AND ${t.lastActivityAt} IS NULL) OR (${t.authorState} <> 'ERASED' AND ${t.authorId} IS NOT NULL AND ${t.createdAt} IS NOT NULL AND ${t.updatedAt} IS NOT NULL AND ${t.lastActivityAt} IS NOT NULL)`,
    ),
    check(
      "community_contents_live_text_check",
      sql`(${t.authorState} = 'ACTIVE' AND ((${t.kind} = 'THREAD' AND char_length(btrim(${t.title})) >= 1 AND char_length(btrim(${t.body})) >= 1) OR (${t.kind} = 'REPLY' AND char_length(btrim(${t.body})) >= 1) OR (${t.kind} = 'REVIEW' AND char_length(btrim(${t.body})) + char_length(regexp_replace(btrim(${t.body}), U&'[^\\+010000-\\+10FFFF]', '', 'g')) >= 20))) OR (${t.authorState} <> 'ACTIVE' AND ${t.title} = '' AND ${t.body} = '' AND ${t.spoilerContext} IS NULL AND ${t.ratingHalfStars} IS NULL AND NOT ${t.titleSpoiler} AND NOT ${t.bodySpoiler})`,
    ),
    check("community_contents_revision_check", sql`${t.revision} > 0`),
    check(
      "community_contents_event_count_check",
      range(
        t.eventCount,
        0,
        C.COMMUNITY_MAX_EVENTS_PER_CONTENT +
          C.COMMUNITY_RESERVED_WITHDRAWAL_EVENTS_PER_CONTENT,
      ),
    ),
    check(
      "community_contents_report_count_check",
      range(t.reportCount, 0, C.COMMUNITY_MAX_REPORTS_PER_CONTENT),
    ),
    check(
      "community_contents_action_count_check",
      range(
        t.moderationActionCount,
        0,
        C.COMMUNITY_MAX_MODERATION_ACTIONS_PER_CONTENT,
      ),
    ),
    uniqueIndex("community_contents_review_slot_unique")
      .on(t.authorId, t.workId)
      .where(
        sql`${t.kind} = 'REVIEW' AND (${t.authorState} = 'ACTIVE' OR ${t.moderationState} = 'HIDDEN')`,
      ),
    index("community_contents_author_idx").on(t.authorId),
    index("community_contents_work_idx").on(
      t.workId,
      t.kind,
      t.createdAt,
      t.id,
    ),
    index("community_contents_thread_idx").on(
      t.threadId,
      t.workId,
      t.threadKind,
    ),
    index("community_contents_parent_idx").on(
      t.parentId,
      t.workId,
      t.threadId,
      t.parentKind,
      t.parentDepth,
    ),
  ],
);

export const communityContentEvents = pgTable(
  "community_content_events",
  {
    id: id(),
    ...scope(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    contentRevision: integer("content_revision").notNull(),
    command: communityCommandKind("command").notNull(),
    beforeAuthorState: communityAuthorState("before_author_state").notNull(),
    afterAuthorState: communityAuthorState("after_author_state").notNull(),
    beforeModerationState: communityModerationState(
      "before_moderation_state",
    ).notNull(),
    afterModerationState: communityModerationState(
      "after_moderation_state",
    ).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.contentId, t.workId, t.targetKind],
      foreignColumns: [
        communityContents.id,
        communityContents.workId,
        communityContents.kind,
      ],
      name: "community_content_events_target_fk",
    }).onDelete("cascade"),
    unique("community_content_events_revision_unique").on(
      t.contentId,
      t.contentRevision,
    ),
    check(
      "community_content_events_revision_check",
      sql`${t.contentRevision} > 0`,
    ),
    check(
      "community_content_events_command_check",
      sql`${t.command} <> 'REPORT'`,
    ),
    index("community_content_events_target_idx").on(
      t.contentId,
      t.workId,
      t.targetKind,
    ),
    index("community_content_events_actor_idx").on(t.actorId),
  ],
);

export const communityReports = pgTable(
  "community_reports",
  {
    id: id(),
    ...scope(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: communityReportReason("reason").notNull(),
    explanation: text("explanation").default("").notNull(),
    // Erasure redacts OTHER explanations too; this marker carries no authored data.
    evidenceRedacted: boolean("evidence_redacted").default(false).notNull(),
    state: communityReportState("state").default("OPEN").notNull(),
    revision: integer("revision").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: time("updated_at").defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.contentId, t.workId, t.targetKind],
      foreignColumns: [
        communityContents.id,
        communityContents.workId,
        communityContents.kind,
      ],
      name: "community_reports_target_fk",
    }).onDelete("cascade"),
    unique("community_reports_scope_unique").on(
      t.id,
      t.workId,
      t.contentId,
      t.targetKind,
    ),
    uniqueIndex("community_reports_open_unique")
      .on(t.reporterId, t.contentId)
      .where(sql`${t.state} = 'OPEN'`),
    check(
      "community_reports_explanation_check",
      bounded(
        t.explanation,
        C.COMMUNITY_MAX_EXPLANATION_LENGTH,
        C.COMMUNITY_MAX_EXPLANATION_BYTES,
      ),
    ),
    check(
      "community_reports_evidence_check",
      sql`(${t.evidenceRedacted} AND ${t.explanation} = '') OR (NOT ${t.evidenceRedacted} AND (${t.reason} <> 'OTHER' OR char_length(btrim(${t.explanation})) > 0))`,
    ),
    check("community_reports_revision_check", sql`${t.revision} > 0`),
    index("community_reports_target_idx").on(
      t.contentId,
      t.workId,
      t.targetKind,
    ),
    index("community_reports_reporter_idx").on(t.reporterId),
    index("community_reports_queue_idx").on(t.state, t.createdAt, t.id),
  ],
);

export const communityModerationActions = pgTable(
  "community_moderation_actions",
  {
    id: id(),
    ...scope(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reportId: uuid("report_id"),
    action: communityModerationActionKind("action").notNull(),
    reason: text("reason").notNull(),
    evidenceRedacted: boolean("evidence_redacted").default(false).notNull(),
    sequence: integer("sequence").notNull(),
    contentRevision: integer("content_revision").notNull(),
    reportRevision: integer("report_revision"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.contentId, t.workId, t.targetKind],
      foreignColumns: [
        communityContents.id,
        communityContents.workId,
        communityContents.kind,
      ],
      name: "community_moderation_actions_target_fk",
    }).onDelete("cascade"),
    // 0010 uses PostgreSQL SET NULL (report_id), preserving the nonnullable scope.
    foreignKey({
      columns: [t.reportId, t.workId, t.contentId, t.targetKind],
      foreignColumns: [
        communityReports.id,
        communityReports.workId,
        communityReports.contentId,
        communityReports.targetKind,
      ],
      name: "community_moderation_actions_report_fk",
    }).onDelete("set null"),
    unique("community_moderation_actions_sequence_unique").on(
      t.contentId,
      t.sequence,
    ),
    check(
      "community_moderation_actions_sequence_check",
      range(t.sequence, 1, C.COMMUNITY_MAX_MODERATION_ACTIONS_PER_CONTENT),
    ),
    check(
      "community_moderation_actions_revision_check",
      sql`${t.contentRevision} > 0 AND (${t.reportRevision} IS NULL OR ${t.reportRevision} > 0)`,
    ),
    check(
      "community_moderation_actions_reason_check",
      sql`${bounded(t.reason, C.COMMUNITY_MAX_REASON_LENGTH, C.COMMUNITY_MAX_REASON_BYTES)} AND ((${t.evidenceRedacted} AND ${t.reason} = '') OR (NOT ${t.evidenceRedacted} AND char_length(btrim(${t.reason})) > 0))`,
    ),
    index("community_moderation_actions_target_idx").on(
      t.contentId,
      t.workId,
      t.targetKind,
    ),
    index("community_moderation_actions_actor_idx").on(t.actorId),
    index("community_moderation_actions_report_idx").on(
      t.reportId,
      t.workId,
      t.contentId,
      t.targetKind,
    ),
  ],
);

export const communityMutationReceipts = pgTable(
  "community_mutation_receipts",
  {
    id: id(),
    ...scope(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reportId: uuid("report_id"),
    mutationKey: uuid("mutation_key").notNull(),
    requestHash: text("request_hash").notNull(),
    command: communityCommandKind("command").notNull(),
    outcome: communityMutationOutcome("outcome").notNull(),
    contentRevision: integer("content_revision").notNull(),
    reportRevision: integer("report_revision"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.contentId, t.workId, t.targetKind],
      foreignColumns: [
        communityContents.id,
        communityContents.workId,
        communityContents.kind,
      ],
      name: "community_mutation_receipts_target_fk",
    }).onDelete("cascade"),
    // As above, the reviewed forward SQL nulls ONLY report_id on reporter deletion.
    foreignKey({
      columns: [t.reportId, t.workId, t.contentId, t.targetKind],
      foreignColumns: [
        communityReports.id,
        communityReports.workId,
        communityReports.contentId,
        communityReports.targetKind,
      ],
      name: "community_mutation_receipts_report_fk",
    }).onDelete("set null"),
    unique("community_mutation_receipts_actor_key_unique").on(
      t.actorId,
      t.mutationKey,
    ),
    check(
      "community_mutation_receipts_hash_check",
      sql`${t.requestHash} ~ '^[0-9a-f]{64}$' AND char_length(${t.requestHash}) = 64`,
    ),
    check(
      "community_mutation_receipts_revision_check",
      sql`${t.contentRevision} > 0 AND (${t.reportRevision} IS NULL OR ${t.reportRevision} > 0)`,
    ),
    index("community_mutation_receipts_target_idx").on(
      t.contentId,
      t.workId,
      t.targetKind,
    ),
    index("community_mutation_receipts_report_idx").on(
      t.reportId,
      t.workId,
      t.contentId,
      t.targetKind,
    ),
  ],
);
