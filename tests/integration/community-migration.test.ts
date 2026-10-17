import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readingAuthFixture } from "../helpers/reading-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import { createWork } from "../../apps/web/src/server/catalog/service";
import {
  addLibraryEntry,
  updateLibraryEntry,
  readingSessionAction,
  recordReadingProgress,
} from "../../apps/web/src/server/library/service";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";

// Forward SQL over genuinely populated legacy tables, NOT a fresh migration-CLI
// or journal acceptance claim. Serial execution on a guarded disposable DB only.
const f = readingAuthFixture();
const sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
type Reader = Pick<typeof sql, "unsafe">;
let admin: Actor, owner: Actor;
const workIds: string[] = [];
const headers = (actor: Actor) =>
  new Headers({
    Origin: f.origin,
    Cookie: actor.cookie,
    "x-real-ip": actor.id === admin.id ? "127.58.1.1" : "127.58.1.2",
  });
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
] as const;
// Dependency order, deliberately no CASCADE and no legacy object names.
const v4Tables = [
  "community_mutation_receipts",
  "community_moderation_actions",
  "community_content_events",
  "community_reports",
  "community_contents",
] as const;
// Approved additive 0014 objects remain present during this V4-only DDL exercise.
const v5bTables = [
  "metadata_edit_suggestions",
  "metadata_edit_events",
  "catalog_metadata_evidence",
] as const;
const v4Functions = [
  "community_user_erasure_budgets",
  "community_content_scope_and_erasure",
  "community_report_erasure_redact_actions",
  "community_erased_target_evidence",
] as const;
const v4Enums = [
  "community_author_state",
  "community_command_kind",
  "community_content_kind",
  "community_moderation_action_kind",
  "community_moderation_state",
  "community_mutation_outcome",
  "community_report_reason",
  "community_report_state",
] as const;
const v4Triggers = [
  "community_user_erasure_budgets",
  "community_content_scope_and_erasure",
  "community_report_erasure_redact_actions",
  "community_reports_erased_target_evidence",
  "community_actions_erased_target_evidence",
] as const;

async function tableNames(backend: Reader) {
  return (
    await backend.unsafe(
      "select tablename from pg_catalog.pg_tables where schemaname='public' order by tablename",
    )
  ).map((row) => String(row.tablename));
}
async function settings(backend: Reader) {
  return (
    await backend.unsafe(`select pg_backend_pid() as pid,
    current_setting('statement_timeout') as statement_timeout,
    current_setting('plan_cache_mode') as plan_cache_mode,
    current_setting('enable_bitmapscan') as enable_bitmapscan,
    current_setting('enable_indexscan') as enable_indexscan,
    current_setting('enable_seqscan') as enable_seqscan,
    current_setting('jit') as jit`)
  )[0];
}
async function libraryGuard(backend: Reader) {
  return (
    await backend.unsafe(`select p.oid::text as function_oid, p.prosecdef, p.proconfig,
    pg_get_functiondef(p.oid) as function_definition,
    t.oid::text as trigger_oid, t.tgenabled, pg_get_triggerdef(t.oid) as trigger_definition,
    i.indexrelid::text as index_oid, i.indisvalid, i.indisready,
    pg_get_indexdef(i.indexrelid) as index_definition
    from pg_catalog.pg_proc p
    join pg_catalog.pg_trigger t on t.tgfoid=p.oid
    join pg_catalog.pg_index i on i.indexrelid=to_regclass('public.library_events_entry_scope_idx')
    where p.oid=to_regprocedure('public.library_user_erasure_replan()')
      and t.tgname='library_user_erasure_replan'
      and t.tgrelid='public.users'::regclass and not t.tgisinternal
      and i.indrelid='public.library_events'::regclass`)
  )[0];
}
async function legacyFacts(backend: Reader, workId: string) {
  requireTestDatabase();
  const actors = [admin.id, owner.id];
  expect(actors.every((id) => f.users.some((user) => user.id === id))).toBe(
    true,
  );
  expect(workIds).toContain(workId);
  const scopes = {
    users: ["id=any($1::text[])", actors],
    accounts: ["user_id=any($1::text[])", actors],
    sessions: ["user_id=any($1::text[])", actors],
    works: ["id=$1::uuid", workId],
    catalog_sources: ["label=$1::text", f.sourceLabel],
    work_titles: ["work_id=$1::uuid", workId],
    catalog_field_evidence: ["work_id=$1::uuid", workId],
    catalog_audit_events: ["work_id=$1::uuid", workId],
    library_entries: ["user_id=any($1::text[])", actors],
    library_events: ["user_id=any($1::text[])", actors],
    reading_sessions: ["user_id=any($1::text[])", actors],
    reading_progress_events: ["user_id=any($1::text[])", actors],
  } as const;
  const result: Record<string, { count: number; digest: string | null }> = {};
  for (const [table, [predicate, value]] of Object.entries(scopes)) {
    const [row] = await backend.unsafe<
      { count: number; digest: string | null }[]
    >(
      `select count(*)::int as count, md5(string_agg(row_to_json(t)::text,'|' order by id)) as digest from public.${table} t where ${predicate}`,
      [value],
    );
    result[table] = row;
  }
  return result;
}
async function prototypeFacts(backend: Reader) {
  const objects = [
    ...(await backend.unsafe(
      `select c.relname as name,c.oid::text as oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) order by name`,
      [v4Tables],
    )),
  ];
  const enums = [
    ...(await backend.unsafe(
      `select t.typname as name,t.oid::text as oid from pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname=any($1::text[]) order by name`,
      [v4Enums],
    )),
  ];
  const functions = [
    ...(await backend.unsafe(
      `select p.proname as name,p.oid::text as oid,pg_get_functiondef(p.oid) as definition from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1::text[]) order by name`,
      [v4Functions],
    )),
  ];
  const triggers = [
    ...(await backend.unsafe(
      `select t.tgname as name,t.oid::text as oid,t.tgenabled,pg_get_triggerdef(t.oid) as definition from pg_catalog.pg_trigger t where not t.tgisinternal and t.tgname=any($1::text[]) order by name`,
      [v4Triggers],
    )),
  ];
  const data: Record<string, unknown> = {};
  for (const table of v4Tables)
    data[table] = (
      await backend.unsafe(
        `select count(*)::int as count,md5(string_agg(row_to_json(t)::text,'|' order by id)) as digest from public.${table} t`,
      )
    )[0];
  return { objects, enums, functions, triggers, data };
}

