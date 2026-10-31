import { sql, type SQL } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { genres } from "./catalog-schema";
import { user } from "./schema";
import * as C from "./reader-profile-types";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const bounded = (column: AnyPgColumn, max: number, bytes: number): SQL =>
  sql`char_length(${column}) + char_length(regexp_replace(${column}, U&'[^\\+010000-\\+10FFFF]', '', 'g')) <= ${sql.raw(String(max))} AND octet_length(${column}) <= ${sql.raw(String(bytes))}`;
// Exactly ECMAScript trim whitespace, including FEFF but excluding U+0085.
// Stored text must already be canonical; B2b uses B1 to normalize input.
const canonical = (column: AnyPgColumn): SQL =>
  sql`${column} = normalize(${column}, NFC) AND ${column} = btrim(${column}, U&'\\0009\\000A\\000B\\000C\\000D\\0020\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF')`;
// PostgreSQL TEXT already excludes NUL; never place U&'\\0000' in SQL.
const safeDisplayName = (column: AnyPgColumn): SQL =>
  sql`${column} !~ U&'[\\0001-\\001F\\007F-\\009F\\061C\\200E\\200F\\2028\\2029\\202A-\\202E\\2066-\\2069]'`;
const safeBiography = (column: AnyPgColumn): SQL =>
  sql`${column} !~ U&'[\\0001-\\0008\\000B\\000C\\000E-\\001F\\007F-\\009F\\061C\\200E\\200F\\202A-\\202E\\2066-\\2069]'`;

