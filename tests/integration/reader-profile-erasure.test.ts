import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";

// Bounded, invented SQL fixtures only: not real-auth or maximal fan-out evidence.
// GraphMCP coverage UNKNOWN. Existing community/library integration patterns and
// database/client are the source fallback; the parent owns migration application.
const sql = createDatabase(requireTestDatabase()).client;
type Reader = Pick<typeof sql, "unsafe">;
const ids = Array.from({ length: 4 }, () => `profile-erasure|${randomUUID()}`);
const [victim, removed, survivor, other] = ids as [
  string,
  string,
  string,
  string,
];
const peers = Array.from({ length: 256 }, () => `profile-peer|${randomUUID()}`);
const allUsers = [...ids, ...peers];
const claims = ids.map(
  () => `r${randomUUID().replaceAll("-", "").slice(0, 23)}`,
);
const genre = `rp-${randomUUID()}`;
const sourceId = randomUUID(),
  workId = randomUUID();
let publicIds: string[] = [];

async function snapshot(tx: Reader, owners: string[]) {
  const result: Record<string, unknown> = {};
  for (const [table, column, order] of [
    ["users", "id", "id"],
    ["reader_profiles", "user_id", "user_id"],
    ["reader_profile_interests", "user_id", "user_id,slot"],
    ["library_entries", "user_id", "id"],
    ["library_events", "user_id", "id"],
  ])
    result[table!] = [
      ...(await tx.unsafe(
        `select * from ${table} where ${column}=any($1::text[]) order by ${order}`,
        [owners],
      )),
    ];
  result.blocks = [
    ...(await tx.unsafe(
      "select * from reader_blocks where blocker_id=any($1::text[]) or blocked_id=any($1::text[]) order by blocker_id,blocked_id",
      [owners],
    )),
  ];
  return result;
}
async function erased(tx: Reader, id: string, claim: string, publicId: string) {
  const [row] = await tx.unsafe(
    `select
    (select count(*)::int from users where id=$1) as users,
    (select count(*)::int from reader_profiles where user_id=$1 or handle=$2 or public_id=$3::uuid) as profiles,
    (select count(*)::int from reader_profile_interests where user_id=$1) as interests,
    (select count(*)::int from reader_blocks where blocker_id=$1 or blocked_id=$1) as blocks,
    (select count(*)::int from library_entries where user_id=$1) as entries,
    (select count(*)::int from library_events where user_id=$1) as events`,
    [id, claim, publicId],
  );
  expect(row).toEqual({
    users: 0,
    profiles: 0,
    interests: 0,
    blocks: 0,
    entries: 0,
    events: 0,
  });
}

beforeAll(async () => {
  requireTestDatabase();
  await sql.begin(async (tx) => {
    await tx`insert into users(id,name,email) select id,'Synthetic erasure fixture',id || '@invalid' from unnest(${allUsers}::text[]) u(id)`;
    await tx`insert into genres(slug,name_en,name_vi) values(${genre},'Synthetic genre','Synthetic genre')`;
    for (let i = 0; i < ids.length; i++) {
      const [p] =
        await tx`insert into reader_profiles(user_id,handle,display_name,biography) values(${ids[i]!},${claims[i]!},'Synthetic Reader','Invented preference content') returning public_id`;
      publicIds.push(String(p!.public_id));
      await tx`insert into reader_profile_interests(user_id,slot,genre_slug) values(${ids[i]!},1,${genre})`;
    }
    await tx`insert into reader_blocks(blocker_id,blocked_id) values(${survivor},${other}),(${other},${survivor}),(${removed},${survivor}),(${survivor},${removed})`;
    await tx`insert into reader_blocks(blocker_id,blocked_id) select ${victim},id from unnest(${peers}::text[]) p(id)`;
    await tx`insert into reader_blocks(blocker_id,blocked_id) select id,${victim} from unnest(${peers}::text[]) p(id)`;
    await tx`insert into catalog_sources(id,label,citation) values(${sourceId},${`Synthetic profile erasure ${sourceId}`},'Invented UUID-owned SQL fixture only.')`;
    await tx`insert into works(id,slug,primary_title,primary_title_language,format,visibility,source_id,search_text) values(${workId},${`rp-${workId}`},'Synthetic erasure Work','en','NOVEL','PUBLISHED',${sourceId},'Synthetic erasure Work')`;
    await tx`insert into library_entries(user_id,work_id,notes) select id,${workId},'Synthetic private sentinel' from unnest(${ids}::text[]) u(id)`;
    await tx`insert into library_events(entry_id,user_id,work_id,entry_revision,mutation_key,request_hash,kind,snapshot) select id,user_id,work_id,1,gen_random_uuid(),repeat('a',64),'ADD','{"notes":"Synthetic private sentinel"}'::jsonb from library_entries where user_id=any(${ids}::text[]) and work_id=${workId}`;
  });
});
afterAll(async () => {
  try {
    requireTestDatabase();
    await sql.begin(async (tx) => {
      // Root erasure is the supported profile cleanup; no live-account claim DELETE.
      await tx`delete from users where id=any(${allUsers}::text[])`;
      await tx`delete from works where id=${workId} and source_id=${sourceId}`;
      await tx`delete from catalog_sources where id=${sourceId}`;
      await tx`delete from genres where slug=${genre}`;
    });
  } finally {
    await sql.end();
  }
});

