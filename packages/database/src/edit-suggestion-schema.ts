import { sql } from "drizzle-orm";
import { pgTable, pgEnum, uuid, text, integer, timestamp, jsonb, unique, check, index } from "drizzle-orm/pg-core";
import { user } from "./schema";
import { works } from "./catalog-schema";
export const editSuggestionState = pgEnum("edit_suggestion_state", ["SUBMITTED", "APPROVED", "REJECTED"]);
export const editSuggestions = pgTable("edit_suggestions", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
  workId: uuid("work_id").notNull().references(() => works.id, { onDelete: "restrict" }),
  baseWorkRevision: integer("base_work_revision").notNull(),
  revision: integer("revision").default(1).notNull(),
  state: editSuggestionState("state").default("SUBMITTED").notNull(),
  proposed: jsonb("proposed").$type<Record<string, unknown>>().notNull(),
  citation: jsonb("citation").$type<Record<string, unknown>>().notNull(),
  submitKey: uuid("submit_key").notNull(),
  inputHash: text("input_hash").notNull(),
  reviewReason: text("review_reason"),
  appliedWorkRevision: integer("applied_work_revision"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [
  unique("edit_suggestions_owner_submit_unique").on(t.ownerUserId, t.submitKey),
  check("edit_suggestions_revision_check", sql`${t.revision} > 0 AND ${t.baseWorkRevision} > 0`),
  check("edit_suggestions_proposed_check", sql`jsonb_typeof(${t.proposed}) = 'object' AND ${t.proposed} <> '{}'::jsonb AND octet_length(${t.proposed}::text) <= 16384`),
  check("edit_suggestions_citation_check", sql`jsonb_typeof(${t.citation}) = 'object' AND octet_length(${t.citation}::text) <= 16384`),
  check("edit_suggestions_hash_check", sql`${t.inputHash} ~ '^[0-9a-f]{64}$'`),
  check("edit_suggestions_review_check", sql`(${t.state} = 'SUBMITTED' AND ${t.reviewReason} IS NULL AND ${t.appliedWorkRevision} IS NULL) OR (${t.state} <> 'SUBMITTED' AND ${t.reviewReason} = btrim(${t.reviewReason}) AND char_length(${t.reviewReason}) BETWEEN 1 AND 2000 AND ${t.reviewReason} IS NOT NULL AND ((${t.state} = 'APPROVED' AND ${t.appliedWorkRevision} > ${t.baseWorkRevision} AND ${t.appliedWorkRevision} IS NOT NULL) OR (${t.state} = 'REJECTED' AND ${t.appliedWorkRevision} IS NULL)))`),
  index("edit_suggestions_owner_idx").on(t.ownerUserId),
  index("edit_suggestions_state_idx").on(t.state),
]);
// Append-only application history: no mutation or deletion API exists.
export const editSuggestionEvents = pgTable("edit_suggestion_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  suggestionId: uuid("suggestion_id").notNull().references(() => editSuggestions.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  actorSnapshot: text("actor_snapshot").notNull(),
  revision: integer("revision").notNull(),
  fromState: editSuggestionState("from_state"),
  toState: editSuggestionState("to_state").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [
  unique("edit_suggestion_events_revision_unique").on(t.suggestionId, t.revision),
  check("edit_suggestion_events_revision_check", sql`${t.revision} > 0`),
  check("edit_suggestion_events_actor_check", sql`char_length(${t.actorSnapshot}) BETWEEN 1 AND 200`),
  check("edit_suggestion_events_payload_check", sql`jsonb_typeof(${t.payload}) = 'object' AND octet_length(${t.payload}::text) <= 4096`),
]);
