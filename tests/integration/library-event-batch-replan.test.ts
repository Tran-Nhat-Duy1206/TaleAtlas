import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";

// Source-only regression coverage: no latency/index-use claims or planner overrides.
// GraphMCP unavailable; generation freshness UNKNOWN. The applied SQL is inspected
// directly below; the parent runner, not this fixture, applies migrations.
const sql = createDatabase(requireTestDatabase()).client;
const owner = randomUUID();
const control = randomUUID();
const sourceId = randomUUID();
const workIds = Array.from({ length: 10 }, () => randomUUID());
const ownerKey = randomUUID();
const controlKey = randomUUID();
type Entry = { id: string; user_id: string; work_id: string };
let entries: Entry[] = [];
let owned: Entry[] = [];
let unrelated: Entry;
type Reader = Pick<typeof sql, "unsafe">;

async function facts(backend: Reader = sql) {
  // Both owners are this fixture's UUIDs; no whole-database absence assertions.
  return [
    ...(await backend.unsafe(
      `
    select 'events' as relation, user_id, count(*)::int as count,
      md5(string_agg(row_to_json(t)::text, '|' order by id)) as digest
    from public.library_events t where user_id = any($1::text[]) group by user_id
    union all
    select 'entries', user_id, count(*)::int,
      md5(string_agg(row_to_json(t)::text, '|' order by id))
    from public.library_entries t where user_id = any($1::text[]) group by user_id
    order by relation, user_id`,
      [[owner, control]],
    )),
  ];
}

const eventColumns = [
  "id",
  "entry_id",
  "user_id",
  "work_id",
  "entry_revision",
  "mutation_key",
  "request_hash",
  "kind",
  "snapshot",
] as const;
function event(entry: Entry, overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    entry_id: entry.id,
    user_id: entry.user_id,
    work_id: entry.work_id,
    entry_revision: 9000,
    mutation_key: randomUUID(),
    request_hash: "a".repeat(64),
    kind: "UPDATE",
    snapshot: {},
    ...overrides,
  };
}

beforeAll(async () => {
  requireTestDatabase();
  await sql.begin(async (tx) => {
    await tx`insert into public.users(id, name, email)
      select id, 'Synthetic batch guard SQL fixture', id || '@example.invalid'
      from unnest(${[owner, control]}::text[]) as ids(id)`;
    await tx`insert into public.catalog_sources(id, label, citation)
      values(${sourceId}, ${`Batch guard synthetic ${sourceId}`},
        'Entirely invented UUID-owned SQL fixture; not production metadata.')`;
    await tx`insert into public.works(id, slug, primary_title,
        primary_title_language, format, visibility, source_id, search_text)
      select id, 'batch-guard-' || id::text, 'Synthetic batch guard ' || id::text,
        'en', 'NOVEL', 'DRAFT', ${sourceId}, 'synthetic batch guard fixture'
      from unnest(${workIds}::uuid[]) as ids(id)`;
    await tx`insert into public.library_entries(user_id, work_id)
      select ${owner}, id from unnest(${workIds}::uuid[]) as ids(id)`;
    // A second synthetic owner legitimately shares Works, but never entry scope.
    await tx`insert into public.library_entries(user_id, work_id)
      select ${control}, id from unnest(${workIds.slice(0, 2)}::uuid[]) as ids(id)`;
    entries = [
      ...(await tx<Entry[]>`select id, user_id, work_id
      from public.library_entries where user_id = any(${[owner, control]}::text[])
      order by user_id, work_id`),
    ];
    owned = entries.filter((entry) => entry.user_id === owner);
    const controlEntry = entries.find((entry) => entry.user_id === control);
    if (owned.length !== 10 || !controlEntry)
      throw new Error(
        "Bounded SQL fixture did not persist its expected entries",
      );
    unrelated = controlEntry;
    await tx`insert into public.library_events ${tx(
      [
        event(owned[0]!, {
          entry_revision: 1,
          mutation_key: ownerKey,
          kind: "ADD",
        }),
        event(unrelated, {
          entry_revision: 1,
          mutation_key: controlKey,
          kind: "ADD",
        }),
      ],
      ...eventColumns,
    )}`;
  });
}, 60000);

afterAll(async () => {
  // Explicit child-to-parent cleanup; a failed FK is not hidden by cascades.
  // Always close the unchanged production pool, even after setup/cleanup failure.
  try {
    requireTestDatabase();
    await sql.begin(async (tx) => {
      await tx`delete from public.library_events where user_id = any(${[owner, control]}::text[])`;
      await tx`delete from public.library_entries where user_id = any(${[owner, control]}::text[])`;
      await tx`delete from public.works where id = any(${workIds}::uuid[]) and source_id = ${sourceId}`;
      await tx`delete from public.catalog_sources where id = ${sourceId}`;
      await tx`delete from public.users where id = any(${[owner, control]}::text[])`;
    });
  } finally {
    await sql.end();
  }
}, 60000);

