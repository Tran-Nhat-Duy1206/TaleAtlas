import { sql, type SQL } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  unique,
  uniqueIndex,
  primaryKey,
  foreignKey,
  check,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { user } from "./schema";
import {
  WORK_FORMATS,
  WORK_VISIBILITIES,
  RELEASE_STATUSES,
  CREATOR_ROLES,
  TITLE_KINDS,
  COVER_RIGHTS,
  RELATION_TYPES,
  AUDIT_OPERATIONS,
} from "./catalog-types";

export const workFormat = pgEnum("work_format", WORK_FORMATS);
export const workVisibility = pgEnum("work_visibility", WORK_VISIBILITIES);
export const releaseStatus = pgEnum("release_status", RELEASE_STATUSES);
export const creatorRole = pgEnum("creator_role", CREATOR_ROLES);
export const titleKind = pgEnum("title_kind", TITLE_KINDS);
export const coverRights = pgEnum("cover_rights", COVER_RIGHTS);
export const relationType = pgEnum("relation_type", RELATION_TYPES);
export const auditOperation = pgEnum(
  "catalog_audit_operation",
  AUDIT_OPERATIONS,
);
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const bounded = (column: AnyPgColumn, max: number): SQL =>
  sql`${column} = btrim(${column}) AND char_length(${column}) BETWEEN 1 AND ${sql.raw(String(max))}`;
const language = (column: AnyPgColumn): SQL =>
  sql`${column} ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$' AND char_length(${column}) <= 63`;
const year = (column: AnyPgColumn): SQL => sql`${column} BETWEEN 1 AND 9999`;
const https = (column: AnyPgColumn): SQL =>
  sql`${column} ~ '^https://[^[:space:]]+$' AND char_length(${column}) <= 2048`;
const sourceId = () =>
  uuid("source_id")
    .notNull()
    .references(() => catalogSources.id, { onDelete: "restrict" });
const workId = () =>
  uuid("work_id")
    .notNull()
    .references(() => works.id, { onDelete: "restrict" });

export const catalogSources = pgTable(
  "catalog_sources",
  {
    id: id(),
    label: text("label").notNull(),
    citation: text("citation").notNull(),
    url: text("url"),
    consultedAt: timestamp("consulted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("catalog_sources_label_check", bounded(t.label, 200)),
    check("catalog_sources_citation_check", bounded(t.citation, 4000)),
    check("catalog_sources_url_check", https(t.url)),
  ],
);

// Publication is authorized by the trusted-admin review service, not by enum membership.
// searchText is the service's authoritative Unicode-normalized aggregate (no unaccent dependency).
export const works = pgTable(
  "works",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    primaryTitle: text("primary_title").notNull(),
    primaryTitleLanguage: text("primary_title_language")
      .default("und")
      .notNull(),
    format: workFormat("format").notNull(),
    visibility: workVisibility("visibility").default("DRAFT").notNull(),
    releaseStatus: releaseStatus("release_status").default("UNKNOWN").notNull(),
    originalLanguage: text("original_language"),
    country: text("country"),
    publicationYear: integer("publication_year"),
    publicationLabel: text("publication_label"),
    sourceId: sourceId(),
    revision: integer("revision").default(1).notNull(),
    searchText: text("search_text").notNull(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('simple'::regconfig, "search_text")`,
    ),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      "works_slug_check",
      sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(${t.slug}) <= 160`,
    ),
    check("works_title_check", bounded(t.primaryTitle, 500)),
    check("works_title_language_check", language(t.primaryTitleLanguage)),
    check("works_original_language_check", language(t.originalLanguage)),
    check("works_country_check", bounded(t.country, 100)),
    check("works_year_check", year(t.publicationYear)),
    check("works_publication_label_check", bounded(t.publicationLabel, 200)),
    check("works_revision_check", sql`${t.revision} > 0`),
    check("works_search_text_check", bounded(t.searchText, 100000)),
    index("works_source_idx").on(t.sourceId),
    index("works_search_vector_idx").using("gin", t.searchVector),
    index("works_search_trigram_idx").using(
      "gin",
      t.searchText.op("gin_trgm_ops"),
    ),
    index("works_visibility_idx").on(t.visibility),
  ],
);

