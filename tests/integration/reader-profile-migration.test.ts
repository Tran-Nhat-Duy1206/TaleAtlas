import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";

// Resolve the official migrator from its existing owning workspace dependency,
// not an undeclared root dependency or a new application migration API.
const { migrate } = createRequire(
  new URL("../../packages/database/package.json", import.meta.url),
)("drizzle-orm/postgres-js/migrator") as {
  migrate: (
    database: ReturnType<typeof createDatabase>["db"],
    config: { migrationsFolder: string },
  ) => Promise<void>;
};

// An owned child DATABASE on the already-approved disposable loopback cluster.
// No cluster lifecycle, external URL fallback, shared-schema teardown or FORCE.
const baseURL = requireTestDatabase();
const admin = createDatabase(baseURL).client;
const name = `reader_profile_${randomUUID().replaceAll("-", "")}_test`;
const target = new URL(baseURL);
target.pathname = `/${name}`;
const connection = createDatabase(target.toString());
const sql = connection.client;
const folder = fileURLToPath(
  new URL("../../packages/database/drizzle/", import.meta.url),
);
let created = false;
const legacyTables = [
  "users",
  "sessions",
  "accounts",
  "verifications",
  "rate_limits",
  "catalog_sources",
  "works",
  "work_titles",
  "work_descriptions",
  "editions",
  "creators",
  "work_creators",
  "genres",
  "work_genres",
  "work_covers",
  "work_identifiers",
  "work_relations",
  "catalog_field_evidence",
  "catalog_audit_events",
  "work_requests",
  "work_request_supporters",
  "request_events",
  "provider_registry",
  "ingestion_jobs",
  "ingestion_candidates",
  "edit_suggestions",
  "edit_suggestion_events",
  "catalog_releases",
  "library_entries",
  "reading_sessions",
  "library_events",
  "reading_progress_events",
  "community_mutation_receipts",
  "community_moderation_actions",
  "community_content_events",
  "community_reports",
  "community_contents",
  "metadata_edit_suggestions",
  "metadata_edit_events",
  "catalog_metadata_evidence",
] as const;
const tables = [
  "reader_profiles",
  "reader_profile_interests",
  "reader_blocks",
] as const;
const functions = [
  "reader_profile_scope_guard",
  "reader_profile_removal_interests",
  "reader_profile_interest_active_guard",
  "reader_profile_user_erasure_replan",
] as const;
const indexes = [
  "reader_blocks_pkey",
  "reader_blocks_reverse_idx",
  "reader_profile_interests_pkey",
  "reader_profile_interests_user_genre_unique",
  "reader_profile_interests_genre_idx",
  "reader_profiles_pkey",
  "reader_profiles_handle_unique",
  "reader_profiles_public_id_unique",
].sort();
const constraints = [
  "reader_blocks_pkey",
  "reader_blocks_blocker_fk",
  "reader_blocks_blocked_fk",
  "reader_blocks_not_self_check",
  "reader_profile_interests_pkey",
  "reader_profile_interests_profile_fk",
  "reader_profile_interests_genre_fk",
  "reader_profile_interests_user_genre_unique",
  "reader_profile_interests_slot_check",
  "reader_profiles_pkey",
  "reader_profiles_user_fk",
  "reader_profiles_public_id_unique",
  "reader_profiles_handle_unique",
  "reader_profiles_handle_check",
  "reader_profiles_visibility_check",
  "reader_profiles_state_check",
  "reader_profiles_revision_check",
  "reader_profiles_display_name_check",
  "reader_profiles_biography_check",
  "reader_profiles_shape_check",
].sort();

function guardedTarget() {
  const current = new URL(requireTestDatabase());
  expect(current.toString() === new URL(baseURL).toString()).toBe(true);
  expect(target.protocol).toBe(current.protocol);
  expect(target.hostname).toBe(current.hostname);
  expect(target.port).toBe(current.port);
  // Never interpolate actual connection credentials into an assertion failure.
  expect(
    target.username === current.username &&
      target.password === current.password,
  ).toBe(true);
  expect(target.pathname).toBe(`/${name}`);
  expect(name).toMatch(/^reader_profile_[0-9a-f]{32}_test$/);
  expect(target.pathname).not.toBe(current.pathname);
}

beforeAll(async () => {
  guardedTarget();
  expect(
    await admin`select datname from pg_database where datname=${name}`,
  ).toHaveLength(0);
  // Identifier is generated locally and checked above, never supplied by a caller.
  await admin.unsafe(
    `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`,
  );
  created = true;
  const [owner] =
    await admin`select pg_get_userbyid(datdba)=current_user as owned from pg_database where datname=${name}`;
  expect(owner?.owned).toBe(true);
  await migrate(connection.db, { migrationsFolder: folder });
});
afterAll(async () => {
  try {
    await sql.end();
    if (created) {
      guardedTarget();
      const [owner] =
        await admin`select pg_get_userbyid(datdba)=current_user as owned from pg_database where datname=${name}`;
      expect(owner?.owned).toBe(true);
      // No FORCE and no termination of another process/session.
      await admin.unsafe(`DROP DATABASE "${name}"`);
    }
  } finally {
    await admin.end();
  }
});