async function v5bFacts(backend: Reader) {
  // Return schema definitions and server-side row digests, never private payloads.
  const objects = [
    ...(await backend.unsafe(
      `select c.relname as name,c.oid::text as oid,c.reltype::text as row_type_oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) order by name`,
      [v5bTables],
    )),
  ];
  const columns = [
    ...(await backend.unsafe(
      `select c.relname as table_name,a.attnum,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod) as type,a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) as default_expression from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname='public' and c.relname=any($1::text[]) and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum`,
      [v5bTables],
    )),
  ];
  const constraints = [
    ...(await backend.unsafe(
      `select c.relname as table_name,k.conname,k.oid::text as oid,k.contype,k.convalidated,pg_get_constraintdef(k.oid) as definition from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) order by c.relname,k.conname`,
      [v5bTables],
    )),
  ];
  const indexes = [
    ...(await backend.unsafe(
      `select c.relname as table_name,i.indexrelid::text as oid,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) as definition from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) order by c.relname,i.indexrelid`,
      [v5bTables],
    )),
  ];
  const guards = [
    ...(await backend.unsafe(
      `select c.relname as table_name,t.tgname,t.oid::text as trigger_oid,t.tgenabled,t.tgdeferrable,t.tginitdeferred,pg_get_triggerdef(t.oid) as trigger_definition,p.oid::text as function_oid,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) as function_definition from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace join pg_catalog.pg_proc p on p.oid=t.tgfoid where n.nspname='public' and c.relname=any($1::text[]) and not t.tgisinternal order by c.relname,t.tgname`,
      [v5bTables],
    )),
  ];
  const data: Record<string, unknown> = {};
  for (const table of v5bTables)
    data[table] = (
      await backend.unsafe(
        `select count(*)::int as count,md5(string_agg(row_to_json(t)::text,'|' order by id)) as digest from public.${table} t`,
      )
    )[0];
  return { objects, columns, constraints, indexes, guards, data };
}

