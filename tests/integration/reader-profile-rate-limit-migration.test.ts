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

// Authoring only until the approved disposable PostgreSQL 17 service is present.
// No external fallback, cluster installation, FORCE drop or shared-schema DDL.
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
const guard = "reader_profile_user_erasure_budgets";
const canonicalBody = `
BEGIN
  DELETE FROM public.rate_limits WHERE key IN ('reader-profile.attempt:' || OLD.id, 'reader-profile.write:' || OLD.id, 'reader-profile.withdraw:' || OLD.id);
  RETURN OLD;
END;
`;
let created = false;
type Reader = Pick<typeof sql, "unsafe">;
const fixtureKeys: string[] = [];
const fixtureUsers: string[] = [];
const keys = (id: string) =>
  ["attempt", "write", "withdraw"].map(
    (bucket) => `reader-profile.${bucket}:${id}`,
  );
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
async function exactGuard(backend: Reader) {
  const functions = await backend.unsafe(
    `select p.oid::text,p.prorettype='pg_catalog.trigger'::regtype as trigger_return,p.pronargs,p.prosecdef,p.proconfig,p.prosrc,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname='public' and p.proname=$1`,
    [guard],
  );
  expect(functions.length).toBe(1);
  const fn = functions[0]!;
  expect(fn).toMatchObject({
    trigger_return: true,
    pronargs: 0,
    prosecdef: false,
    proconfig: ["search_path=pg_catalog, public"],
    lanname: "plpgsql",
  });
  expect(String(fn.prosrc)).toBe(canonicalBody);
  const triggers = await backend.unsafe(
    `select t.tgname,t.tgenabled,t.tgtype,t.tgnargs,t.tgqual is null as unconditional,t.tgfoid::text as function_oid,t.tgisinternal,t.tgconstraint::int from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='users' and t.tgname=$1`,
    [guard],
  );
  expect(triggers.length).toBe(1);
  expect(triggers[0]).toEqual({
    tgname: guard,
    tgenabled: "O",
    tgtype: 11,
    tgnargs: 0,
    unconditional: true,
    function_oid: fn.oid,
    tgisinternal: false,
    tgconstraint: 0,
  });
}
// Complete public schema catalog and row digests. No legacy trigger exclusions:
// call this only on both sides of a transaction in which 0016 is absent.
async function facts(backend: Reader) {
  const tables = await backend.unsafe(
    "select c.oid::text,c.relname,c.relkind,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','i','S') order by c.relname",
  );
  const columns = await backend.unsafe(
    "select c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) as default_expression from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum",
  );
  const constraints = await backend.unsafe(
    "select c.relname,k.oid::text,k.conname,pg_get_constraintdef(k.oid) as definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by c.relname,k.conname",
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
  for (const table of tables.filter((row) => row.relkind === "r")) {
    // Catalog-derived identifiers are quoted by PostgreSQL, never user input.
    const [identifier] = await backend.unsafe(
      "select quote_ident($1) as name",
      [String(table.relname)],
    );
    const [digest] = await backend.unsafe(
      `select count(*)::int as count,md5(coalesce(string_agg(row_to_json(r)::text,'|' order by row_to_json(r)::text),'')) as digest from public.${identifier!.name} r`,
    );
    data.push({ table: table.relname, ...digest });
  }
  return { tables, columns, constraints, indexes, functions, triggers, data };
}
async function digest(backend: Reader, selected: string[]) {
  return (
    await backend.unsafe(
      "select count(*)::int as count,md5(coalesce(string_agg(row_to_json(r)::text,'|' order by r.key),'')) as digest from public.rate_limits r where key=any($1::text[])",
      [selected],
    )
  )[0];
}
async function seed(id: string) {
  fixtureUsers.push(id);
  await sql`insert into users(id,name,email) values(${id},'Synthetic migration edge',${`${randomUUID()}@invalid`})`;
  const selected = keys(id);
  fixtureKeys.push(...selected);
  for (const key of selected)
    await sql`insert into rate_limits(id,key,count,last_request) values(${randomUUID()},${key},4,12345)`;
  return selected;
}

describe("0016 exact reader-profile budget erasure migration", () => {
  it("rejects missing, disabled, redirected, conditional, argumented or altered erasure guards on the owned child database before reading bodies", async () => {
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
    // Construct the existing genuine signup/SMTP/login fixture against this owned
    // child. The original application connection is initialized only afterwards.
    process.env.TEST_DATABASE_URL = target.toString();
    const f = readingAuthFixture();
    process.env.TEST_DATABASE_URL = baseURL;
    let started = false;
    const statements = await ddl();
    const restore = async () => {
      await sql`alter table public.rate_limits alter column key set not null`;
      if (
        !(
          await sql`select 1 from pg_constraint where conrelid='public.rate_limits'::regclass and conname='rate_limits_key_unique'`
        ).length
      )
        await sql`alter table public.rate_limits add constraint rate_limits_key_unique unique(key)`;
      await sql.unsafe(`DROP TRIGGER IF EXISTS ${guard} ON public.users`);
      await sql.unsafe(
        statements[0]!.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"),
      );
      await sql.unsafe(statements[1]!);
      await sql.unsafe(
        "DROP FUNCTION IF EXISTS public.reader_profile_budget_wrong_guard()",
      );
      await exactGuard(sql);
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
      const mutations = [
        [
          "ALTER TABLE public.rate_limits DROP CONSTRAINT rate_limits_key_unique",
        ],
        ["ALTER TABLE public.rate_limits ALTER COLUMN key DROP NOT NULL"],
        [`DROP TRIGGER ${guard} ON public.users`],
        [`ALTER TABLE public.users DISABLE TRIGGER ${guard}`],
        [
          "CREATE FUNCTION public.reader_profile_budget_wrong_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN OLD; END; $$",
          `DROP TRIGGER ${guard} ON public.users`,
          `CREATE TRIGGER ${guard} BEFORE DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION public.reader_profile_budget_wrong_guard()`,
        ],
        [`ALTER FUNCTION public.${guard}() SECURITY DEFINER`],
        [`ALTER FUNCTION public.${guard}() SET search_path=public`],
        [
          statements[0]!
            .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")
            .replace("RETURN OLD;", "PERFORM 1; RETURN OLD;"),
        ],
        [
          statements[0]!
            .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")
            .replace("reader-profile.attempt:", "reader-profile. attempt:"),
        ],
        [
          `DROP TRIGGER ${guard} ON public.users`,
          `CREATE TRIGGER ${guard} BEFORE DELETE ON public.users FOR EACH ROW WHEN (OLD.id IS NOT NULL) EXECUTE FUNCTION public.${guard}()`,
        ],
        [
          `DROP TRIGGER ${guard} ON public.users`,
          `CREATE TRIGGER ${guard} BEFORE DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION public.${guard}('unexpected')`,
        ],
      ];
      const actor = await f.account("user");
      const headers = new Headers({
        Origin: f.origin,
        Cookie: actor.cookie,
        "x-real-ip": "127.89.0.1",
      });
      const selected = keys(actor.id);
      let recovered = 0;
      expect((await digest(sql, selected))?.count).toBe(0);
      for (const mutation of mutations) {
        const before = await digest(sql, selected);
        try {
          for (const statement of mutation) await sql.unsafe(statement);
          const principal = await requireReaderProfilePrincipal(headers);
          let error: unknown;
          try {
            await chargeReaderProfileAttempt(principal);
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
          // readJson uses body.getReader(), not Request.text(). Observe the
          // actual body getter without substituting auth, SQL or body contents.
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
          expect(await digest(sql, selected)).toEqual(before);
        } finally {
          await restore();
        }
        // Recovered readiness is re-read, never cached across admissions.
        const principal = await requireReaderProfilePrincipal(headers);
        await chargeReaderProfileAttempt(principal);
        expect(
          (
            await sql`select count from rate_limits where key=${selected[0]!}`
          )[0]?.count,
        ).toBe(++recovered);
      }
      // Root cleanup only; every recovery probe above consumed real allowance.
      await sql`delete from users where id=${actor.id}`;
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
  it("fresh/repeat migration retains 43 tables, 17 hashes and canonical single invoker trigger", async () => {
    guardedTarget();
    const journal =
      await sql`select hash,created_at from drizzle.__drizzle_migrations order by id`;
    expect(journal.length).toBe(17);
    expect(
      (
        await sql`select count(*)::int as n from pg_tables where schemaname='public'`
      )[0]?.n,
    ).toBe(43);
    expect(
      (await sql`select current_setting('statement_timeout') as timeout`)[0]
        ?.timeout,
    ).toBe("5s");
    await exactGuard(sql);
    const before = await facts(sql);
    await migrate(connection.db, { migrationsFolder: folder });
    expect(await facts(sql)).toEqual(before);
    expect(
      await sql`select hash,created_at from drizzle.__drizzle_migrations order by id`,
    ).toEqual(journal);
  });

  it("records append-only journal lineage and an otherwise byte-identical 0015 schema snapshot", async () => {
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
    const nextText = await readFile(
      new URL("0016_snapshot.json", meta),
      "utf8",
    );
    const next = JSON.parse(nextText);
    expect(old.id).toBe("f2a6990d-55a6-45fc-bc33-71280e2b3e8a");
    expect(next.prevId).toBe(old.id);
    expect(next.id).not.toBe(old.id);
    expect(next.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      nextText
        .replace(next.id, old.id)
        .replace(`"prevId": "${old.id}"`, `"prevId": "${old.prevId}"`),
    ).toBe(oldText);
    expect(Object.keys(next.tables).length).toBe(43);
    const journal = JSON.parse(
      await readFile(new URL("_journal.json", meta), "utf8"),
    );
    expect(journal.entries.length).toBe(17);
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
    expect(journal.entries[15]).toEqual({
      idx: 15,
      version: "7",
      when: 1793096404023,
      tag: "0015_reader_profiles",
      breakpoints: true,
    });
    expect(journal.entries[16]).toEqual({
      idx: 16,
      version: "7",
      when: 1793238100884,
      tag: "0016_reader_profile_rate_limit_erasure",
      breakpoints: true,
    });
  });

  it("forward-applies over populated 0015 without changing any old OID, guard, FK, index, storage or row and rolls transactional DDL back", async () => {
    const actor = `opaque:_%|Å:${randomUUID()}`;
    await seed(actor);
    const backend = await sql.reserve();
    let open = false;
    try {
      await backend`BEGIN`;
      open = true;
      await backend.unsafe(`DROP TRIGGER ${guard} ON public.users`);
      await backend.unsafe(`DROP FUNCTION public.${guard}()`);
      const before = await facts(backend);
      const hashes = [
        ...(await backend`select hash,created_at from drizzle.__drizzle_migrations order by id`),
      ];
      await backend`SAVEPOINT forward_0016`;
      for (const statement of await ddl()) await backend.unsafe(statement);
      await exactGuard(backend);
      expect(
        (
          await backend`select count(*)::int as n from pg_tables where schemaname='public'`
        )[0]?.n,
      ).toBe(43);
      // Remove only the newly introduced objects within this transaction, then
      // compare every old catalog fact including all historical erasure guards.
      await backend.unsafe(`DROP TRIGGER ${guard} ON public.users`);
      await backend.unsafe(`DROP FUNCTION public.${guard}()`);
      expect(await facts(backend)).toEqual(before);
      expect(
        await backend`select hash,created_at from drizzle.__drizzle_migrations order by id`,
      ).toEqual(hashes);
      await backend`ROLLBACK TO SAVEPOINT forward_0016`;
      expect(await facts(backend)).toEqual(before);
      await backend`ROLLBACK`;
      open = false;
      await exactGuard(sql);
    } finally {
      if (open) await backend`ROLLBACK`;
      backend.release();
    }
  });

  it("erases three exact opaque TEXT keys without a profile or feature gate, rollback restores them and unrelated namespaces survive", async () => {
    // Synthetic identifiers are permitted only for migration/erasure edges.
    const actor = `BudgetEdge:_%|Å:${randomUUID()}`;
    const selected = await seed(actor);
    const other = await seed(`${actor}:suffix`);
    const unrelated = [
      ...other,
      `${selected[0]}:suffix`,
      `catalog.write:${actor}`,
      `community.post:127.77.${randomUUID()}`,
      `auth-ip:${randomUUID()}`,
    ];
    for (const key of unrelated.filter((key) => !other.includes(key))) {
      fixtureKeys.push(key);
      await sql`insert into rate_limits(id,key,count,last_request) values(${randomUUID()},${key},9,54321)`;
    }
    const saved = await digest(sql, selected);
    const survivors = await digest(sql, unrelated);
    expect(saved?.count).toBe(3);
    expect(
      (
        await sql`select count(*)::int as n from reader_profiles where user_id=${actor}`
      )[0]?.n,
    ).toBe(0);
    const oldOwner = process.env.V6B_PROFILE_OWNER_ENABLED;
    const oldPublic = process.env.V6B_PROFILE_PUBLIC_ENABLED;
    process.env.V6B_PROFILE_OWNER_ENABLED = "false";
    process.env.V6B_PROFILE_PUBLIC_ENABLED = "false";
    const backend = await sql.reserve();
    let open = false;
    try {
      await backend`BEGIN`;
      open = true;
      await backend`delete from users where id=${actor}`;
      expect((await digest(backend, selected))?.count).toBe(0);
      expect(await digest(backend, unrelated)).toEqual(survivors);
      await backend`ROLLBACK`;
      open = false;
      expect(await digest(sql, selected)).toEqual(saved);
      await sql`delete from users where id=${actor}`;
      expect((await digest(sql, selected))?.count).toBe(0);
      expect(await digest(sql, unrelated)).toEqual(survivors);
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