type Reader = Pick<typeof sql, "unsafe">;
async function tableNames(backend: Reader) {
  return (
    await backend.unsafe(
      "select tablename from pg_tables where schemaname='public' order by tablename",
    )
  ).map((row) => String(row.tablename));
}
async function legacyFacts(backend: Reader) {
  const columns = await backend.unsafe(
    `select c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) as default_expression
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where n.nspname='public' and c.relname=any($1::text[]) and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum`,
    [legacyTables],
  );
  const objects = await backend.unsafe(
    `select c.relname,k.oid::text as oid,k.conname,pg_get_constraintdef(k.oid) as definition
    from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=any($1::text[]) order by c.relname,k.conname`,
    [legacyTables],
  );
  const guards = await backend.unsafe(
    `select c.relname,t.tgname,t.oid::text as oid,t.tgenabled,pg_get_triggerdef(t.oid) as definition,
    p.oid::text as function_oid,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) as function_definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid
    where n.nspname='public' and c.relname=any($1::text[]) and not t.tgisinternal
      and t.tgname<>'reader_profile_user_erasure_replan' order by c.relname,t.tgname`,
    [legacyTables],
  );
  const data = [];
  for (const table of legacyTables) {
    // Hardcoded reviewed identifiers only; preserve private values by digest.
    const [row] = await backend.unsafe(
      `select count(*)::int as count,md5(coalesce(string_agg(row_to_json(t)::text,'|' order by row_to_json(t)::text),'')) as digest from public.${table} t`,
    );
    data.push({ table, ...row });
  }
  return { columns, objects, guards, data };
}

