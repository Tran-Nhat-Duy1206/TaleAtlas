import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";
import { readingAuthFixture } from "../helpers/reading-auth-fixture";
import { getDatabaseConnection } from "../../apps/web/src/server/database";
import {
  requireReaderProfilePrincipal,
  readReaderProfileFoundationJson,
} from "../../apps/web/src/server/reader-profile/authority";
import { chargeReaderProfileAttempt } from "../../apps/web/src/server/reader-profile/rate-limits";
import { ReaderProfileFoundationError } from "../../apps/web/src/features/reader-profile/http-contracts";

// Actual SQL remains NOT RUN without an approved owned disposable PostgreSQL17.
// No installation, external fallback, FORCE drop or shared-schema DDL is used.
const baseURL = requireTestDatabase();
const admin = createDatabase(baseURL).client;
const name = `reader_profile_budget_${randomUUID().replaceAll("-", "")}_test`;
const target = new URL(baseURL);
target.pathname = `/${name}`;
const connection = createDatabase(target.toString());
const sql = connection.client;
const folder = fileURLToPath(
  new URL("../../packages/database/drizzle/", import.meta.url),
);
const { migrate } = createRequire(
  new URL("../../packages/database/package.json", import.meta.url),
)("drizzle-orm/postgres-js/migrator") as {
  migrate: (
    db: typeof connection.db,
    options: { migrationsFolder: string },
  ) => Promise<void>;
};
const table = "reader_profile_rate_limits";
const renamed = "reader_profile_rate_limits_unready";
const primary = "reader_profile_rate_limits_pkey";
const foreign = "reader_profile_rate_limits_user_fk";
const checkNames = [
  "reader_profile_rate_limits_kind_check",
  "reader_profile_rate_limits_count_check",
  "reader_profile_rate_limits_last_request_check",
] as const;
const kinds = ["ordinary", "content", "withdrawal"] as const;
let created = false;
type Reader = Pick<typeof sql, "unsafe">;
const fixtureKeys: string[] = [];
const fixtureUsers: string[] = [];
function guardedTarget() {
  const base = new URL(requireTestDatabase());
  expect(base.toString() === new URL(baseURL).toString()).toBe(true);
  expect(
    target.hostname === base.hostname &&
      target.port === base.port &&
      target.protocol === base.protocol &&
      target.username === base.username &&
      target.password === base.password,
  ).toBe(true);
  expect(name).toMatch(/^reader_profile_budget_[0-9a-f]{32}_test$/);
  expect(
    target.pathname === `/${name}` && target.pathname !== base.pathname,
  ).toBe(true);
}
beforeAll(async () => {
  guardedTarget();
  expect(
    (
      await admin`select count(*)::int as n from pg_database where datname=${name}`
    )[0]?.n,
  ).toBe(0);
  await admin.unsafe(
    `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`,
  );
  created = true;
  expect(
    (
      await admin`select pg_get_userbyid(datdba)=current_user as owned from pg_database where datname=${name}`
    )[0]?.owned,
  ).toBe(true);
  await migrate(connection.db, { migrationsFolder: folder });
});
afterAll(async () => {
  try {
    await sql.end();
    if (created) {
      guardedTarget();
      expect(
        (
          await admin`select pg_get_userbyid(datdba)=current_user as owned from pg_database where datname=${name}`
        )[0]?.owned,
      ).toBe(true);
      await admin.unsafe(`DROP DATABASE "${name}"`);
    }
  } finally {
    await admin.end();
  }
});
async function ddl() {
  return (
    await readFile(
      new URL(
        "../../packages/database/drizzle/0016_reader_profile_rate_limit_erasure.sql",
        import.meta.url,
      ),
      "utf8",
    )
  )
    .split("--> statement-breakpoint")
    .map((part) => part.trim())
    .filter(Boolean);
}
async function exactStorage(backend: Reader) {
  const columns = await backend.unsafe(
    "select a.attname,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull from pg_attribute a where a.attrelid='public.reader_profile_rate_limits'::regclass and a.attnum>0 and not a.attisdropped order by a.attnum",
  );
  expect(columns).toEqual([
    { attname: "user_id", type: "text", attnotnull: true },
    { attname: "kind", type: "text", attnotnull: true },
    { attname: "count", type: "integer", attnotnull: true },
    { attname: "last_request", type: "bigint", attnotnull: true },
  ]);
  const constraints = await backend.unsafe(
    `select k.conname,k.contype,k.convalidated,k.condeferrable,k.condeferred,k.confdeltype,k.confupdtype,
      case when k.confrelid=0 then null else k.confrelid::regclass::text end as target,
      (select array_agg(a.attname::text order by u.n) from unnest(k.conkey) with ordinality u(attnum,n) join pg_attribute a on a.attrelid=k.conrelid and a.attnum=u.attnum) as columns,
      (select array_agg(a.attname::text order by u.n) from unnest(k.confkey) with ordinality u(attnum,n) join pg_attribute a on a.attrelid=k.confrelid and a.attnum=u.attnum) as target_columns
      from pg_constraint k where k.conrelid='public.reader_profile_rate_limits'::regclass order by k.conname`,
  );
  expect(constraints.length).toBe(5);
  const pk = constraints.find((row) => row.conname === primary);
  expect(pk).toMatchObject({
    contype: "p",
    convalidated: true,
    condeferrable: false,
    condeferred: false,
    columns: ["user_id", "kind"],
  });
  const fk = constraints.find((row) => row.conname === foreign);
  expect(fk).toMatchObject({
    contype: "f",
    convalidated: true,
    condeferrable: false,
    condeferred: false,
    confdeltype: "c",
    confupdtype: "a",
    target: "users",
    columns: ["user_id"],
    target_columns: ["id"],
  });
  expect(
    constraints.filter((row) => row.contype === "c").map((row) => row.conname),
  ).toEqual([...checkNames].sort());
  expect(constraints.every((row) => row.convalidated === true)).toBe(true);
  const indexes = await backend.unsafe(
    "select i.indisprimary,i.indisunique,i.indisvalid,i.indisready,i.indnkeyatts,i.indpred is null as unconditional,i.indexprs is null as columns_only from pg_index i where i.indrelid='public.reader_profile_rate_limits'::regclass",
  );
  expect(indexes).toEqual([
    {
      indisprimary: true,
      indisunique: true,
      indisvalid: true,
      indisready: true,
      indnkeyatts: 2,
      unconditional: true,
      columns_only: true,
    },
  ]);
  const triggers = await backend.unsafe(
    `select c.relname,t.tgisinternal,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid
      where t.tgconstraint=(select oid from pg_constraint where conrelid='public.reader_profile_rate_limits'::regclass and conname=$1) order by c.relname,t.tgname`,
    [foreign],
  );
  expect(triggers.length).toBe(4);
  expect(triggers.map((row) => row.relname)).toEqual([
    table,
    table,
    "users",
    "users",
  ]);
  expect(
    triggers.every((row) => row.tgisinternal === true && row.tgenabled === "O"),
  ).toBe(true);
  expect(
    (
      await backend.unsafe(
        "select to_regprocedure('public.reader_profile_user_erasure_budgets()') is null as absent",
      )
    )[0]?.absent,
  ).toBe(true);
  expect(
    (
      await backend.unsafe(
        "select count(*)::int as count from pg_trigger where tgname='reader_profile_user_erasure_budgets'",
      )
    )[0]?.count,
  ).toBe(0);
}
// Complete public schema and row digests, including every old custom guard.
// No new/broadened legacy exclusion hides changes to an earlier cohort.
async function facts(backend: Reader) {
  const tables = await backend.unsafe(
    "select c.oid::text,c.relname,c.relkind,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','i','S') order by c.relname",
  );
  const columns = await backend.unsafe(
    "select c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) as default_expression from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum",
  );
  const constraints = await backend.unsafe(
    "select c.relname,k.oid::text as oid,k.conname,pg_get_constraintdef(k.oid) as definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by c.relname,k.conname",
  );
  const indexes = await backend.unsafe(
    "select i.indexrelid::text,i.indisunique,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) as definition from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by i.indexrelid",
  );
  const functions = await backend.unsafe(
    "select p.oid::text,p.proname,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.oid",
  );
  const triggers = await backend.unsafe(
    "select t.oid::text,t.tgname,t.tgenabled,t.tgfoid::text,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by t.oid",
  );
  const data = [];
  for (const entry of tables.filter((row) => row.relkind === "r")) {
    const [identifier] = await backend.unsafe(
      "select quote_ident($1) as name",
      [String(entry.relname)],
    );
    const [value] = await backend.unsafe(
      `select count(*)::int as count,md5(coalesce(string_agg(row_to_json(r)::text,'|' order by row_to_json(r)::text),'')) as digest from public.${identifier!.name} r`,
    );
    data.push({ table: entry.relname, ...value });
  }
  return { tables, columns, constraints, indexes, functions, triggers, data };
}
async function quotaDigest(backend: Reader, id: string) {
  return (
    await backend.unsafe(
      "select count(*)::int as count,md5(coalesce(string_agg(row_to_json(r)::text,'|' order by r.kind),'')) as digest from public.reader_profile_rate_limits r where user_id=$1",
      [id],
    )
  )[0];
}
async function sharedDigest(backend: Reader, selected: string[]) {
  return (
    await backend.unsafe(
      "select count(*)::int as count,md5(coalesce(string_agg(row_to_json(r)::text,'|' order by r.key),'')) as digest from public.rate_limits r where key=any($1::text[])",
      [selected],
    )
  )[0];
}
async function seedUser(id: string) {
  fixtureUsers.push(id);
  await sql`insert into users(id,name,email) values(${id},'Synthetic migration edge',${`${randomUUID()}@invalid`})`;
}
async function seedQuota(id: string) {
  await seedUser(id);
  for (const kind of kinds)
    await sql`insert into reader_profile_rate_limits(user_id,kind,count,last_request) values(${id},${kind},1,12345)`;
}
async function errorCode(operation: Promise<unknown>, expected: string) {
  let code: string | undefined;
  try {
    await operation;
  } catch (error) {
    code = (error as { code?: string }).code;
  }
  expect(code).toBe(expected);
}

