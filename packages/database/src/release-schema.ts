import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  date,
  timestamp,
  integer,
  check,
  index,
} from "drizzle-orm/pg-core";
import { works, catalogSources } from "./catalog-schema";
import { user } from "./schema";

// Exact, human-verified release facts only. A year/status is not a release day.
export const catalogReleases = pgTable(
  "catalog_releases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workId: uuid("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "restrict" }),
    releaseDate: date("release_date", { mode: "string" }).notNull(),
    language: text("language").notNull(),
    label: text("label").notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => catalogSources.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorSnapshot: text("actor_snapshot").notNull(),
    reviewedWorkRevision: integer("reviewed_work_revision").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "catalog_releases_language_check",
      sql`${t.language} ~ '^(und|[a-z]{2,3}(-[A-Za-z0-9]{2,8})*)$' AND char_length(${t.language}) <= 35`,
    ),
    check(
      "catalog_releases_label_check",
      sql`${t.label} = btrim(${t.label}) AND char_length(${t.label}) BETWEEN 1 AND 300`,
    ),
    check(
      "catalog_releases_revision_check",
      sql`${t.reviewedWorkRevision} > 0`,
    ),
    check(
      "catalog_releases_actor_check",
      sql`char_length(${t.actorSnapshot}) BETWEEN 1 AND 500`,
    ),
    check(
      "catalog_releases_date_check",
      sql`${t.releaseDate} BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'`,
    ),
    index("catalog_releases_date_idx").on(t.releaseDate, t.id),
    index("catalog_releases_work_idx").on(t.workId),
  ],
);