describe("reader-profile forward migration and exact integrity inventory", () => {
  it("migrates a fresh owned database through 0016 and repeats without journal/data changes", async () => {
    guardedTarget();
    expect(await tableNames(sql)).toEqual([...legacyTables, ...tables].sort());
    expect(await tableNames(sql)).toHaveLength(43);
    const before =
      await sql`select hash,created_at from drizzle.__drizzle_migrations order by id`;
    expect(before).toHaveLength(17);
    const journal = JSON.parse(
      await readFile(
        new URL(
          "../../packages/database/drizzle/meta/_journal.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(journal.entries).toHaveLength(17);
    expect(journal.entries[16]).toMatchObject({
      idx: 16,
      tag: "0016_reader_profile_rate_limit_erasure",
      breakpoints: true,
    });
    expect(journal.entries[15]).toMatchObject({
      idx: 15,
      tag: "0015_reader_profiles",
      breakpoints: true,
    });
    const [encoding] =
      await sql`select current_setting('server_encoding') as encoding,current_setting('statement_timeout') as timeout`;
    expect(encoding).toEqual({ encoding: "UTF8", timeout: "5s" });
    await migrate(connection.db, { migrationsFolder: folder });
    expect(
      await sql`select hash,created_at from drizzle.__drizzle_migrations order by id`,
    ).toEqual(before);
    expect(await tableNames(sql)).toEqual([...legacyTables, ...tables].sort());
  });

  it("has exactly the reviewed columns, keys, checks, FK actions, indexes and invoker guards", async () => {
    guardedTarget();
    const columns =
      await sql`select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name=any(${tables}::text[]) order by table_name,ordinal_position`;
    expect(
      columns.map(
        (row) =>
          `${row.table_name}.${row.column_name}:${row.data_type}:${row.is_nullable}`,
      ),
    ).toEqual([
      "reader_blocks.blocker_id:text:NO",
      "reader_blocks.blocked_id:text:NO",
      "reader_blocks.created_at:timestamp with time zone:NO",
      "reader_profile_interests.user_id:text:NO",
      "reader_profile_interests.slot:smallint:NO",
      "reader_profile_interests.genre_slug:text:NO",
      "reader_profiles.user_id:text:NO",
      "reader_profiles.public_id:uuid:NO",
      "reader_profiles.handle:text:NO",
      "reader_profiles.display_name:text:YES",
      "reader_profiles.biography:text:YES",
      "reader_profiles.visibility:text:NO",
      "reader_profiles.state:text:NO",
      "reader_profiles.revision:integer:NO",
      "reader_profiles.created_at:timestamp with time zone:NO",
      "reader_profiles.updated_at:timestamp with time zone:NO",
    ]);
    expect(
      columns.find((row) => row.column_name === "public_id")?.column_default,
    ).toBe("gen_random_uuid()");
    expect(
      columns.find((row) => row.column_name === "visibility")?.column_default,
    ).toBe("'PRIVATE'::text");
    const keys =
      await sql`select k.conname,k.contype,k.convalidated,k.condeferrable,k.confdeltype,k.confupdtype,f.relname as target,pg_get_constraintdef(k.oid) as definition
      from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace left join pg_class f on f.oid=k.confrelid
      where n.nspname='public' and c.relname=any(${tables}::text[]) order by k.conname`;
    expect(keys.map((row) => row.conname)).toEqual(constraints);
    expect(keys.every((row) => row.convalidated && !row.condeferrable)).toBe(
      true,
    );
    expect(keys.filter((row) => row.contype === "p")).toHaveLength(3);
    expect(keys.filter((row) => row.contype === "u")).toHaveLength(3);
    expect(keys.filter((row) => row.contype === "c")).toHaveLength(9);
    expect(
      keys
        .filter((row) => row.contype === "f")
        .map((row) => ({
          name: row.conname,
          target: row.target,
          delete: row.confdeltype,
          update: row.confupdtype,
        })),
    ).toEqual([
      {
        name: "reader_blocks_blocked_fk",
        target: "users",
        delete: "c",
        update: "a",
      },
      {
        name: "reader_blocks_blocker_fk",
        target: "users",
        delete: "c",
        update: "a",
      },
      {
        name: "reader_profile_interests_genre_fk",
        target: "genres",
        delete: "r",
        update: "a",
      },
      {
        name: "reader_profile_interests_profile_fk",
        target: "reader_profiles",
        delete: "c",
        update: "a",
      },
      {
        name: "reader_profiles_user_fk",
        target: "users",
        delete: "c",
        update: "a",
      },
    ]);
    const actualIndexes =
      await sql`select i.indexrelid::regclass::text as name,i.indisvalid,i.indisready from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any(${tables}::text[]) order by name`;
    expect(actualIndexes.map((row) => row.name)).toEqual(indexes);
    expect(actualIndexes.every((row) => row.indisvalid && row.indisready)).toBe(
      true,
    );
    const guards =
      await sql`select t.tgname,t.tgenabled,p.proname,p.prosecdef,p.proconfig from pg_trigger t join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(${functions}::text[]) order by t.tgname`;
    expect(guards.map((row) => row.tgname)).toEqual([
      "reader_profile_interests_active_guard",
      "reader_profile_user_erasure_replan",
      "reader_profiles_removal_interests",
      "reader_profiles_scope_guard",
    ]);
    expect(guards.every((row) => row.tgenabled === "O" && !row.prosecdef)).toBe(
      true,
    );
    expect(
      guards.every(
        (row) =>
          JSON.stringify(row.proconfig) ===
          JSON.stringify(["search_path=pg_catalog, public"]),
      ),
    ).toBe(true);
    expect(
      (
        await sql`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname=any(${functions}::text[]) order by proname`
      ).map((row) => row.proname),
    ).toEqual([...functions].sort());
  });

  it("reapplies only 0015 over populated legacy data without backfill or legacy changes, then rolls DDL back", async () => {
    guardedTarget();
    const owner = `OpaqueMigrationOwner:${randomUUID()}`;
    await sql`insert into users(id,name,email) values(${owner},'Synthetic migration reader',${`${randomUUID()}@example.invalid`})`;
    expect(
      await sql`select user_id from reader_profiles where user_id=${owner}`,
    ).toHaveLength(0);
    const legacy = await legacyFacts(sql);
    const beforeJournal =
      await sql`select hash,created_at from drizzle.__drizzle_migrations order by id`;
    const ddl = await readFile(
      new URL(
        "../../packages/database/drizzle/0015_reader_profiles.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const backend = await sql.reserve();
    let transaction = false;
    try {
      await backend.unsafe("BEGIN");
      transaction = true;
      await backend.unsafe(
        "DROP TRIGGER reader_profile_user_erasure_replan ON public.users",
      );
      for (const table of [
        "reader_profile_interests",
        "reader_blocks",
        "reader_profiles",
      ])
        await backend.unsafe(`DROP TABLE public.${table}`);
      for (const fn of functions)
        await backend.unsafe(`DROP FUNCTION public.${fn}()`);
      expect(await tableNames(backend)).toEqual([...legacyTables].sort());
      expect(await legacyFacts(backend)).toEqual(legacy);
      for (const statement of ddl
        .split("--> statement-breakpoint")
        .map((part) => part.trim())
        .filter(Boolean))
        await backend.unsafe(statement);
      expect(await tableNames(backend)).toEqual(
        [...legacyTables, ...tables].sort(),
      );
      expect(await legacyFacts(backend)).toEqual(legacy);
      expect(
        await backend.unsafe("select user_id from public.reader_profiles"),
      ).toHaveLength(0);
      await backend.unsafe("ROLLBACK");
      transaction = false;
      expect(await legacyFacts(backend)).toEqual(legacy);
      expect(
        await backend.unsafe(
          "select hash,created_at from drizzle.__drizzle_migrations order by id",
        ),
      ).toEqual(beforeJournal);
      expect(await tableNames(backend)).toEqual(
        [...legacyTables, ...tables].sort(),
      );
    } finally {
      if (transaction) await backend.unsafe("ROLLBACK");
      backend.release();
      // Root deletion is the sole cleanup of this owned account; no claim purge.
      await sql`delete from users where id=${owner}`;
    }
  });
});