describe("0016 isolated reader-profile quota FK migration", () => {
  it("fails closed before body or charging for absent, malformed, unvalidated or disabled isolated storage protection and rechecks every recovered admission", async () => {
    const envNames = [
      "TEST_DATABASE_URL",
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "APP_ORIGIN",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_FROM",
      "SMTP_SECURE",
      "V6B_PROFILE_OWNER_ENABLED",
      "V6B_PROFILE_PUBLIC_ENABLED",
    ] as const;
    const saved = new Map(envNames.map((key) => [key, process.env[key]]));
    process.env.TEST_DATABASE_URL = target.toString();
    const f = readingAuthFixture();
    process.env.TEST_DATABASE_URL = baseURL;
    let started = false;
    const originals = await sql<
      { conname: string; definition: string }[]
    >`select conname,pg_get_constraintdef(oid,true) as definition from pg_constraint where conrelid='public.reader_profile_rate_limits'::regclass order by case contype when 'p' then 0 when 'f' then 1 else 2 end,conname`;
    expect(originals.length).toBe(5);
    const restore = async () => {
      if (
        (
          await sql`select to_regclass('public.reader_profile_rate_limits_unready') is not null as present`
        )[0]?.present
      )
        await sql.unsafe(`ALTER TABLE public.${renamed} RENAME TO ${table}`);
      for (const entry of originals)
        await sql.unsafe(
          `ALTER TABLE public.${table} DROP CONSTRAINT IF EXISTS "${entry.conname}"`,
        );
      await sql.unsafe(
        `ALTER TABLE public.${table} ALTER COLUMN last_request TYPE bigint USING last_request::bigint`,
      );
      await sql.unsafe(
        `ALTER TABLE public.${table} ALTER COLUMN count SET NOT NULL`,
      );
      for (const entry of originals)
        await sql.unsafe(
          `ALTER TABLE public.${table} ADD CONSTRAINT "${entry.conname}" ${entry.definition}`,
        );
      await exactStorage(sql);
    };
    const replaceFK = async (definition: string) => {
      await sql.unsafe(
        `ALTER TABLE public.${table} DROP CONSTRAINT ${foreign}`,
      );
      await sql.unsafe(
        `ALTER TABLE public.${table} ADD CONSTRAINT ${foreign} ${definition}`,
      );
    };
    const disableFKTrigger = async (relation: "users" | typeof table) => {
      const rows =
        await sql`select quote_ident(t.tgname) as name from pg_trigger t where t.tgconstraint=(select oid from pg_constraint where conrelid='public.reader_profile_rate_limits'::regclass and conname=${foreign}) and t.tgrelid=${`public.${relation}`}::regclass order by t.tgname`;
      expect(rows.length).toBe(2);
      await sql.unsafe(
        `ALTER TABLE public.${relation} DISABLE TRIGGER ${rows[0]!.name}`,
      );
    };
    try {
      await f.start();
      started = true;
      process.env.V6B_PROFILE_OWNER_ENABLED = "true";
      process.env.V6B_PROFILE_PUBLIC_ENABLED = "false";
      expect(
        (
          await getDatabaseConnection()
            .client`select current_database()=${name} as owned`
        )[0]?.owned,
      ).toBe(true);
      const actor = await f.account("user");
      const headers = new Headers({
        Origin: f.origin,
        Cookie: actor.cookie,
        "x-real-ip": "127.89.0.1",
      });
      // Wrong-target validated FK is first while the table is still empty. Later
      // recovery probes are never refunded/reset and remain within ordinary20.
      const mutations: (() => Promise<unknown>)[] = [
        () =>
          replaceFK(
            "FOREIGN KEY (user_id) REFERENCES public.accounts(id) ON DELETE CASCADE",
          ),
        () => sql.unsafe(`ALTER TABLE public.${table} RENAME TO ${renamed}`),
        () =>
          sql.unsafe(
            `ALTER TABLE public.${table} ALTER COLUMN count DROP NOT NULL`,
          ),
        () =>
          sql.unsafe(
            `ALTER TABLE public.${table} ALTER COLUMN last_request TYPE numeric USING last_request::numeric`,
          ),
        () =>
          sql.unsafe(`ALTER TABLE public.${table} DROP CONSTRAINT ${primary}`),
        async () => {
          await sql.unsafe(
            `ALTER TABLE public.${table} DROP CONSTRAINT ${primary}`,
          );
          await sql.unsafe(
            `ALTER TABLE public.${table} ADD CONSTRAINT ${primary} PRIMARY KEY (kind,user_id)`,
          );
        },
        () =>
          sql.unsafe(`ALTER TABLE public.${table} DROP CONSTRAINT ${foreign}`),
        () =>
          replaceFK(
            "FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE NO ACTION",
          ),
        () =>
          replaceFK(
            "FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE NOT VALID",
          ),
        () =>
          replaceFK(
            "FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED",
          ),
        () =>
          replaceFK(
            "FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE",
          ),
        () => disableFKTrigger(table),
        () => disableFKTrigger("users"),
        () =>
          sql.unsafe(
            `ALTER TABLE public.${table} DROP CONSTRAINT ${checkNames[0]}`,
          ),
        () =>
          sql.unsafe(
            `ALTER TABLE public.${table} DROP CONSTRAINT ${checkNames[1]}`,
          ),
        () =>
          sql.unsafe(
            `ALTER TABLE public.${table} DROP CONSTRAINT ${checkNames[2]}`,
          ),
        async () => {
          await sql.unsafe(
            `ALTER TABLE public.${table} DROP CONSTRAINT ${checkNames[1]}`,
          );
          await sql.unsafe(
            `ALTER TABLE public.${table} ADD CONSTRAINT ${checkNames[1]} CHECK (count>=0 AND count<=100)`,
          );
        },
        async () => {
          await sql.unsafe(
            `ALTER TABLE public.${table} DROP CONSTRAINT ${checkNames[0]}`,
          );
          await sql.unsafe(
            `ALTER TABLE public.${table} ADD CONSTRAINT ${checkNames[0]} CHECK (kind IN ('ordinary','content ','withdrawal'))`,
          );
        },
        async () => {
          await sql.unsafe(
            `ALTER TABLE public.${table} DROP CONSTRAINT ${checkNames[2]}`,
          );
          await sql.unsafe(
            `ALTER TABLE public.${table} ADD CONSTRAINT ${checkNames[2]} CHECK (last_request>=0 AND last_request<=9007199254740992)`,
          );
        },
      ];
      expect(mutations.length).toBe(19);
      let recovered = 0;
      expect((await quotaDigest(sql, actor.id))?.count).toBe(0);
      for (const mutation of mutations) {
        const before = await quotaDigest(sql, actor.id);
        try {
          await mutation();
          const p = await requireReaderProfilePrincipal(headers);
          let error: unknown;
          try {
            await chargeReaderProfileAttempt(p);
          } catch (caught) {
            error = caught;
          }
          expect(error instanceof ReaderProfileFoundationError).toBe(true);
          expect(
            (error as ReaderProfileFoundationError | undefined)?.status,
          ).toBe(503);
          let bodyReads = 0;
          const request = new Request(`${f.origin}/api/reader-profile`, {
            method: "POST",
            headers,
            body: "{}",
          });
          request.headers.set("Content-Type", "application/json");
          const requestBody = request.body;
          Object.defineProperty(request, "body", {
            get() {
              bodyReads++;
              return requestBody;
            },
          });
          let bodyError: unknown;
          try {
            await readReaderProfileFoundationJson(request);
          } catch (caught) {
            bodyError = caught;
          }
          expect(
            (bodyError as ReaderProfileFoundationError | undefined)?.status,
          ).toBe(503);
          expect(bodyReads).toBe(0);
        } finally {
          await restore();
        }
        expect(await quotaDigest(sql, actor.id)).toEqual(before);
        await chargeReaderProfileAttempt(
          await requireReaderProfilePrincipal(headers),
        );
        expect(
          (
            await sql`select count from reader_profile_rate_limits where user_id=${actor.id} and kind='ordinary'`
          )[0]?.count,
        ).toBe(++recovered);
      }
      expect(recovered).toBe(19);
      await sql`delete from users where id=${actor.id}`;
      expect((await quotaDigest(sql, actor.id))?.count).toBe(0);
    } finally {
      try {
        await restore();
        if (started) await f.stop();
        else await f.client.end();
        await getDatabaseConnection().client.end();
      } finally {
        for (const [key, value] of saved) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
  });

  it("fresh/repeat migration retains44 tables17 hashes and validated composite PK/account-CASCADE FK with all internal guards enabled", async () => {
    guardedTarget();
    const journal =
      await sql`select hash,created_at from drizzle.__drizzle_migrations order by id`;
    expect(journal.length).toBe(17);
    expect(
      (
        await sql`select count(*)::int as n from pg_tables where schemaname='public'`
      )[0]?.n,
    ).toBe(44);
    expect(
      (await sql`select current_setting('statement_timeout') as timeout`)[0]
        ?.timeout,
    ).toBe("5s");
    await exactStorage(sql);
    const before = await facts(sql);
    await migrate(connection.db, { migrationsFolder: folder });
    expect(await facts(sql)).toEqual(before);
    expect(
      await sql`select hash,created_at from drizzle.__drizzle_migrations order by id`,
    ).toEqual(journal);
  });

  it("keeps original0015 SQL/snapshot and all old43 table payloads unchanged while appending one isolated table and fresh0016 lineage", async () => {
    const meta = new URL(
      "../../packages/database/drizzle/meta/",
      import.meta.url,
    );
    const oldText = await readFile(new URL("0015_snapshot.json", meta), "utf8");
    const old = JSON.parse(oldText);
    expect(createHash("sha256").update(oldText).digest("hex")).toBe(
      "27c3cd401daeff904480d3e51d4d9beb3cd51d1bf03e427ef49146eaf1ede7c7",
    );
    expect(
      createHash("sha256")
        .update(await readFile(new URL("../0015_reader_profiles.sql", meta)))
        .digest("hex"),
    ).toBe("388d590f24e1ac24259419b05741c77b0d0a165afd78d84b7d13a84982079d4c");
    const next = JSON.parse(
      await readFile(new URL("0016_snapshot.json", meta), "utf8"),
    );
    expect(old.id).toBe("f2a6990d-55a6-45fc-bc33-71280e2b3e8a");
    expect(next.prevId).toBe(old.id);
    expect(next.id).not.toBe(old.id);
    expect(next.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(old.tables).length).toBe(43);
    expect(Object.keys(next.tables).length).toBe(44);
    for (const [key, value] of Object.entries(old.tables))
      expect(next.tables[key]).toEqual(value);
    expect(
      Object.keys(next.tables).filter((key) => !(key in old.tables)),
    ).toEqual([`public.${table}`]);
    const { id: oldId, prevId: oldPrev, tables: oldTables, ...oldRest } = old;
    const {
      id: nextId,
      prevId: nextPrev,
      tables: nextTables,
      ...nextRest
    } = next;
    expect(nextRest).toEqual(oldRest);
    expect(
      Boolean(
        oldId && oldPrev && oldTables && nextId && nextPrev && nextTables,
      ),
    ).toBe(true);
    const journal = JSON.parse(
      await readFile(new URL("_journal.json", meta), "utf8"),
    );
    const history = [
      [1791430052501, "0000_strange_justin_hammer"],
      [1791434642346, "0001_nostalgic_daredevil"],
      [1791505144280, "0002_talented_cloak"],
      [1791528305955, "0003_absent_tag"],
      [1791550438644, "0004_lowly_mentor"],
      [1791552989800, "0005_misty_talisman"],
      [1791593456692, "0006_heavy_purifiers"],
      [1791601960621, "0007_luxuriant_doctor_faustus"],
      [1791630293802, "0008_yellow_mongoose"],
      [1791641702718, "0009_library_erasure_scope"],
      [1791775270821, "0010_black_ultron"],
      [1791779213928, "0011_community_actor_budget_erasure"],
      [1791815712634, "0012_community_owned_read_erasure"],
      [1791815712635, "0013_library_event_batch_replan"],
      [1792146068001, "0014_metadata_edits"],
      [1793096404023, "0015_reader_profiles"],
    ] as const;
    expect(journal.entries.length).toBe(17);
    expect(journal.entries.slice(0, 16)).toEqual(
      history.map(([when, tag], idx) => ({
        idx,
        version: "7",
        when,
        tag,
        breakpoints: true,
      })),
    );
    expect(journal.entries.map((entry: { idx: number }) => entry.idx)).toEqual(
      Array.from({ length: 17 }, (_, i) => i),
    );
    expect(journal.entries[16]).toEqual({
      idx: 16,
      version: "7",
      when: 1793289822866,
      tag: "0016_reader_profile_rate_limit_erasure",
      breakpoints: true,
    });
  });

  it("forward-applies only the isolated table over populated0015 without legacy import or changes and rolls all prototype DDL back", async () => {
    const actor = `opaque:_%|Å:${randomUUID()}`;
    await seedUser(actor);
    const legacy = ["attempt", "write", "withdraw"].map(
      (bucket) => `reader-profile.${bucket}:${actor}`,
    );
    fixtureKeys.push(...legacy);
    for (const key of legacy)
      await sql`insert into rate_limits(id,key,count,last_request) values(${randomUUID()},${key},21,12345)`;
    const shared = await sharedDigest(sql, legacy);
    const backend = await sql.reserve();
    let open = false;
    try {
      await backend`BEGIN`;
      open = true;
      await backend.unsafe(`DROP TABLE public.${table}`);
      const before = await facts(backend);
      const hashes = [
        ...(await backend`select hash,created_at from drizzle.__drizzle_migrations order by id`),
      ];
      expect(
        (
          await backend`select count(*)::int as n from pg_tables where schemaname='public'`
        )[0]?.n,
      ).toBe(43);
      await backend`SAVEPOINT forward_0016`;
      for (const statement of await ddl()) await backend.unsafe(statement);
      await exactStorage(backend);
      expect(
        (
          await backend`select count(*)::int as n from pg_tables where schemaname='public'`
        )[0]?.n,
      ).toBe(44);
      expect((await quotaDigest(backend, actor))?.count).toBe(0);
      expect(await sharedDigest(backend, legacy)).toEqual(shared);
      await backend.unsafe(`DROP TABLE public.${table}`);
      expect(await facts(backend)).toEqual(before);
      expect(
        await backend`select hash,created_at from drizzle.__drizzle_migrations order by id`,
      ).toEqual(hashes);
      await backend`ROLLBACK TO SAVEPOINT forward_0016`;
      expect(await facts(backend)).toEqual(before);
      await backend`ROLLBACK`;
      open = false;
      await exactStorage(sql);
    } finally {
      if (open) await backend`ROLLBACK`;
      backend.release();
    }
  });

  it("enforces kind/count/clock/PK/FK boundaries and cascades exactly one opaque root cohort without profile/gates while rollback and unrelated data survive", async () => {
    const actor = `BudgetEdge:_%|Å:${randomUUID()}`;
    const other = `${actor}:suffix`;
    await seedQuota(actor);
    await seedQuota(other);
    const shared = [
      ...["attempt", "write", "withdraw"].map(
        (bucket) => `reader-profile.${bucket}:${actor}`,
      ),
      `reader-profile.attempt:${actor}:suffix`,
      `catalog.write:${actor}`,
      `community.post:127.77.${randomUUID()}`,
      `auth-ip:${randomUUID()}`,
    ];
    fixtureKeys.push(...shared);
    for (const key of shared)
      await sql`insert into rate_limits(id,key,count,last_request) values(${randomUUID()},${key},9,54321)`;
    const saved = await quotaDigest(sql, actor),
      survivor = await quotaDigest(sql, other),
      oldShared = await sharedDigest(sql, shared);
    expect(saved?.count).toBe(3);
    expect(survivor?.count).toBe(3);
    expect(
      (
        await sql`select count(*)::int as n from reader_profiles where user_id=${actor}`
      )[0]?.n,
    ).toBe(0);
    await errorCode(
      sql.begin(async (tx) => {
        await tx`insert into reader_profile_rate_limits(user_id,kind,count,last_request) values(${actor},'ordinary',1,0)`;
      }),
      "23505",
    );
    const orphan = `missing-root:${randomUUID()}`;
    expect(
      (await sql`select count(*)::int as n from users where id=${orphan}`)[0]
        ?.n,
    ).toBe(0);
    await errorCode(
      sql.begin(async (tx) => {
        await tx`insert into reader_profile_rate_limits(user_id,kind,count,last_request) values(${orphan},'ordinary',1,0)`;
      }),
      "23503",
    );
    for (const [kind, count, last] of [
      ["ordinary ", 1, "0"],
      ["write", 1, "0"],
      ["ordinary", -1, "0"],
      ["ordinary", 22, "0"],
      ["content", 7, "0"],
      ["withdrawal", 12, "0"],
      ["ordinary", 1, "-1"],
      ["ordinary", 1, "9007199254740992"],
    ] as const)
      await errorCode(
        sql.begin(async (tx) => {
          await tx`update reader_profile_rate_limits set kind=${kind},count=${count},last_request=${last}::bigint where user_id=${actor} and kind='ordinary'`;
        }),
        "23514",
      );
    expect(await quotaDigest(sql, actor)).toEqual(saved);
    const oldOwner = process.env.V6B_PROFILE_OWNER_ENABLED,
      oldPublic = process.env.V6B_PROFILE_PUBLIC_ENABLED;
    process.env.V6B_PROFILE_OWNER_ENABLED = "false";
    process.env.V6B_PROFILE_PUBLIC_ENABLED = "false";
    const backend = await sql.reserve();
    let open = false;
    try {
      await backend`BEGIN`;
      open = true;
      await backend`delete from users where id=${actor}`;
      expect((await quotaDigest(backend, actor))?.count).toBe(0);
      expect(await quotaDigest(backend, other)).toEqual(survivor);
      expect(await sharedDigest(backend, shared)).toEqual(oldShared);
      await backend`ROLLBACK`;
      open = false;
      expect(await quotaDigest(sql, actor)).toEqual(saved);
      await sql`delete from users where id=${actor}`;
      expect((await quotaDigest(sql, actor))?.count).toBe(0);
      expect(await quotaDigest(sql, other)).toEqual(survivor);
      expect(await sharedDigest(sql, shared)).toEqual(oldShared);
    } finally {
      if (open) await backend`ROLLBACK`;
      backend.release();
      if (oldOwner === undefined) delete process.env.V6B_PROFILE_OWNER_ENABLED;
      else process.env.V6B_PROFILE_OWNER_ENABLED = oldOwner;
      if (oldPublic === undefined)
        delete process.env.V6B_PROFILE_PUBLIC_ENABLED;
      else process.env.V6B_PROFILE_PUBLIC_ENABLED = oldPublic;
      await sql`delete from users where id=any(${fixtureUsers}::text[])`;
      await sql`delete from rate_limits where key=any(${fixtureKeys}::text[])`;
    }
  });
});