describe("reader profile root-account erasure", () => {
  it("warms six tiny deletes, preserves cached PREPARE definitions, rolls back then commits a bounded bidirectional erasure under unchanged SQL settings", async () => {
    requireTestDatabase();
    const connection = await sql.reserve();
    const suffix = randomUUID().replaceAll("-", "");
    const deleteName = `rp_delete_${suffix}`,
      witnessName = `rp_witness_${suffix}`;
    const prepared: string[] = [];
    let transaction = false;
    const settings = async () => [
      ...(await connection`select pg_backend_pid() as pid,current_setting('statement_timeout') as timeout,current_setting('plan_cache_mode') as cache,current_setting('enable_seqscan') as seq,current_setting('enable_indexscan') as idx,current_setting('enable_bitmapscan') as bitmap,current_setting('jit') as jit`),
    ];
    const definitions = async () => [
      ...(await connection`select name,statement,parameter_types::text from pg_prepared_statements where name=any(${[deleteName, witnessName]}::text[]) order by name`),
    ];
    try {
      const baseline = await settings();
      expect(baseline[0]).toMatchObject({ timeout: "5s", cache: "auto" });
      await connection.unsafe(
        `PREPARE ${deleteName}(text) AS DELETE FROM public.users WHERE id=$1 RETURNING id`,
      );
      prepared.push(deleteName);
      await connection.unsafe(`PREPARE ${witnessName} AS SELECT 37 AS value`);
      prepared.push(witnessName);
      const beforeDefinitions = await definitions();
      const execute = async (id: string) => {
        const [quoted] =
          await connection`select quote_literal(${id}::text) as id`;
        return connection.unsafe(`EXECUTE ${deleteName}(${quoted!.id})`);
      };
      // All tiny fixtures disappear on rollback, but RI plans warm on this backend.
      for (let i = 0; i < 6; i++) {
        await connection.unsafe("BEGIN");
        transaction = true;
        const id = `tiny-profile|${randomUUID()}`;
        await connection`insert into users(id,name,email) values(${id},'Synthetic tiny fixture',${`${randomUUID()}@invalid`})`;
        await connection`insert into reader_profiles(user_id,handle,display_name) values(${id},${`r${randomUUID().replaceAll("-", "").slice(0, 23)}`},'Synthetic')`;
        await connection`insert into reader_profile_interests(user_id,slot,genre_slug) values(${id},1,${genre})`;
        await connection`insert into reader_blocks(blocker_id,blocked_id) values(${id},${survivor}),(${survivor},${id})`;
        expect(await execute(id)).toEqual([{ id }]);
        expect(
          await connection`select user_id from reader_profiles where user_id=${id}`,
        ).toHaveLength(0);
        await connection.unsafe("ROLLBACK");
        transaction = false;
      }
      const victimBefore = await snapshot(connection, [victim]);
      const unrelatedBefore = await snapshot(connection, [
        removed,
        survivor,
        other,
      ]);
      expect(victimBefore.blocks as unknown[]).toHaveLength(512);
      expect(victimBefore.library_entries as unknown[]).toHaveLength(1);
      expect(victimBefore.library_events as unknown[]).toHaveLength(1);
      for (const commit of [false, true]) {
        await connection.unsafe("BEGIN");
        transaction = true;
        const started = performance.now();
        expect(await execute(victim)).toEqual([{ id: victim }]);
        expect(performance.now() - started).toBeLessThan(5000);
        await erased(connection, victim, claims[0]!, publicIds[0]!);
        expect(await snapshot(connection, [removed, survivor, other])).toEqual(
          unrelatedBefore,
        );
        expect(await definitions()).toEqual(beforeDefinitions);
        expect(await connection.unsafe(`EXECUTE ${witnessName}`)).toEqual([
          { value: 37 },
        ]);
        expect(await settings()).toEqual(baseline);
        await connection.unsafe(commit ? "COMMIT" : "ROLLBACK");
        transaction = false;
        if (!commit)
          expect(await snapshot(connection, [victim])).toEqual(victimBefore);
        expect(await snapshot(connection, [removed, survivor, other])).toEqual(
          unrelatedBefore,
        );
        expect(await definitions()).toEqual(beforeDefinitions);
        expect(await settings()).toEqual(baseline);
      }
    } finally {
      try {
        if (transaction) await connection.unsafe("ROLLBACK");
      } finally {
        try {
          for (const name of prepared)
            await connection.unsafe(`DEALLOCATE ${name}`);
        } finally {
          connection.release();
        }
      }
    }
  });

  it("removal erases presentation and interests but retains claims and blocks until root deletion permits a new public identity", async () => {
    requireTestDatabase();
    const before = await snapshot(sql, [survivor, other]);
    const blocks = [
      ...(await sql`select * from reader_blocks where blocker_id=${removed} or blocked_id=${removed} order by blocker_id,blocked_id`),
    ];
    expect(blocks).toHaveLength(2);
    await sql`update reader_profiles set state='REMOVED',visibility='PRIVATE',display_name=null,biography=null where user_id=${removed}`;
    expect(
      await sql`select state,visibility,display_name,biography,handle,public_id from reader_profiles where user_id=${removed}`,
    ).toEqual([
      {
        state: "REMOVED",
        visibility: "PRIVATE",
        display_name: null,
        biography: null,
        handle: claims[1],
        public_id: publicIds[1],
      },
    ]);
    expect(
      await sql`select slot from reader_profile_interests where user_id=${removed}`,
    ).toHaveLength(0);
    expect(
      await sql`select * from reader_blocks where blocker_id=${removed} or blocked_id=${removed} order by blocker_id,blocked_id`,
    ).toEqual(blocks);
    // Rejected transaction cannot replace the retained claim, even for an existing
    // different account. Use a fixture peer with no profile, not another lifecycle.
    let errorCode: string | undefined;
    try {
      await sql`insert into reader_profiles(user_id,handle,display_name) values(${peers[0]!},${claims[1]!},'Synthetic new owner')`;
    } catch (error) {
      errorCode = (error as { code?: string }).code;
    }
    expect(errorCode).toBe("23505");
    expect(await snapshot(sql, [survivor, other])).toEqual(before);
    expect(
      await sql`delete from users where id=${removed} returning id`,
    ).toEqual([{ id: removed }]);
    await erased(sql, removed, claims[1]!, publicIds[1]!);
    const [replacement] =
      await sql`insert into reader_profiles(user_id,handle,display_name) values(${peers[0]!},${claims[1]!},'Synthetic new owner') returning user_id,public_id,visibility,state`;
    expect(replacement).toMatchObject({
      user_id: peers[0],
      visibility: "PRIVATE",
      state: "ACTIVE",
    });
    expect(replacement!.public_id).not.toBe(publicIds[1]);
    expect(
      await sql`select user_id from reader_profiles where public_id=${publicIds[1]!}::uuid`,
    ).toHaveLength(0);
    // The only survivor change is disappearance of its edge to the erased account.
    const after = await snapshot(sql, [survivor, other]);
    expect({ ...after, blocks: before.blocks }).toEqual(before);
    expect(after.blocks).toEqual(
      (before.blocks as { blocker_id: string; blocked_id: string }[]).filter(
        (row) => row.blocker_id !== removed && row.blocked_id !== removed,
      ),
    );
  });
});