describe("library event bulk-only cache guard (bounded real SQL)", () => {
  it("has the exact statement transition trigger, invoker function and validated triple FK/parent key", async () => {
    const triggers =
      await sql`select t.tgtype::int as type, t.tgnewtable as new_table,
        t.tgoldtable as old_table, t.tgenabled as enabled, t.tgisinternal as internal,
        t.tgnargs::int as arguments, t.tgqual is null as unconditional,
        p.prosecdef as security_definer, p.proconfig as configuration,
        p.proname as function_name, n.nspname as function_schema,
        p.prorettype = 'pg_catalog.trigger'::regtype as returns_trigger,
        l.lanname as language, p.prosrc as body
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_proc p on p.oid = t.tgfoid
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      join pg_catalog.pg_language l on l.oid = p.prolang
      where t.tgrelid = 'public.library_events'::regclass
        and t.tgname = 'library_event_batch_replan'`;
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toMatchObject({
      type: 4,
      new_table: "library_event_inserted_rows",
      old_table: null,
      enabled: "O",
      internal: false,
      arguments: 0,
      unconditional: true,
      security_definer: false,
      configuration: null,
      function_name: "library_event_batch_replan",
      function_schema: "public",
      returns_trigger: true,
      language: "plpgsql",
    });
    expect(String(triggers[0]!.body).replace(/\s+/g, "").toLowerCase()).toBe(
      "beginifexists(select1fromlibrary_event_inserted_rowsoffset1)thenexecute'discardplans';endif;returnnull;end;",
    );
    const constraints = await sql`select c.conname as name, c.contype as type,
        c.convalidated as validated, c.condeferrable as deferrable,
        c.condeferred as deferred, c.confdeltype as on_delete,
        c.confupdtype as on_update,
        c.confrelid = 'public.library_entries'::regclass as correct_parent,
        array(select a.attname::text from unnest(c.conkey) with ordinality k(num, pos)
          join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.num
          order by k.pos) as columns,
        array(select a.attname::text from unnest(c.confkey) with ordinality k(num, pos)
          join pg_catalog.pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.num
          order by k.pos) as parent_columns,
        c.conindid::text as supporting_index
      from pg_catalog.pg_constraint c
      where (c.conrelid = 'public.library_events'::regclass and c.conname = 'library_events_entry_scope_fk')
        or (c.conrelid = 'public.library_entries'::regclass and c.conname = 'library_entries_id_user_work_unique')
      order by c.conname`;
    expect(constraints).toHaveLength(2);
    const parent = constraints.find(
      (c) => c.name === "library_entries_id_user_work_unique",
    );
    const child = constraints.find(
      (c) => c.name === "library_events_entry_scope_fk",
    );
    expect(parent).toMatchObject({
      type: "u",
      validated: true,
      deferrable: false,
      deferred: false,
      columns: ["id", "user_id", "work_id"],
    });
    expect(child).toMatchObject({
      type: "f",
      validated: true,
      deferrable: false,
      deferred: false,
      on_delete: "c",
      on_update: "a",
      correct_parent: true,
      columns: ["entry_id", "user_id", "work_id"],
      parent_columns: ["id", "user_id", "work_id"],
    });
    expect(child!.supporting_index).toBe(parent!.supporting_index);
    expect(parent!.supporting_index).not.toBe("0");
  }, 30000);

  it("preserves PREPARE definitions, SELECT 37 and every RETURNING row for 0/1/2/10 vectors and rollback", async () => {
    const before = await facts();
    const connection = await sql.reserve();
    // Descriptor names live only on this pinned test connection; never application DTOs.
    const suffix = randomUUID().replace(/-/g, "");
    const insertName = `batch_guard_insert_${suffix}`;
    const witnessName = `batch_guard_witness_${suffix}`;
    const names = [insertName, witnessName];
    const definitions = async () => [
      ...(await connection`select name, statement,
        parameter_types::text as parameter_types, from_sql
      from pg_catalog.pg_prepared_statements
      where name = any(${names}::text[]) order by name`),
    ];
    const witness = async () => {
      const result = await connection.unsafe(`EXECUTE ${witnessName}`);
      expect(result).toHaveLength(1);
      expect(result[0]!.value).toBe(37);
    };
    // EXECUTE arguments cannot use protocol bind placeholders. These literals are
    // exclusively fixture UUIDs (checked here), not arbitrary user/string input.
    const vector = (values: string[], type: "uuid" | "text") => {
      for (const value of values)
        expect(value).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
      return `ARRAY[${values.map((value) => `'${value}'`).join(",")}]::${type}[]`;
    };
    const execute = (rows: Entry[], revision: number) =>
      connection.unsafe(`
      EXECUTE ${insertName}(${vector(
        rows.map((e) => e.id),
        "uuid",
      )},
        ${vector(
          rows.map((e) => e.user_id),
          "text",
        )},
        ${vector(
          rows.map((e) => e.work_id),
          "uuid",
        )}, ${revision})`);
    let inTransaction = false;
    const prepared: string[] = [];
    try {
      await connection.unsafe(`PREPARE ${insertName}(uuid[], text[], uuid[], integer) AS
        INSERT INTO public.library_events(entry_id, user_id, work_id, entry_revision,
          mutation_key, request_hash, kind, snapshot)
        SELECT entry_id, user_id, work_id, $4, gen_random_uuid(), repeat('b',64),
          'UPDATE', jsonb_build_object('fixture', 'prepared-vector')
        FROM unnest($1, $2, $3) AS rows(entry_id, user_id, work_id)
        RETURNING id, entry_id, user_id, work_id, entry_revision`);
      prepared.push(insertName);
      await connection.unsafe(
        `PREPARE ${witnessName} AS SELECT 37::int AS value`,
      );
      prepared.push(witnessName);
      const original = await definitions();
      expect(original).toHaveLength(2);
      expect(original.every((definition) => definition.from_sql === true)).toBe(
        true,
      );
      await witness();
      await connection.unsafe("BEGIN");
      inTransaction = true;
      const batches = [[], [owned[0]!], [owned[0]!, unrelated], owned];
      for (const [index, batch] of batches.entries()) {
        const revision = index + 2;
        const returned = await execute(batch, revision);
        expect(returned).toHaveLength(batch.length);
        expect(new Set(returned.map((row) => row.id)).size).toBe(batch.length);
        expect(
          returned
            .map((row) => ({
              entry_id: row.entry_id,
              user_id: row.user_id,
              work_id: row.work_id,
              entry_revision: row.entry_revision,
            }))
            .sort((a, b) =>
              String(a.entry_id).localeCompare(String(b.entry_id)),
            ),
        ).toEqual(
          batch
            .map((row) => ({
              entry_id: row.id,
              user_id: row.user_id,
              work_id: row.work_id,
              entry_revision: revision,
            }))
            .sort((a, b) => a.entry_id.localeCompare(b.entry_id)),
        );
        const persisted =
          await connection`select entry_id from public.library_events
          where user_id = any(${[owner, control]}::text[]) and entry_revision = ${revision}`;
        expect(persisted).toHaveLength(batch.length);
        await witness();
        expect(await definitions()).toEqual(original);
      }
      await connection.unsafe("ROLLBACK");
      inTransaction = false;
      expect(await facts(connection)).toEqual(before);
      expect(await definitions()).toEqual(original);
      await witness();
      await connection.unsafe("BEGIN");
      inTransaction = true;
      expect(await execute([unrelated], 6)).toHaveLength(1);
      await witness();
      await connection.unsafe("ROLLBACK");
      inTransaction = false;
      expect(await facts(connection)).toEqual(before);
      expect(await definitions()).toEqual(original);
    } finally {
      try {
        if (inTransaction) await connection.unsafe("ROLLBACK");
      } finally {
        try {
          for (const name of prepared)
            await connection.unsafe(`DEALLOCATE ${name}`);
        } finally {
          connection.release();
        }
      }
    }
    expect(await facts()).toEqual(before);
  }, 30000);

  it("rejects 13 bounded scope/check/unique violations and rolls back bulk rows for both fixture owners", async () => {
    const before = await facts();
    const [existing] = await sql`select id from public.library_events
      where entry_id = ${owned[0]!.id} and entry_revision = 1`;
    if (!existing) throw new Error("Expected fixture sentinel event");
    const cases: {
      patch: Record<string, unknown>;
      code: string;
      constraint?: string;
    }[] = [
      {
        patch: { user_id: control },
        code: "23503",
        constraint: "library_events_entry_scope_fk",
      },
      {
        patch: { work_id: owned[1]!.work_id },
        code: "23503",
        constraint: "library_events_entry_scope_fk",
      },
      {
        patch: { entry_id: randomUUID() },
        code: "23503",
        constraint: "library_events_entry_scope_fk",
      },
      {
        patch: { entry_revision: 0 },
        code: "23514",
        constraint: "library_events_revision_check",
      },
      {
        patch: { entry_revision: 10001 },
        code: "23514",
        constraint: "library_events_revision_check",
      },
      {
        patch: { request_hash: "A".repeat(64) },
        code: "23514",
        constraint: "library_events_request_hash_check",
      },
      {
        patch: { request_hash: "a".repeat(63) },
        code: "23514",
        constraint: "library_events_request_hash_check",
      },
      {
        patch: { snapshot: [] },
        code: "23514",
        constraint: "library_events_snapshot_check",
      },
      {
        patch: { snapshot: "not-an-object" },
        code: "23514",
        constraint: "library_events_snapshot_check",
      },
      { patch: { id: existing.id }, code: "23505" },
      {
        patch: { entry_revision: 1 },
        code: "23505",
        constraint: "library_events_entry_revision_unique",
      },
      // Same-entry key collision may be reported by either of the overlapping keys.
      { patch: { mutation_key: ownerKey }, code: "23505" },
      {
        patch: {
          entry_id: owned[1]!.id,
          work_id: owned[1]!.work_id,
          mutation_key: ownerKey,
        },
        code: "23505",
        constraint: "library_events_owner_key_unique",
      },
    ];
    expect(cases).toHaveLength(13);
    for (const testCase of cases) {
      // This first valid two-owner bulk executes the guard before the subsequent
      // failing statement; the enclosing transaction must undo it as well.
      const operation = sql.begin(async (tx) => {
        const accepted = await tx`insert into public.library_events ${tx(
          [
            event(owned[0]!, { entry_revision: 8000 }),
            event(unrelated, { entry_revision: 8000 }),
          ],
          ...eventColumns,
        )} returning id`;
        expect(accepted).toHaveLength(2);
        await tx`insert into public.library_events ${tx(
          [event(unrelated), event(owned[0]!, testCase.patch)],
          ...eventColumns,
        )} returning id`;
      });
      await expect(operation).rejects.toMatchObject({
        code: testCase.code,
        ...(testCase.constraint
          ? { constraint_name: testCase.constraint }
          : {}),
      });
      expect(await facts()).toEqual(before);
    }
  }, 30000);

  it("accepts actual 32768-byte JSONB objects in bulk and rejects 32769 bytes with atomic rollback", async () => {
    const before = await facts();
    const filler = randomBytes(16380).toString("hex").slice(0, 32759);
    const ascii = JSON.stringify({ n: filler });
    const utf8 = JSON.stringify({ n: `é${filler.slice(0, 32757)}` });
    const overflow = JSON.stringify({ n: `${filler}x` });
    // Bind serialized JSON as TEXT first: a JSONB OID would auto-stringify the
    // JavaScript string again in postgres.js and test a JSON string, not an object.
    const sizes = await sql`select jsonb_typeof(value) as type,
        octet_length(value::text)::int as bytes
      from (values (${ascii}::text::jsonb), (${utf8}::text::jsonb),
        (${overflow}::text::jsonb)) as objects(value)`;
    expect(sizes.map((row) => ({ type: row.type, bytes: row.bytes }))).toEqual([
      { type: "object", bytes: 32768 },
      { type: "object", bytes: 32768 },
      { type: "object", bytes: 32769 },
    ]);
    const rollback = new Error("Intentional fixture rollback");
    const insertBoundary = async (
      tx: Parameters<Parameters<typeof sql.begin>[1]>[0],
    ) => {
      const returned =
        await tx`insert into public.library_events(entry_id, user_id,
          work_id, entry_revision, mutation_key, request_hash, kind, snapshot)
        values (${owned[0]!.id}, ${owner}, ${owned[0]!.work_id}, 7000,
          ${randomUUID()}, ${"a".repeat(64)}, 'UPDATE', ${ascii}::text::jsonb),
          (${unrelated.id}, ${control}, ${unrelated.work_id}, 7000,
          ${randomUUID()}, ${"a".repeat(64)}, 'UPDATE', ${utf8}::text::jsonb)
        returning entry_id, user_id, jsonb_typeof(snapshot) as type,
          octet_length(snapshot::text)::int as bytes`;
      expect(returned).toHaveLength(2);
      expect(returned.map((row) => row.entry_id).sort()).toEqual(
        [owned[0]!.id, unrelated.id].sort(),
      );
      expect(
        returned.every((row) => row.type === "object" && row.bytes === 32768),
      ).toBe(true);
    };
    await expect(
      sql.begin(async (tx) => {
        await insertBoundary(tx);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(await facts()).toEqual(before);
    await expect(
      sql.begin(async (tx) => {
        await insertBoundary(tx);
        await tx`insert into public.library_events(entry_id, user_id, work_id,
          entry_revision, mutation_key, request_hash, kind, snapshot)
        values (${owned[0]!.id}, ${owner}, ${owned[0]!.work_id}, 7001,
          ${randomUUID()}, ${"a".repeat(64)}, 'UPDATE', ${ascii}::text::jsonb),
          (${unrelated.id}, ${control}, ${unrelated.work_id}, 7001,
          ${randomUUID()}, ${"a".repeat(64)}, 'UPDATE', ${overflow}::text::jsonb)`;
      }),
    ).rejects.toMatchObject({
      code: "23514",
      constraint_name: "library_events_snapshot_check",
    });
    expect(await facts()).toEqual(before);
  }, 30000);
});