// Explicit enrollment only; no account backfill. Reserved handles are application policy.
// Forward 0015 custom SQL must enforce immutable userId/publicId/handle, PRIVATE
// inserts, claim-preserving direct-delete rejection (allowing root account CASCADE),
// and removal interest erasure. No rename, redirect, or post-account tombstone.
export const readerProfiles = pgTable(
  "reader_profiles",
  {
    userId: text("user_id").notNull(),
    publicId: uuid("public_id").defaultRandom().notNull(),
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    biography: text("biography"),
    visibility: text("visibility", { enum: C.READER_PROFILE_VISIBILITIES })
      .default("PRIVATE")
      .notNull(),
    state: text("state", { enum: C.READER_PROFILE_STATES })
      .default("ACTIVE")
      .notNull(),
    revision: integer("revision").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    primaryKey({ name: "reader_profiles_pkey", columns: [t.userId] }),
    foreignKey({
      name: "reader_profiles_user_fk",
      columns: [t.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    unique("reader_profiles_public_id_unique").on(t.publicId),
    unique("reader_profiles_handle_unique").on(t.handle),
    check(
      "reader_profiles_handle_check",
      sql`${t.handle} COLLATE "C" ~ '^[a-z][a-z0-9_]{2,23}$' AND ${t.handle} COLLATE "C" !~ '[^a-z0-9_]' AND char_length(${t.handle}) BETWEEN ${sql.raw(String(C.READER_PROFILE_MIN_HANDLE_LENGTH))} AND ${sql.raw(String(C.READER_PROFILE_MAX_HANDLE_LENGTH))}`,
    ),
    check(
      "reader_profiles_visibility_check",
      sql`${t.visibility} IN ('PRIVATE', 'PUBLIC')`,
    ),
    check(
      "reader_profiles_state_check",
      sql`${t.state} IN ('ACTIVE', 'REMOVED')`,
    ),
    check(
      "reader_profiles_revision_check",
      sql`${t.revision} BETWEEN 1 AND ${sql.raw(String(C.READER_PROFILE_MAX_REVISION))}`,
    ),
    check(
      "reader_profiles_display_name_check",
      sql`${t.displayName} IS NULL OR (char_length(${t.displayName}) >= 1 AND ${bounded(t.displayName, C.READER_PROFILE_MAX_DISPLAY_NAME_LENGTH, C.READER_PROFILE_MAX_DISPLAY_NAME_BYTES)} AND ${canonical(t.displayName)} AND ${safeDisplayName(t.displayName)})`,
    ),
    check(
      "reader_profiles_biography_check",
      sql`${t.biography} IS NULL OR (${bounded(t.biography, C.READER_PROFILE_MAX_BIOGRAPHY_LENGTH, C.READER_PROFILE_MAX_BIOGRAPHY_BYTES)} AND ${canonical(t.biography)} AND ${safeBiography(t.biography)})`,
    ),
    check(
      "reader_profiles_shape_check",
      sql`(${t.state} = 'ACTIVE' AND ${t.displayName} IS NOT NULL) OR (${t.state} = 'REMOVED' AND ${t.visibility} = 'PRIVATE' AND ${t.displayName} IS NULL AND ${t.biography} IS NULL)`,
    ),
  ],
);

// Forward 0015 custom SQL must guard INSERT/UPDATE with a locked ACTIVE profile
// row, serialized against profile removal; removal deletes all interest rows.
export const readerProfileInterests = pgTable(
  "reader_profile_interests",
  {
    userId: text("user_id").notNull(),
    slot: smallint("slot").notNull(),
    genreSlug: text("genre_slug").notNull(),
  },
  (t) => [
    primaryKey({
      name: "reader_profile_interests_pkey",
      columns: [t.userId, t.slot],
    }),
    foreignKey({
      name: "reader_profile_interests_profile_fk",
      columns: [t.userId],
      foreignColumns: [readerProfiles.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "reader_profile_interests_genre_fk",
      columns: [t.genreSlug],
      foreignColumns: [genres.slug],
    }).onDelete("restrict"),
    unique("reader_profile_interests_user_genre_unique").on(
      t.userId,
      t.genreSlug,
    ),
    index("reader_profile_interests_genre_idx").on(t.genreSlug, t.userId),
    check(
      "reader_profile_interests_slot_check",
      sql`${t.slot} BETWEEN 1 AND ${sql.raw(String(C.READER_PROFILE_MAX_INTERESTS))}`,
    ),
  ],
);

// Private root-account aggregates, isolated from Better Auth's shared-store pruning.
// No profile enrollment prerequisite, per-window history, or automatic TTL.
export const readerProfileRateLimits = pgTable(
  "reader_profile_rate_limits",
  {
    userId: text("user_id").notNull(),
    kind: text("kind", {
      enum: ["ordinary", "content", "withdrawal"],
    }).notNull(),
    count: integer("count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({
      name: "reader_profile_rate_limits_pkey",
      columns: [t.userId, t.kind],
    }),
    foreignKey({
      name: "reader_profile_rate_limits_user_fk",
      columns: [t.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    check(
      "reader_profile_rate_limits_kind_check",
      sql`${t.kind} IN ('ordinary', 'content', 'withdrawal')`,
    ),
    check(
      "reader_profile_rate_limits_count_check",
      sql`${t.count} >= 0 AND ${t.count} <= 21 AND (${t.kind} <> 'content' OR ${t.count} <= 6) AND (${t.kind} <> 'withdrawal' OR ${t.count} <= 11)`,
    ),
    check(
      "reader_profile_rate_limits_last_request_check",
      sql`${t.lastRequest} >= 0 AND ${t.lastRequest} <= ${sql.raw("9007199254740991")}`,
    ),
  ],
);

// Account-bound, not profile-bound: either root account deletion erases the edge.
export const readerBlocks = pgTable(
  "reader_blocks",
  {
    blockerId: text("blocker_id").notNull(),
    blockedId: text("blocked_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({
      name: "reader_blocks_pkey",
      columns: [t.blockerId, t.blockedId],
    }),
    foreignKey({
      name: "reader_blocks_blocker_fk",
      columns: [t.blockerId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "reader_blocks_blocked_fk",
      columns: [t.blockedId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    check(
      "reader_blocks_not_self_check",
      sql`${t.blockerId} <> ${t.blockedId}`,
    ),
    index("reader_blocks_reverse_idx").on(t.blockedId, t.blockerId),
  ],
);
