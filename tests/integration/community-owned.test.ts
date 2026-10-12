import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readingAuthFixture } from "../helpers/reading-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import { createWork } from "../../apps/web/src/server/catalog/service";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import {
  createCommunityThread,
  createCommunityReply,
  createCommunityReview,
  getOwnedCommunityContent,
  listOwnedCommunityContents,
  moderateCommunityContent,
} from "../../apps/web/src/server/community/service";

const f = readingAuthFixture(),
  sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
let admin: Actor;
const workIds: string[] = [];
const h = (actor: Actor) =>
  new Headers({ Origin: f.origin, Cookie: actor.cookie });
const ownKey = (actor: Actor) => `community.ownread:${actor.id}`;
const body = () => ({
  mutationKey: randomUUID(),
  title: `Synthetic hidden title ${randomUUID()}`,
  body: `Synthetic hidden body ${randomUUID()}`,
  titleSpoiler: true,
  bodySpoiler: true,
  spoilerContext: `Synthetic context ${randomUUID()}`,
  publicSubmissionAcknowledged: true,
});
async function work() {
  requireTestDatabase();
  const w = (await createWork(
    {
      primaryTitle: `Owned metadata synthetic ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      source: {
        label: f.sourceLabel,
        citation: "UUID-owned synthetic metadata test only.",
      },
    },
    h(admin),
  )) as AdminWork;
  workIds.push(w.id);
  return w;
}
function assertOwned(actor: Actor) {
  requireTestDatabase();
  expect(
    f.users.some((u) => u.id === actor.id && u.email === actor.email),
  ).toBe(true);
}
type Outcome<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };
const observed = <T>(promise: Promise<T>): Promise<Outcome<T>> =>
  promise.then(
    (value) => ({ status: "fulfilled", value }),
    (reason) => ({ status: "rejected", reason }),
  );
async function blockedBy(pid: number, fragment: string) {
  requireTestDatabase();
  const deadline = performance.now() + 2900;
  for (
    let attempt = 0;
    attempt < 256 && performance.now() < deadline;
    attempt++
  ) {
    const rows = await sql<
      { pid: number; query: string }[]
    >`select a.pid,a.query from pg_stat_activity a
      where a.datname=current_database() and a.wait_event_type='Lock'
        and ${pid}=any(pg_blocking_pids(a.pid)) and position(${fragment} in lower(a.query)) > 0`;
    if (rows.length) {
      expect(rows).toHaveLength(1);
      return rows[0]!;
    }
  }
  throw new Error(
    "Expected actual PostgreSQL lock state within unchanged finite assertion window",
  );
}
beforeAll(async () => {
  requireTestDatabase();
  await f.start();
  process.env.V4_COMMUNITIES_ENABLED = "true";
  admin = await f.account("admin");
});
afterAll(async () => {
  requireTestDatabase();
  for (const depth of [2, 1, 0])
    await sql`delete from community_contents where work_id=any(${workIds}::uuid[]) and kind='REPLY' and depth=${depth}`;
  await sql`delete from community_contents where work_id=any(${workIds}::uuid[])`;
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
  delete process.env.V4_COMMUNITIES_ENABLED;
  await f.stop();
});

describe("V4B private owner metadata, dedicated quota and erasure", () => {
  it("projects an explicit metadata allowlist without authored text, identity, history or V3 participation prerequisite", async () => {
    const w = await work(),
      actor = await f.account("user"),
      input = body();
    const target = await createCommunityThread(w.id, input, h(actor));
    const meta = await getOwnedCommunityContent(
      w.id,
      target.content.id,
      { contentKind: "THREAD" },
      h(actor),
    );
    expect(Object.keys(meta).sort()).toEqual(
      [
        "id",
        "workId",
        "kind",
        "threadId",
        "parentId",
        "depth",
        "revision",
        "authorState",
        "moderationState",
        "workAvailable",
        "canEdit",
        "canWithdraw",
      ].sort(),
    );
    expect(meta).toMatchObject({
      id: target.content.id,
      revision: 1,
      workAvailable: true,
      canEdit: true,
      canWithdraw: true,
    });
    const serialized = JSON.stringify(
      await listOwnedCommunityContents({ locale: "vi" }, h(actor)),
    );
    for (const needle of [
      input.title,
      input.body,
      input.spoilerContext,
      actor.id,
      actor.email,
    ])
      expect(serialized).not.toContain(needle);
    expect(
      await sql`select id from library_entries where user_id=${actor.id}`,
    ).toHaveLength(0);
    expect(
      (
        await sql`select title,body from community_contents where id=${target.content.id}`
      )[0],
    ).toMatchObject({ title: input.title, body: input.body });
  });
  it("excludes reviews and disables editing behind hidden ancestry without overfetching text", async () => {
    const w = await work(),
      owner = await f.account("user"),
      mod = await f.account("moderator");
    const root = await createCommunityThread(w.id, body(), h(owner));
    const reply = await createCommunityReply(
      w.id,
      {
        mutationKey: randomUUID(),
        threadId: root.content.id,
        parentId: null,
        depth: 0,
        body: "Synthetic reply only",
        bodySpoiler: false,
        spoilerContext: null,
        publicSubmissionAcknowledged: true,
      },
      h(owner),
    );
    await createCommunityReview(
      w.id,
      {
        mutationKey: randomUUID(),
        body: "An entirely synthetic review fixture independent of private library values.",
        rating: null,
        bodySpoiler: false,
        spoilerContext: null,
        publicSubmissionAcknowledged: true,
      },
      h(owner),
    );
    await moderateCommunityContent(
      w.id,
      root.content.id,
      {
        mutationKey: randomUUID(),
        action: "HIDE",
        contentKind: "THREAD",
        expectedRevision: 1,
        reportId: null,
        expectedReportRevision: null,
        reason: "Synthetic moderation eligibility fixture",
      },
      h(mod),
    );
    expect(
      await getOwnedCommunityContent(
        w.id,
        reply.content.id,
        { contentKind: "REPLY" },
        h(owner),
      ),
    ).toMatchObject({ canEdit: false, canWithdraw: true });
    const list = await listOwnedCommunityContents({ locale: "en" }, h(owner));
    expect(list.items).toHaveLength(2);
    expect(list.items.every((row) => row.kind !== ("REVIEW" as string))).toBe(
      true,
    );
    await sql`update works set visibility='DRAFT' where id=${w.id}`;
    expect(
      await getOwnedCommunityContent(
        w.id,
        root.content.id,
        { contentKind: "THREAD" },
        h(owner),
      ),
    ).toMatchObject({
      workAvailable: false,
      canEdit: false,
      canWithdraw: true,
      moderationState: "HIDDEN",
    });
  });
  it("uses bounded UUID-descending pages and null keysets, never authored dates", async () => {
    const w = await work(),
      actor = await f.account("user");
    assertOwned(actor);
    // Guarded synthetic capacity fixture, not claimed live posting through a quota.
    for (let index = 0; index < 28; index++)
      await sql`insert into community_contents(id,work_id,kind,author_id,title,body) values(${randomUUID()},${w.id},'THREAD',${actor.id},'Synthetic page fixture','Synthetic plain page fixture')`;
    const first = await listOwnedCommunityContents({ locale: "en" }, h(actor));
    expect(first.items).toHaveLength(25);
    expect(first.items.map((row) => row.id)).toEqual(
      first.items
        .map((row) => row.id)
        .sort()
        .reverse(),
    );
    const last = first.items.at(-1)!;
    const second = await listOwnedCommunityContents(
      { locale: "en", cursor: { id: last.id, timestamp: null } },
      h(actor),
    );
    expect(second.items).toHaveLength(3);
    expect(
      second.items.every(
        (row) => !first.items.some((one) => one.id === row.id),
      ),
    ).toBe(true);
    await expect(
      listOwnedCommunityContents({ locale: "en", page: 201 }, h(actor)),
    ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      listOwnedCommunityContents(
        {
          locale: "en",
          cursor: { id: last.id, timestamp: new Date().toISOString() },
        },
        h(actor),
      ),
    ).rejects.toMatchObject({ name: "ZodError" });
  });
  it("charges ownread60 including malformed attempts and does not use shared, moderation, safety or private-library budgets", async () => {
    const actor = await f.account("user");
    let parsed = 0;
    for (let attempt = 0; attempt < 60; attempt++)
      await expect(
        listOwnedCommunityContents(async () => {
          parsed++;
          return { locale: "en", page: 201 };
        }, h(actor)),
      ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      listOwnedCommunityContents(async () => {
        parsed++;
        return { locale: "en" };
      }, h(actor)),
    ).rejects.toMatchObject({ status: 429 });
    expect(parsed).toBe(60);
    expect(
      (await sql`select count from rate_limits where key=${ownKey(actor)}`)[0]
        ?.count,
    ).toBe(61);
    expect(
      await sql`select key from rate_limits where key=any(${[`catalog.write:${actor.id}`, `community.modread:${actor.id}`, `community.safety:${actor.id}`, `library.read:${actor.id}`]}::text[])`,
    ).toHaveLength(0);
  });
  it("revalidates actual persisted session after a charged lazy query and before any owner rows", async () => {
    const actor = await f.account("user");
    assertOwned(actor);
    await expect(
      listOwnedCommunityContents(async () => {
        await sql`delete from sessions where user_id=${actor.id}`;
        return { locale: "en" };
      }, h(actor)),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      (await sql`select count from rate_limits where key=${ownKey(actor)}`)[0]
        ?.count,
    ).toBe(1);
  });
  it("erases exactly the fifth actor key atomically, restores it on rollback and preserves unrelated/shared fingerprints", async () => {
    const w = await work(),
      actor = await f.account("user"),
      other = await f.account("user");
    assertOwned(actor);
    assertOwned(other);
    const target = await createCommunityThread(w.id, body(), h(actor));
    await listOwnedCommunityContents({ locale: "en" }, h(actor));
    await listOwnedCommunityContents({ locale: "en" }, h(other));
    const keptKeys = [`catalog.write:${actor.id}`, ownKey(other)];
    const before =
      await sql`select id,key,count,last_request from rate_limits where key=any(${keptKeys}::text[]) order by key`;
    const ownBefore =
      await sql`select id,key,count,last_request from rate_limits where key=${ownKey(actor)}`;
    expect(ownBefore).toHaveLength(1);
    const backend = await sql.reserve();
    let transaction = false;
    try {
      await backend`BEGIN`;
      transaction = true;
      await backend`delete from users where id=${actor.id} and email=${actor.email}`;
      expect(
        await backend`select key from rate_limits where key=${ownKey(actor)}`,
      ).toHaveLength(0);
      expect(
        await backend`select id,key,count,last_request from rate_limits where key=any(${keptKeys}::text[]) order by key`,
      ).toEqual(before);
      await backend`ROLLBACK`;
      transaction = false;
      expect(
        await sql`select id,key,count,last_request from rate_limits where key=${ownKey(actor)}`,
      ).toEqual(ownBefore);
      await sql`delete from users where id=${actor.id} and email=${actor.email}`;
      expect(
        await sql`select key from rate_limits where key=${ownKey(actor)}`,
      ).toHaveLength(0);
      expect(
        await sql`select id,key,count,last_request from rate_limits where key=any(${keptKeys}::text[]) order by key`,
      ).toEqual(before);
      expect(
        (
          await sql`select author_id,author_state,title,body from community_contents where id=${target.content.id}`
        )[0],
      ).toMatchObject({
        author_id: null,
        author_state: "ERASED",
        title: "",
        body: "",
      });
    } finally {
      if (transaction) await backend`ROLLBACK`;
      backend.release();
    }
  });
  it("cannot recreate ownread when actual users deletion wins before the held identity fence", async () => {
    const actor = await f.account("user");
    assertOwned(actor);
    const backend = await sql.reserve();
    let transaction = false,
      parsed = false;
    let request: Promise<Outcome<unknown>> | undefined;
    try {
      const [settings] =
        await backend`select pg_backend_pid() as pid,current_setting('statement_timeout') as statement_timeout`;
      expect(settings.statement_timeout).toBe("5s");
      await backend`BEGIN`;
      transaction = true;
      await backend`select id from users where id=${actor.id} for update`;
      request = observed(
        listOwnedCommunityContents(async () => {
          parsed = true;
          return { locale: "en" };
        }, h(actor)),
      );
      await blockedBy(Number(settings.pid), "no key update");
      expect(parsed).toBe(false);
      await backend`delete from users where id=${actor.id} and email=${actor.email}`;
      await backend`COMMIT`;
      transaction = false;
      expect(await request).toMatchObject({
        status: "rejected",
        reason: { status: 403 },
      });
      expect(parsed).toBe(false);
      expect(
        await sql`select key from rate_limits where key=${ownKey(actor)}`,
      ).toHaveLength(0);
    } finally {
      try {
        if (transaction) await backend`ROLLBACK`;
      } finally {
        backend.release();
        if (request) await request;
      }
    }
  });
  it("holds the actual users fence while ownread upsert waits and deletion erases its committed key", async () => {
    const actor = await f.account("user");
    assertOwned(actor);
    await listOwnedCommunityContents({ locale: "en" }, h(actor));
    const [budget] =
      await sql`select id from rate_limits where key=${ownKey(actor)}`;
    const backend = await sql.reserve();
    let transaction = false;
    let request: Promise<Outcome<unknown>> | undefined,
      deletion: Promise<Outcome<unknown>> | undefined;
    try {
      const [settings] =
        await backend`select pg_backend_pid() as pid,current_setting('statement_timeout') as statement_timeout`;
      expect(settings.statement_timeout).toBe("5s");
      await backend`BEGIN`;
      transaction = true;
      await backend`select id from rate_limits where id=${budget.id} for update`;
      request = observed(
        listOwnedCommunityContents({ locale: "en" }, h(actor)),
      );
      const waiter = await blockedBy(Number(settings.pid), "rate_limits");
      expect(
        await observed(
          sql.begin(
            async (probe) =>
              probe`select id from users where id=${actor.id} for no key update nowait`,
          ),
        ),
      ).toMatchObject({ status: "rejected", reason: { code: "55P03" } });
      deletion = observed(
        sql`delete from users where id=${actor.id} and email=${actor.email} returning id`,
      );
      await blockedBy(Number(waiter.pid), "delete from users");
      await backend`COMMIT`;
      transaction = false;
      const [read, removed] = await Promise.all([request, deletion]);
      expect(removed).toMatchObject({
        status: "fulfilled",
        value: [{ id: actor.id }],
      });
      if (read.status === "rejected")
        expect(read.reason).toMatchObject({ status: 403 });
      else expect(read.value).toEqual({ items: [], pageSize: 25 }); // Coherent read-before-deletion is also permitted.
      expect(
        await sql`select key from rate_limits where key=${ownKey(actor)}`,
      ).toHaveLength(0);
      await expect(
        listOwnedCommunityContents({ locale: "en" }, h(actor)),
      ).rejects.toMatchObject({ status: 401 });
    } finally {
      try {
        if (transaction) await backend`ROLLBACK`;
      } finally {
        backend.release();
        await Promise.all([
          ...(request ? [request] : []),
          ...(deletion ? [deletion] : []),
        ]);
      }
    }
  });
  it("applies forward0012 over populated old-function state with unchanged invoker/trigger/legacy identities and rolls back all prototype DDL", async () => {
    const actor = await f.account("user");
    assertOwned(actor);
    await listOwnedCommunityContents({ locale: "en" }, h(actor));
    const oldSql = await readFile(
      new URL(
        "../../packages/database/drizzle/0011_community_actor_budget_erasure.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const forwardSql = await readFile(
      new URL(
        "../../packages/database/drizzle/0012_community_owned_read_erasure.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const backend = await sql.reserve();
    let transaction = false;
    const facts = async () =>
      (
        await backend`select p.oid::text as function_oid,p.prosecdef,p.proconfig,t.oid::text as trigger_oid,
      (select oid::text from pg_proc where oid=to_regprocedure('public.library_user_erasure_replan()')) as library_oid
      from pg_proc p join pg_trigger t on t.tgfoid=p.oid where p.oid=to_regprocedure('public.community_user_erasure_budgets()') and t.tgname='community_user_erasure_budgets' and not t.tgisinternal`
      )[0];
    try {
      const before = await facts();
      expect(before.prosecdef).toBe(false);
      expect(before.proconfig).toEqual(["search_path=pg_catalog, public"]);
      await backend`BEGIN`;
      transaction = true;
      await backend.unsafe(
        oldSql
          .split("--> statement-breakpoint")[0]!
          .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"),
      );
      expect(
        (
          await backend`select pg_get_functiondef(to_regprocedure('public.community_user_erasure_budgets()')) as definition`
        )[0]?.definition,
      ).not.toContain("community.ownread:");
      expect(
        await backend`select key from rate_limits where key=${ownKey(actor)}`,
      ).toHaveLength(1);
      await backend.unsafe(forwardSql);
      expect(await facts()).toEqual(before);
      await backend`delete from users where id=${actor.id} and email=${actor.email}`;
      expect(
        await backend`select key from rate_limits where key=${ownKey(actor)}`,
      ).toHaveLength(0);
      await backend`ROLLBACK`;
      transaction = false;
      expect(await facts()).toEqual(before);
      expect(
        await sql`select key from rate_limits where key=${ownKey(actor)}`,
      ).toHaveLength(1);
    } finally {
      if (transaction) await backend`ROLLBACK`;
      backend.release();
    }
  });
});
