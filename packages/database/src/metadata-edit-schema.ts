import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  unique,
  index,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { user } from "./schema";
import {
  works,
  titleKind,
  catalogSources,
  catalogAuditEvents,
} from "./catalog-schema";
import { editSuggestionState } from "./edit-suggestion-schema";

export type MetadataOperationType =
  | "TITLE_ADD"
  | "TITLE_REPLACE"
  | "TITLE_REMOVE"
  | "DESCRIPTION_ADD"
  | "DESCRIPTION_REPLACE"
  | "DESCRIPTION_REMOVE"
  | "GENRE_ADD_MEMBERSHIP"
  | "GENRE_REMOVE_MEMBERSHIP";
export type MetadataContentState = "ACTIVE" | "ERASED";
const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
// SQL-only transition, immutable-history, erasure and deferred consistency guards
// are installed by forward migration 0014. No canonical JSON copy is persisted.
export const metadataEditSuggestions = pgTable(
  "metadata_edit_suggestions",
  {
    id: id(),
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    workId: uuid("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    baseWorkRevision: integer("base_work_revision").notNull(),
    revision: integer("revision").default(1).notNull(),
    state: editSuggestionState("state").default("SUBMITTED").notNull(),
    operationType: text("operation_type")
      .$type<MetadataOperationType>()
      .notNull(),
    titleId: uuid("title_id"),
    titleText: text("title_text"),
    titleLanguage: text("title_language"),
    titleKind: titleKind("title_kind"),
    descriptionLanguage: text("description_language"),
    descriptionText: text("description_text"),
    genreSlug: text("genre_slug"),
    operationReason: text("operation_reason"),
    citationLabel: text("citation_label"),
    citationText: text("citation_text"),
    citationUrl: text("citation_url"),
    citationConsultedAt: text("citation_consulted_at"),
    rightsBasis: text("rights_basis"),
    originalityAcknowledged: boolean("originality_acknowledged"),
    rightsStatement: text("rights_statement"),
    submitKey: uuid("submit_key"),
    inputHash: text("input_hash"),
    appliedWorkRevision: integer("applied_work_revision"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    contentState: text("content_state")
      .$type<MetadataContentState>()
      .default("ACTIVE")
      .notNull(),
    erasedAt: timestamp("erased_at", { withTimezone: true }),
  },
  (t) => [
    unique("metadata_edit_suggestions_owner_submit_unique").on(
      t.ownerUserId,
      t.submitKey,
    ),
    unique("metadata_edit_suggestions_id_work_unique").on(t.id, t.workId),
    check(
      "metadata_edit_suggestions_lifecycle_check",
      sql`${t.version} = 1 AND ${t.baseWorkRevision} > 0 AND ((${t.state} = 'SUBMITTED' AND ${t.revision} = 1 AND ${t.appliedWorkRevision} IS NULL) OR (${t.state} = 'REJECTED' AND ${t.revision} = 2 AND ${t.appliedWorkRevision} IS NULL) OR (${t.state} = 'APPROVED' AND ${t.revision} = 2 AND ${t.appliedWorkRevision} IS NOT NULL AND ${t.appliedWorkRevision}::bigint = ${t.baseWorkRevision}::bigint + 1))`,
    ),
    check(
      "metadata_edit_suggestions_operation_check",
      sql`${t.operationType} IN ('TITLE_ADD','TITLE_REPLACE','TITLE_REMOVE','DESCRIPTION_ADD','DESCRIPTION_REPLACE','DESCRIPTION_REMOVE','GENRE_ADD_MEMBERSHIP','GENRE_REMOVE_MEMBERSHIP')`,
    ),
    check(
      "metadata_edit_suggestions_content_check",
      sql.raw(`
    (content_state = 'ERASED' AND owner_user_id IS NULL AND erased_at IS NOT NULL AND num_nonnulls(title_id,title_text,title_language,title_kind,description_language,description_text,genre_slug,operation_reason,citation_label,citation_text,citation_url,citation_consulted_at,rights_basis,originality_acknowledged,rights_statement,submit_key,input_hash) = 0)
    OR (content_state = 'ACTIVE' AND owner_user_id IS NOT NULL AND erased_at IS NULL AND submit_key IS NOT NULL AND input_hash IS NOT NULL AND input_hash ~ '^[0-9a-f]{64}$' AND citation_label IS NOT NULL AND citation_text IS NOT NULL AND (
      (operation_type = 'TITLE_ADD' AND title_text IS NOT NULL AND title_language IS NOT NULL AND title_kind IS NOT NULL AND title_kind IN ('PRIMARY','ALIAS') AND num_nonnulls(title_id,description_language,description_text,genre_slug,operation_reason,rights_basis,originality_acknowledged,rights_statement) = 0)
      OR (operation_type = 'TITLE_REPLACE' AND title_id IS NOT NULL AND title_text IS NOT NULL AND num_nonnulls(title_language,title_kind,description_language,description_text,genre_slug,operation_reason,rights_basis,originality_acknowledged,rights_statement) = 0)
      OR (operation_type = 'TITLE_REMOVE' AND title_id IS NOT NULL AND operation_reason IS NOT NULL AND num_nonnulls(title_text,title_language,title_kind,description_language,description_text,genre_slug,rights_basis,originality_acknowledged,rights_statement) = 0)
      OR (operation_type IN ('DESCRIPTION_ADD','DESCRIPTION_REPLACE') AND description_language IS NOT NULL AND description_text IS NOT NULL AND rights_basis IS NOT NULL AND rights_basis = 'ORIGINAL_SUMMARY' AND originality_acknowledged IS TRUE AND rights_statement IS NOT NULL AND num_nonnulls(title_id,title_text,title_language,title_kind,genre_slug,operation_reason) = 0)
      OR (operation_type = 'DESCRIPTION_REMOVE' AND description_language IS NOT NULL AND operation_reason IS NOT NULL AND num_nonnulls(title_id,title_text,title_language,title_kind,description_text,genre_slug,rights_basis,originality_acknowledged,rights_statement) = 0)
      OR (operation_type = 'GENRE_ADD_MEMBERSHIP' AND genre_slug IS NOT NULL AND num_nonnulls(title_id,title_text,title_language,title_kind,description_language,description_text,operation_reason,rights_basis,originality_acknowledged,rights_statement) = 0)
      OR (operation_type = 'GENRE_REMOVE_MEMBERSHIP' AND genre_slug IS NOT NULL AND operation_reason IS NOT NULL AND num_nonnulls(title_id,title_text,title_language,title_kind,description_language,description_text,rights_basis,originality_acknowledged,rights_statement) = 0)
    ))`),
    ),
    ...[
      ["title_text", 500],
      ["description_text", 20000],
      ["operation_reason", 2000],
      ["citation_label", 200],
      ["citation_text", 4000],
      ["rights_statement", 2000],
    ].map(([name, max]) =>
      check(
        `metadata_edit_suggestions_${name}_bound`,
        sql.raw(
          `${name} IS NULL OR (${name} = btrim(${name}) AND char_length(${name}) BETWEEN 1 AND ${max})`,
        ),
      ),
    ),
    ...["title_language", "description_language"].map((name) =>
      check(
        `metadata_edit_suggestions_${name}_bound`,
        sql.raw(
          `${name} IS NULL OR (${name} ~ '^(und|[a-z]{2,3}(-[A-Za-z0-9]{2,8})*)$' AND char_length(${name}) <= 35)`,
        ),
      ),
    ),
    check(
      "metadata_edit_suggestions_slug_bound",
      sql.raw(
        `genre_slug IS NULL OR (genre_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(genre_slug) <= 100)`,
      ),
    ),
    check(
      "metadata_edit_suggestions_url_bound",
      sql.raw(`citation_url IS NULL OR char_length(citation_url) <= 2000`),
    ),
    check(
      "metadata_edit_suggestions_consulted_bound",
      sql.raw(
        `citation_consulted_at IS NULL OR char_length(citation_consulted_at) <= 60000`,
      ),
    ),
    check(
      "metadata_edit_suggestions_raw_bytes_bound",
      sql.raw(
        `octet_length(concat_ws('',title_id::text,title_text,title_language,title_kind::text,description_language,description_text,genre_slug,operation_reason,citation_label,citation_text,citation_url,citation_consulted_at,rights_basis,originality_acknowledged::text,rights_statement)) <= 60000`,
      ),
    ),
    index("metadata_edit_suggestions_owner_page_idx").on(
      t.ownerUserId,
      t.createdAt,
      t.id,
    ),
    index("metadata_edit_suggestions_queue_idx")
      .on(t.state, t.createdAt, t.id)
      .where(sql`${t.contentState} = 'ACTIVE'`),
    index("metadata_edit_suggestions_work_idx").on(t.workId),
  ],
);

export const metadataEditEvents = pgTable(
  "metadata_edit_events",
  {
    id: id(),
    suggestionId: uuid("suggestion_id")
      .notNull()
      .references(() => metadataEditSuggestions.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    fromState: editSuggestionState("from_state"),
    toState: editSuggestionState("to_state").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewReason: text("review_reason"),
    reasonRedacted: boolean("reason_redacted").default(false).notNull(),
    appliedWorkRevision: integer("applied_work_revision"),
    metadataReviewAcknowledged: boolean("metadata_review_acknowledged"),
    publicationReviewAcknowledged: boolean("publication_review_acknowledged"),
    rightsReviewAcknowledged: boolean("rights_review_acknowledged"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("metadata_edit_events_revision_unique").on(
      t.suggestionId,
      t.revision,
    ),
    unique("metadata_edit_events_id_suggestion_unique").on(
      t.id,
      t.suggestionId,
    ),
    check(
      "metadata_edit_events_shape_check",
      sql`((${t.revision} = 1 AND ${t.fromState} IS NULL AND ${t.toState} = 'SUBMITTED' AND ${t.reviewReason} IS NULL AND ${t.appliedWorkRevision} IS NULL AND ${t.metadataReviewAcknowledged} IS NULL AND ${t.publicationReviewAcknowledged} IS NULL AND ${t.rightsReviewAcknowledged} IS NULL) OR (${t.revision} = 2 AND ${t.fromState} IS NOT NULL AND ${t.fromState} = 'SUBMITTED' AND ${t.toState} IN ('APPROVED','REJECTED') AND ((${t.reasonRedacted} AND ${t.reviewReason} IS NULL) OR (NOT ${t.reasonRedacted} AND ${t.reviewReason} IS NOT NULL AND ${t.reviewReason} = btrim(${t.reviewReason}) AND char_length(${t.reviewReason}) BETWEEN 1 AND 2000)) AND ((${t.toState} = 'APPROVED' AND ${t.appliedWorkRevision} IS NOT NULL AND ${t.appliedWorkRevision} > 0 AND ${t.metadataReviewAcknowledged} IS TRUE AND ${t.publicationReviewAcknowledged} IS TRUE AND ${t.rightsReviewAcknowledged} IS TRUE) OR (${t.toState} = 'REJECTED' AND ${t.appliedWorkRevision} IS NULL AND ${t.metadataReviewAcknowledged} IS NULL AND ${t.publicationReviewAcknowledged} IS NULL AND ${t.rightsReviewAcknowledged} IS NULL))))`,
    ),
    index("metadata_edit_events_actor_idx").on(t.actorUserId),
  ],
);

export const catalogMetadataEvidence = pgTable(
  "catalog_metadata_evidence",
  {
    id: id(),
    suggestionId: uuid("suggestion_id").notNull(),
    workId: uuid("work_id").notNull(),
    workRevision: integer("work_revision").notNull(),
    approvalEventId: uuid("approval_event_id").notNull(),
    auditEventId: uuid("audit_event_id")
      .notNull()
      .references(() => catalogAuditEvents.id, { onDelete: "restrict" }),
    operationType: text("operation_type")
      .$type<MetadataOperationType>()
      .notNull(),
    titleId: uuid("title_id"),
    titleLanguage: text("title_language"),
    titleKind: titleKind("title_kind"),
    descriptionLanguage: text("description_language"),
    genreSlug: text("genre_slug"),
    beforePresent: boolean("before_present").notNull(),
    afterPresent: boolean("after_present").notNull(),
    beforeTitle: text("before_title"),
    afterTitle: text("after_title"),
    beforeDescription: text("before_description"),
    afterDescription: text("after_description"),
    decisionSourceId: uuid("decision_source_id")
      .notNull()
      .references(() => catalogSources.id, { onDelete: "restrict" }),
    previousSourceId: uuid("previous_source_id").references(
      () => catalogSources.id,
      { onDelete: "restrict" },
    ),
    resultingSourceId: uuid("resulting_source_id").references(
      () => catalogSources.id,
      { onDelete: "restrict" },
    ),
    rightsBasis: text("rights_basis"),
    originalityAcknowledged: boolean("originality_acknowledged"),
    rightsReviewAcknowledged: boolean("rights_review_acknowledged"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("catalog_metadata_evidence_suggestion_unique").on(t.suggestionId),
    foreignKey({
      name: "catalog_metadata_evidence_suggestion_work_fk",
      columns: [t.suggestionId, t.workId],
      foreignColumns: [
        metadataEditSuggestions.id,
        metadataEditSuggestions.workId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "catalog_metadata_evidence_approval_suggestion_fk",
      columns: [t.approvalEventId, t.suggestionId],
      foreignColumns: [metadataEditEvents.id, metadataEditEvents.suggestionId],
    }).onDelete("restrict"),
    check(
      "catalog_metadata_evidence_revision_check",
      sql`${t.workRevision} > 0`,
    ),
    check(
      "catalog_metadata_evidence_shape_check",
      sql.raw(`
    ((operation_type IN ('TITLE_ADD','TITLE_REPLACE','TITLE_REMOVE') AND title_id IS NOT NULL AND title_language IS NOT NULL AND title_kind IS NOT NULL AND num_nonnulls(description_language,genre_slug,before_description,after_description,rights_basis,originality_acknowledged,rights_review_acknowledged) = 0
      AND ((operation_type = 'TITLE_ADD' AND NOT before_present AND after_present AND before_title IS NULL AND after_title IS NOT NULL AND title_kind IN ('PRIMARY','ALIAS'))
        OR (operation_type = 'TITLE_REPLACE' AND before_present AND after_present AND before_title IS NOT NULL AND after_title IS NOT NULL AND before_title <> after_title)
        OR (operation_type = 'TITLE_REMOVE' AND before_present AND NOT after_present AND before_title IS NOT NULL AND after_title IS NULL)))
    OR (operation_type IN ('DESCRIPTION_ADD','DESCRIPTION_REPLACE','DESCRIPTION_REMOVE') AND description_language IS NOT NULL AND num_nonnulls(title_id,title_language,title_kind,genre_slug,before_title,after_title) = 0
      AND ((operation_type = 'DESCRIPTION_ADD' AND NOT before_present AND after_present AND before_description IS NULL AND after_description IS NOT NULL)
        OR (operation_type = 'DESCRIPTION_REPLACE' AND before_present AND after_present AND before_description IS NOT NULL AND after_description IS NOT NULL AND before_description <> after_description)
        OR (operation_type = 'DESCRIPTION_REMOVE' AND before_present AND NOT after_present AND before_description IS NOT NULL AND after_description IS NULL))
      AND ((operation_type = 'DESCRIPTION_REMOVE' AND num_nonnulls(rights_basis,originality_acknowledged,rights_review_acknowledged) = 0) OR (operation_type IN ('DESCRIPTION_ADD','DESCRIPTION_REPLACE') AND rights_basis IS NOT NULL AND rights_basis = 'ORIGINAL_SUMMARY' AND originality_acknowledged IS TRUE AND rights_review_acknowledged IS TRUE)))
    OR (operation_type IN ('GENRE_ADD_MEMBERSHIP','GENRE_REMOVE_MEMBERSHIP') AND genre_slug IS NOT NULL AND num_nonnulls(title_id,title_language,title_kind,description_language,before_title,after_title,before_description,after_description,rights_basis,originality_acknowledged,rights_review_acknowledged) = 0
      AND ((operation_type = 'GENRE_ADD_MEMBERSHIP' AND NOT before_present AND after_present) OR (operation_type = 'GENRE_REMOVE_MEMBERSHIP' AND before_present AND NOT after_present))))
    AND ((NOT before_present AND previous_source_id IS NULL) OR (before_present AND previous_source_id IS NOT NULL))
    AND ((NOT after_present AND resulting_source_id IS NULL) OR (after_present AND resulting_source_id IS NOT NULL AND resulting_source_id = decision_source_id))`),
    ),
    ...[
      ["before_title", 500],
      ["after_title", 500],
      ["before_description", 20000],
      ["after_description", 20000],
    ].map(([name, max]) =>
      check(
        `catalog_metadata_evidence_${name}_bound`,
        sql.raw(
          `${name} IS NULL OR (${name} = btrim(${name}) AND char_length(${name}) BETWEEN 1 AND ${max})`,
        ),
      ),
    ),
    ...["title_language", "description_language"].map((name) =>
      check(
        `catalog_metadata_evidence_${name}_bound`,
        sql.raw(
          `${name} IS NULL OR (${name} ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$' AND char_length(${name}) <= 63)`,
        ),
      ),
    ),
    check(
      "catalog_metadata_evidence_slug_bound",
      sql.raw(
        `genre_slug IS NULL OR (genre_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(genre_slug) <= 100)`,
      ),
    ),
    index("catalog_metadata_evidence_work_idx").on(t.workId, t.workRevision),
    index("catalog_metadata_evidence_decision_source_idx").on(
      t.decisionSourceId,
    ),
    index("catalog_metadata_evidence_previous_source_idx").on(
      t.previousSourceId,
    ),
    index("catalog_metadata_evidence_resulting_source_idx").on(
      t.resultingSourceId,
    ),
    index("catalog_metadata_evidence_approval_idx").on(
      t.approvalEventId,
      t.suggestionId,
    ),
    index("catalog_metadata_evidence_audit_idx").on(t.auditEventId),
  ],
);
