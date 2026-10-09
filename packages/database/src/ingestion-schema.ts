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
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { user } from "./schema";
import { works } from "./catalog-schema";
import {
  WORK_REQUEST_STATES,
  INGESTION_JOB_KINDS,
  INGESTION_JOB_STATES,
  REQUEST_FORMATS,
  type RequestFormat,
} from "./ingestion-types";

export const workRequestState = pgEnum(
  "work_request_state",
  WORK_REQUEST_STATES,
);
export const ingestionJobKind = pgEnum(
  "ingestion_job_kind",
  INGESTION_JOB_KINDS,
);
export const ingestionJobState = pgEnum(
  "ingestion_job_state",
  INGESTION_JOB_STATES,
);
const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());
const bounded = (column: AnyPgColumn, max: number): SQL =>
  sql`${column} = btrim(${column}) AND char_length(${column}) BETWEEN 1 AND ${sql.raw(String(max))}`;
const object = (column: AnyPgColumn, max = 16384): SQL =>
  sql`jsonb_typeof(${column}) = 'object' AND octet_length(${column}::text) <= ${sql.raw(String(max))}`;
const publicFormats = sql.join(
  // Compile-time allowlist literals: DDL cannot contain bind parameters.
  REQUEST_FORMATS.map((format) => sql.raw(`'${format}'`)),
  sql`, `,
);

// Private input/history survives account deletion. Only separately reviewed summaries
// belong in publicTitle/publicFormat; these fields must never be copied from raw details.
export const workRequests = pgTable(
  "work_requests",
  {
    id: id(),
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    state: workRequestState("state").default("SUBMITTED").notNull(),
    revision: integer("revision").default(1).notNull(),
    inputRevision: integer("input_revision").default(1).notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    submitKey: uuid("submit_key").notNull(),
    inputHash: text("input_hash").notNull(),
    resultingWorkId: uuid("resulting_work_id").references(() => works.id, {
      onDelete: "restrict",
    }),
    publicTitle: text("public_title"),
    publicFormat: text("public_format").$type<RequestFormat>(),
    publicSummaryVerifiedAt: timestamp("public_summary_verified_at", {
      withTimezone: true,
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("work_requests_owner_submit_unique").on(t.ownerUserId, t.submitKey),
    check(
      "work_requests_revision_check",
      sql`${t.revision} > 0 AND ${t.inputRevision} > 0`,
    ),
    check("work_requests_details_check", object(t.details)),
    check("work_requests_title_check", bounded(t.normalizedTitle, 600)),
    check(
      "work_requests_hash_check",
      sql`${t.inputHash} ~ '^[0-9a-fA-F]{64}$'`,
    ),
    check(
      "work_requests_result_check",
      sql`(${t.state} IN ('APPROVED', 'LINKED_EXISTING')) = (${t.resultingWorkId} IS NOT NULL)`,
    ),
    check(
      "work_requests_public_summary_check",
      sql`(${t.publicTitle} IS NULL AND ${t.publicFormat} IS NULL AND ${t.publicSummaryVerifiedAt} IS NULL) OR (${t.publicTitle} IS NOT NULL AND ${t.publicFormat} IS NOT NULL AND ${t.publicSummaryVerifiedAt} IS NOT NULL)`,
    ),
    check("work_requests_public_title_check", bounded(t.publicTitle, 600)),
    check(
      "work_requests_public_format_check",
      sql`${t.publicFormat} IN (${publicFormats})`,
    ),
    index("work_requests_owner_idx").on(t.ownerUserId),
    index("work_requests_state_idx").on(t.state),
    index("work_requests_normalized_title_idx").on(t.normalizedTitle),
  ],
);

// Append-only by application contract: write events with the request revision in
// the same transaction. No update/delete service is provided for private history.
export const requestEvents = pgTable(
  "request_events",
  {
    id: id(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => workRequests.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorSnapshot: text("actor_snapshot"),
    eventKind: text("event_kind").notNull(),
    revision: integer("revision").notNull(),
    fromState: workRequestState("from_state"),
    toState: workRequestState("to_state").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("request_events_request_revision_unique").on(
      t.requestId,
      t.revision,
    ),
    check("request_events_actor_check", bounded(t.actorSnapshot, 200)),
    check("request_events_kind_check", bounded(t.eventKind, 80)),
    check("request_events_revision_check", sql`${t.revision} > 0`),
    check("request_events_payload_check", object(t.payload, 32768)),
  ],
);

// Policy is non-secret review metadata, never provider credentials or tokens.
export const providerRegistry = pgTable(
  "provider_registry",
  {
    id: text("id").primaryKey(),
    policy: jsonb("policy").$type<Record<string, unknown>>().notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }),
    requestsInWindow: integer("requests_in_window").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "provider_registry_id_check",
      sql`${t.id} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(${t.id}) <= 100`,
    ),
    check("provider_registry_policy_check", object(t.policy)),
    // IS TRUE prevents SQL NULL (missing policy keys) from bypassing CHECK.
    check(
      "provider_registry_enabled_check",
      sql`NOT ${t.enabled} OR ((${t.policy}->>'reviewStatus' = 'REVIEWED' AND ${t.policy}->'metadataStorageAllowed' = 'true'::jsonb) IS TRUE)`,
    ),
    check(
      "provider_registry_window_count_check",
      sql`${t.requestsInWindow} >= 0`,
    ),
  ],
);