export const workTitles = pgTable(
  "work_titles",
  {
    id: id(),
    workId: workId(),
    title: text("title").notNull(),
    language: text("language").default("und").notNull(),
    kind: titleKind("kind").notNull(),
    normalized: text("normalized").notNull(),
    sourceId: sourceId(),
  },
  (t) => [
    check("work_titles_title_check", bounded(t.title, 500)),
    check("work_titles_language_check", language(t.language)),
    check("work_titles_normalized_check", bounded(t.normalized, 1000)),
    uniqueIndex("work_titles_primary_language_unique")
      .on(t.workId, t.language)
      .where(sql`${t.kind} = 'PRIMARY'`),
    uniqueIndex("work_titles_original_unique")
      .on(t.workId)
      .where(sql`${t.kind} = 'ORIGINAL'`),
    index("work_titles_work_idx").on(t.workId),
    index("work_titles_source_idx").on(t.sourceId),
  ],
);
export const workDescriptions = pgTable(
  "work_descriptions",
  {
    workId: workId(),
    language: text("language").notNull(),
    text: text("text").notNull(),
    sourceId: sourceId(),
  },
  (t) => [
    primaryKey({ columns: [t.workId, t.language] }),
    check("work_descriptions_language_check", language(t.language)),
    check("work_descriptions_text_check", bounded(t.text, 20000)),
    index("work_descriptions_source_idx").on(t.sourceId),
  ],
);
export const editions = pgTable(
  "editions",
  {
    id: id(),
    workId: workId(),
    language: text("language"),
    title: text("title"),
    publisher: text("publisher"),
    format: text("format"),
    publicationYear: integer("publication_year"),
    publicationLabel: text("publication_label"),
    isbn: text("isbn"),
    sourceId: sourceId(),
  },
  (t) => [
    unique("editions_id_work_unique").on(t.id, t.workId),
    check("editions_language_check", language(t.language)),
    check("editions_title_check", bounded(t.title, 500)),
    check("editions_format_check", bounded(t.format, 200)),
    check("editions_publisher_check", bounded(t.publisher, 300)),
    check("editions_year_check", year(t.publicationYear)),
    check("editions_label_check", bounded(t.publicationLabel, 200)),
    check(
      "editions_isbn_check",
      sql`${t.isbn} ~ '^([0-9]{9}[0-9X]|[0-9]{13})$'`,
    ),
    index("editions_work_idx").on(t.workId),
    index("editions_source_idx").on(t.sourceId),
  ],
);
export const creators = pgTable(
  "creators",
  { id: id(), name: text("name").notNull() },
  (t) => [check("creators_name_check", bounded(t.name, 300))],
);
export const workCreators = pgTable(
  "work_creators",
  {
    id: id(),
    workId: workId(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "restrict" }),
    role: creatorRole("role").notNull(),
    editionId: uuid("edition_id"),
    displayOrder: integer("display_order").default(0).notNull(),
    sourceId: sourceId(),
  },
  (t) => [
    foreignKey({
      columns: [t.editionId, t.workId],
      foreignColumns: [editions.id, editions.workId],
      name: "work_creators_edition_work_fk",
    }).onDelete("restrict"),
    unique("work_creators_credit_unique")
      .on(t.workId, t.creatorId, t.role, t.editionId)
      .nullsNotDistinct(),
    check("work_creators_order_check", sql`${t.displayOrder} >= 0`),
    index("work_creators_work_idx").on(t.workId),
    index("work_creators_creator_idx").on(t.creatorId),
    index("work_creators_edition_work_idx").on(t.editionId, t.workId),
    index("work_creators_source_idx").on(t.sourceId),
  ],
);
export const genres = pgTable(
  "genres",
  {
    slug: text("slug").primaryKey(),
    nameEn: text("name_en").notNull(),
    nameVi: text("name_vi").notNull(),
  },
  (t) => [
    check(
      "genres_slug_check",
      sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(${t.slug}) <= 100`,
    ),
    check("genres_name_en_check", bounded(t.nameEn, 200)),
    check("genres_name_vi_check", bounded(t.nameVi, 200)),
  ],
);
export const workGenres = pgTable(
  "work_genres",
  {
    workId: workId(),
    genreSlug: text("genre_slug")
      .notNull()
      .references(() => genres.slug, { onDelete: "restrict" }),
    sourceId: sourceId(),
  },
  (t) => [
    primaryKey({ columns: [t.workId, t.genreSlug] }),
    index("work_genres_genre_idx").on(t.genreSlug),
    index("work_genres_source_idx").on(t.sourceId),
  ],
);
export const workCovers = pgTable(
  "work_covers",
  {
    workId: workId().primaryKey(),
    assetPath: text("asset_path"),
    rights: coverRights("rights").default("UNKNOWN").notNull(),
    credit: text("credit"),
    rightsStatement: text("rights_statement"),
    licenseUrl: text("license_url"),
    sourceId: sourceId(),
  },
  (t) => [
    check(
      "work_covers_path_check",
      sql`${t.assetPath} ~ '^/covers/[A-Za-z0-9_-]+([/][A-Za-z0-9_-]+)*[.](avif|webp|png|jpg|jpeg)$' AND char_length(${t.assetPath}) <= 500`,
    ),
    check("work_covers_credit_check", bounded(t.credit, 500)),
    check("work_covers_statement_check", bounded(t.rightsStatement, 2000)),
    check("work_covers_license_check", https(t.licenseUrl)),
    check(
      "work_covers_approved_check",
      sql`${t.rights} = 'UNKNOWN' OR (${t.assetPath} IS NOT NULL AND ${t.rightsStatement} IS NOT NULL AND ${t.credit} IS NOT NULL)`,
    ),
    index("work_covers_source_idx").on(t.sourceId),
  ],
);
export const workIdentifiers = pgTable(
  "work_identifiers",
  {
    id: id(),
    workId: workId(),
    namespace: text("namespace").notNull(),
    value: text("value").notNull(),
    sourceId: sourceId(),
  },
  (t) => [
    unique("work_identifiers_namespace_value_unique").on(t.namespace, t.value),
    check("work_identifiers_namespace_check", bounded(t.namespace, 100)),
    check("work_identifiers_value_check", bounded(t.value, 500)),
    index("work_identifiers_work_idx").on(t.workId),
    index("work_identifiers_source_idx").on(t.sourceId),
  ],
);
export const workRelations = pgTable(
  "work_relations",
  {
    fromWorkId: uuid("from_work_id")
      .notNull()
      .references(() => works.id, { onDelete: "restrict" }),
    toWorkId: uuid("to_work_id")
      .notNull()
      .references(() => works.id, { onDelete: "restrict" }),
    type: relationType("type").notNull(),
    sourceId: sourceId(),
  },
  (t) => [
    primaryKey({ columns: [t.fromWorkId, t.toWorkId, t.type] }),
    check(
      "work_relations_not_self_check",
      sql`${t.fromWorkId} <> ${t.toWorkId}`,
    ),
    index("work_relations_to_idx").on(t.toWorkId),
    index("work_relations_source_idx").on(t.sourceId),
  ],
);
// Append-only field assertions for compound metadata: row source_id means the
// latest record amendment, not blanket evidence for every unchanged scalar.
// Join revision to audit for the server-owned actor/decision; null is a removal.
export const catalogFieldEvidence = pgTable(
  "catalog_field_evidence",
  {
    id: id(),
    workId: workId(),
    fieldPath: text("field_path").notNull(),
    revision: integer("revision").notNull(),
    value: jsonb("value").$type<string | number | null>().notNull(),
    sourceId: sourceId(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("catalog_field_evidence_revision_unique").on(
      t.workId,
      t.fieldPath,
      t.revision,
    ),
    check(
      "catalog_field_evidence_path_check",
      sql`${t.fieldPath} ~ '^(work[.]([A-Za-z]+)|edition[.][0-9a-f-]{36}[.]([A-Za-z]+)|cover[.]([A-Za-z]+))$' AND char_length(${t.fieldPath}) <= 100`,
    ),
    check("catalog_field_evidence_revision_check", sql`${t.revision} > 0`),
    check(
      "catalog_field_evidence_value_check",
      sql`jsonb_typeof(${t.value}) IN ('string', 'number', 'null') AND octet_length(${t.value}::text) <= 8192`,
    ),
    index("catalog_field_evidence_work_idx").on(t.workId, t.revision),
    index("catalog_field_evidence_source_idx").on(t.sourceId),
  ],
);

// Audit records retain work identity; the catalog hides works rather than deleting them.
export const catalogAuditEvents = pgTable(
  "catalog_audit_events",
  {
    id: id(),
    workId: workId(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorIdSnapshot: text("actor_id_snapshot").notNull(),
    operation: auditOperation("operation").notNull(),
    previousRevision: integer("previous_revision"),
    newRevision: integer("new_revision").notNull(),
    changes: jsonb("changes").$type<Record<string, unknown>>().notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("catalog_audit_actor_check", bounded(t.actorIdSnapshot, 200)),
    check(
      "catalog_audit_revisions_check",
      sql`${t.newRevision} > 0 AND (${t.previousRevision} IS NULL OR (${t.previousRevision} > 0 AND ${t.newRevision} > ${t.previousRevision}))`,
    ),
    check(
      "catalog_audit_changes_check",
      sql`jsonb_typeof(${t.changes}) = 'object' AND octet_length(${t.changes}::text) <= 65536 AND (${t.changes} - ARRAY['primaryTitle','primaryTitleLanguage','format','visibility','releaseStatus','originalLanguage','country','publicationYear','publicationLabel','sourceId','titles','descriptions','editions','creators','genres','cover','identifiers','relations','publicationReviewAcknowledged']::text[]) = '{}'::jsonb`,
    ),
    index("catalog_audit_work_idx").on(t.workId),
    index("catalog_audit_actor_idx").on(t.actorUserId),
  ],
);