beforeAll(async () => {
  requireTestDatabase();
  await f.start();
  admin = await f.account("admin");
  owner = await f.account("user");
});
afterAll(async () => {
  requireTestDatabase();
  try {
    await sql`delete from community_contents where work_id=any(${workIds}::uuid[])`;
    await sql`delete from library_entries where user_id=any(${f.users.map((user) => user.id)}::text[])`;
    // Frozen catalog evidence/audit retention: clean only this UUID run's rows.
    for (const table of [
      "catalog_field_evidence",
      "catalog_audit_events",
      "work_creators",
      "work_titles",
      "work_descriptions",
      "work_genres",
      "work_covers",
      "work_identifiers",
      "editions",
    ])
      await sql`delete from ${sql(table)} where work_id=any(${workIds}::uuid[])`;
    await sql`delete from work_relations where from_work_id=any(${workIds}::uuid[]) or to_work_id=any(${workIds}::uuid[])`;
    await sql`delete from works where id=any(${workIds}::uuid[])`;
    await sql`delete from catalog_sources where label=${f.sourceLabel}`;
  } finally {
    await f.stop();
  }
});

describe("V4A populated legacy forward-DDL preservation", () => {
  it("reapplies reviewed 0010/0011 over 32 populated legacy tables without touching frozen guards/data and rolls back prototype DDL/data", async () => {
    requireTestDatabase();
    const work = (await createWork(
      {
        primaryTitle: `Forward-DDL synthetic ${f.runId}`,
        primaryTitleLanguage: "en",
        format: "NOVEL",
        visibility: "PUBLISHED",
        publicationReviewAcknowledged: true,
        releaseStatus: "UNKNOWN",
        titles: [
          {
            title: `Invented legacy alias ${f.runId}`,
            language: "en",
            kind: "ALIAS",
          },
        ],
        descriptions: [
          {
            language: "en",
            text: "Invented cited legacy catalog assertion for migration preservation.",
          },
        ],
        source: {
          label: f.sourceLabel,
          citation:
            "UUID-owned invented forward migration preservation fixture.",
        },
      },
      headers(admin),
    )) as AdminWork;
    workIds.push(work.id);
    let entry = await addLibraryEntry(
      { workId: work.id, mutationKey: randomUUID() },
      headers(owner),
    );
    entry = await updateLibraryEntry(
      entry.id,
      {
        revision: entry.revision,
        mutationKey: randomUUID(),
        patch: { notes: `PRIVATE_FORWARD_DDL_${f.runId}`, ratingHalfStars: 8 },
      },
      headers(owner),
    );
    entry = await readingSessionAction(
      entry.id,
      {
        revision: entry.revision,
        mutationKey: randomUUID(),
        action: "START_READ",
      },
      headers(owner),
    );
    entry = await recordReadingProgress(
      entry.id,
      {
        revision: entry.revision,
        mutationKey: randomUUID(),
        sessionId: entry.currentSession!.id,
        patch: { chapterNumber: 7 },
      },
      headers(owner),
    );
    // A scoped typed SQL witness proves rollback restores actual V4 rows, without
    // enabling the community gate or calling an application service during DDL.
    const witnessId = randomUUID();
    await sql`insert into community_contents(id,work_id,kind,author_id,title,body) values(${witnessId},${work.id},'THREAD',${owner.id},'Synthetic rollback witness','Synthetic prototype V4 body preserved by DDL rollback')`;
    const migrations = await Promise.all([
      readFile(
        new URL(
          "../../packages/database/drizzle/0010_black_ultron.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../packages/database/drizzle/0011_community_actor_budget_erasure.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);
    const backend = await sql.reserve();
    let transaction = false;
    try {
      const initialSettings = await settings(backend);
      expect(initialSettings.statement_timeout).toBe("5s");
      expect(initialSettings.plan_cache_mode).toBe("auto");
      const guard = await libraryGuard(backend);
      expect(guard).toMatchObject({
        prosecdef: false,
        proconfig: null,
        indisvalid: true,
        indisready: true,
      });
      const facts = await legacyFacts(backend, work.id);
      for (const table of [
        "users",
        "accounts",
        "sessions",
        "works",
        "catalog_sources",
        "work_titles",
        "catalog_field_evidence",
        "catalog_audit_events",
        "library_entries",
        "library_events",
        "reading_sessions",
        "reading_progress_events",
      ])
        expect(facts[table].count).toBeGreaterThan(0);
      expect(
        await backend.unsafe(
          "select notes,rating_half_stars from library_entries where id=$1",
          [entry.id],
        ),
      ).toEqual([
        { notes: `PRIVATE_FORWARD_DDL_${f.runId}`, rating_half_stars: 8 },
      ]);
      const originalPrototype = await prototypeFacts(backend);
      expect(originalPrototype.objects).toHaveLength(5);
      expect(originalPrototype.enums).toHaveLength(8);
      expect(await tableNames(backend)).toEqual(
        [...legacyTables, ...v4Tables, ...v5bTables].sort(),
      );
      expect((await tableNames(backend)).length).toBe(40);
      expect(
        (await tableNames(backend)).filter(
          (name) => !v5bTables.some((v5b) => v5b === name),
        ),
      ).toEqual([...legacyTables, ...v4Tables].sort());
      expect(
        (await tableNames(backend)).filter(
          (name) => !v5bTables.some((v5b) => v5b === name),
        ).length,
      ).toBe(37);
      const metadata = await v5bFacts(backend);
      expect(metadata.objects).toHaveLength(3);
      expect(metadata.objects.map((row) => String(row.name))).toEqual(
        [...v5bTables].sort(),
      );
      expect(metadata.guards).toHaveLength(10);
      expect(
        metadata.guards.every(
          (row) => row.tgenabled === "O" || row.tgenabled === "A",
        ),
      ).toBe(true);
      expect(metadata.guards.every((row) => row.prosecdef === false)).toBe(
        true,
      );
      await backend.unsafe("BEGIN");
      transaction = true;
      await backend.unsafe(
        "DROP TRIGGER community_user_erasure_budgets ON public.users",
      );
      for (const table of v4Tables)
        await backend.unsafe(`DROP TABLE public.${table}`);
      for (const name of v4Functions)
        await backend.unsafe(`DROP FUNCTION public.${name}()`);
      for (const name of v4Enums)
        await backend.unsafe(`DROP TYPE public.${name}`);
      expect(await tableNames(backend)).toEqual(
        [...legacyTables, ...v5bTables].sort(),
      );
      expect((await tableNames(backend)).length).toBe(35);
      expect(await v5bFacts(backend)).toEqual(metadata);
      expect(legacyTables).toHaveLength(32);
      expect(await legacyFacts(backend, work.id)).toEqual(facts);
      expect(await libraryGuard(backend)).toEqual(guard);
      for (const migration of migrations)
        for (const statement of migration
          .split("--> statement-breakpoint")
          .map((value) => value.trim())
          .filter(Boolean))
          await backend.unsafe(statement);
      expect(await tableNames(backend)).toEqual(
        [...legacyTables, ...v4Tables, ...v5bTables].sort(),
      );
      expect((await tableNames(backend)).length).toBe(40);
      expect(
        (await tableNames(backend)).filter(
          (name) => !v5bTables.some((v5b) => v5b === name),
        ).length,
      ).toBe(37);
      expect(await v5bFacts(backend)).toEqual(metadata);
      const recreated = await prototypeFacts(backend);
      expect(recreated.objects).toHaveLength(5);
      expect(recreated.enums).toHaveLength(8);
      expect(recreated.functions).toHaveLength(4);
      const triggers = await backend.unsafe(
        `select t.tgname,p.prosecdef from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid=t.tgfoid where not t.tgisinternal and t.tgname=any($1::text[]) order by t.tgname`,
        [v4Triggers],
      );
      expect(triggers.map((row) => String(row.tgname))).toEqual(
        [...v4Triggers].sort(),
      );
      expect(triggers.every((row) => row.prosecdef === false)).toBe(true);
      expect(
        (
          await backend.unsafe(
            `select count(*)::int as count from pg_catalog.pg_constraint where contype='f' and conrelid=any(select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]))`,
            [v4Tables],
          )
        )[0].count,
      ).toBe(14);
      expect(await legacyFacts(backend, work.id)).toEqual(facts);
      expect(await libraryGuard(backend)).toEqual(guard);
      expect(await settings(backend)).toEqual(initialSettings);
      // Never COMMIT: retain existing V4 objects/data and migration registry.
      await backend.unsafe("ROLLBACK");
      transaction = false;
      expect(await prototypeFacts(backend)).toEqual(originalPrototype);
      expect(await v5bFacts(backend)).toEqual(metadata);
      expect(await tableNames(backend)).toEqual(
        [...legacyTables, ...v4Tables, ...v5bTables].sort(),
      );
      expect((await tableNames(backend)).length).toBe(40);
      expect(
        await backend.unsafe(
          "select body from community_contents where id=$1",
          [witnessId],
        ),
      ).toEqual([
        { body: "Synthetic prototype V4 body preserved by DDL rollback" },
      ]);
      expect(await legacyFacts(backend, work.id)).toEqual(facts);
      expect(await libraryGuard(backend)).toEqual(guard);
      expect(await settings(backend)).toEqual(initialSettings);
    } finally {
      try {
        if (transaction) await backend.unsafe("ROLLBACK");
      } finally {
        backend.release();
      }
    }
  });
});