export const ingestionJobs = pgTable(
  "ingestion_jobs",
  {
    id: id(),
    requestId: uuid("request_id").references(() => workRequests.id, {
      onDelete: "restrict",
    }),
    providerId: text("provider_id").references(() => providerRegistry.id, {
      onDelete: "restrict",
    }),
    kind: ingestionJobKind("kind").notNull(),
    state: ingestionJobState("state").default("QUEUED").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    expectedInputRevision: integer("expected_input_revision"),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(8).notNull(),
    runAfter: timestamp("run_after", { withTimezone: true })
      .defaultNow()
      .notNull(),
    leaseToken: uuid("lease_token"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    // A sanitized stable code only; never raw provider responses or stack traces.
    lastErrorCode: text("last_error_code"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    check("ingestion_jobs_idempotency_check", bounded(t.idempotencyKey, 200)),
    check(
      "ingestion_jobs_revision_check",
      sql`(${t.expectedInputRevision} IS NULL OR ${t.expectedInputRevision} > 0) AND (${t.requestId} IS NULL OR ${t.expectedInputRevision} IS NOT NULL)`,
    ),
    check(
      "ingestion_jobs_kind_check",
      sql`(${t.kind} <> 'REQUEST_ENRICH' OR (${t.requestId} IS NOT NULL AND ${t.expectedInputRevision} IS NOT NULL)) AND (${t.kind} <> 'DISCOVER_PROVIDER' OR ${t.providerId} IS NOT NULL)`,
    ),
    check(
      "ingestion_jobs_attempts_check",
      sql`${t.attempts} BETWEEN 0 AND 8 AND ${t.maxAttempts} BETWEEN 1 AND 8 AND ${t.attempts} <= ${t.maxAttempts}`,
    ),
    check(
      "ingestion_jobs_lease_check",
      sql`(${t.state} = 'RUNNING' AND ${t.leaseToken} IS NOT NULL AND ${t.leaseOwner} IS NOT NULL AND ${t.leaseExpiresAt} IS NOT NULL) OR (${t.state} <> 'RUNNING' AND ${t.leaseToken} IS NULL AND ${t.leaseOwner} IS NULL AND ${t.leaseExpiresAt} IS NULL)`,
    ),
    check("ingestion_jobs_lease_owner_check", bounded(t.leaseOwner, 200)),
    check("ingestion_jobs_error_code_check", bounded(t.lastErrorCode, 80)),
    index("ingestion_jobs_claim_idx").on(t.state, t.runAfter),
    index("ingestion_jobs_request_idx").on(t.requestId),
    index("ingestion_jobs_provider_idx").on(t.providerId),
    index("ingestion_jobs_lease_expiry_idx").on(t.leaseExpiresAt),
  ],
);
