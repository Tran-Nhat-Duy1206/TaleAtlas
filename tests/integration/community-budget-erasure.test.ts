import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readingAuthFixture } from "../helpers/reading-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import { createWork } from "../../apps/web/src/server/catalog/service";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import { addLibraryEntry } from "../../apps/web/src/server/library/service";
import {
  communityModerationContext,
  createCommunityThread,
} from "../../apps/web/src/server/community/service";

// Real signed actors and actual PostgreSQL row locks. No authority mocks,
// application hooks, sleeps, timeout increases or planner/session adjustments.
const f = readingAuthFixture();
const sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
let admin: Actor;
const workIds: string[] = [];
const ips = new Map<string, string>();
const h = (actor: Actor) => {
  if (!ips.has(actor.id))
    ips.set(
      actor.id,
      `127.47.${Math.floor(ips.size / 250)}.${(ips.size % 250) + 1}`,
    );
  return new Headers({
    Origin: f.origin,
    Cookie: actor.cookie,
    "x-real-ip": ips.get(actor.id)!,
  });
};
function owned(actor: Actor) {
  requireTestDatabase();
  expect(
    f.users.some((u) => u.id === actor.id && u.email === actor.email),
  ).toBe(true);
}
const actorKeys = (actor: Actor) => {
  owned(actor);
  return ["post", "report", "safety", "modread"].map(
    (bucket) => `community.${bucket}:${actor.id}`,
  );
};
const threadInput = () => ({
  mutationKey: randomUUID(),
  title: "Invented budget race topic",
  body: "Entirely synthetic public text for a deterministic account-deletion race.",
  titleSpoiler: false,
  bodySpoiler: false,
  spoilerContext: null,
  publicSubmissionAcknowledged: true,
});
async function work() {
  requireTestDatabase();
  const row = (await createWork(
    {
      primaryTitle: `Budget-erasure synthetic ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      source: {
        label: f.sourceLabel,
        citation: "UUID-owned synthetic actor-budget race fixture only.",
      },
    },
    h(admin),
  )) as AdminWork;
  workIds.push(row.id);
  return row;
}
type Outcome<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };
function observed<T>(promise: Promise<T>): Promise<Outcome<T>> {
  // Attach the rejection handler immediately so held-lock failures never produce
  // unhandled rejections while the test observes a different SQL connection.
  return promise.then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason) => ({ status: "rejected" as const, reason }),
  );
}
async function blockedBy(blockerPid: number, queryFragment: string) {
  requireTestDatabase();
  const deadline = performance.now() + 2900;
  // Each iteration awaits actual PostgreSQL lock-state evidence. This is a
  // finite assertion window, not a sleep or background-job busy-poll.
  for (
    let attempt = 0;
    attempt < 256 && performance.now() < deadline;
    attempt++
  ) {
    const rows = await sql<{ pid: number; query: string }[]>`
      select a.pid,a.query from pg_stat_activity a
      where a.datname=current_database() and a.wait_event_type='Lock'
        and ${blockerPid}=any(pg_blocking_pids(a.pid))
        and position(${queryFragment} in lower(a.query)) > 0
      order by a.pid`;
    if (rows.length > 0) {
      expect(rows).toHaveLength(1);
      return rows[0];
    }
  }
  throw new Error(
    `Expected actual PostgreSQL blocker for ${queryFragment} within three seconds`,
  );
}
async function noActorKeys(actor: Actor) {
  expect(
    await sql`select id,key from rate_limits where key=any(${actorKeys(actor)}::text[])`,
  ).toHaveLength(0);
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
  await sql`delete from library_entries where user_id=any(${f.users.map((u) => u.id)}::text[])`;
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
  // Fixture teardown is UUID-owned only; these are not live-user limiter resets.
  for (const actor of f.users)
    await sql`delete from rate_limits where key=any(${actorKeys(actor)}::text[])`;
  delete process.env.V4_COMMUNITIES_ENABLED;
  await f.stop();
});

describe("V4 actor-budget account-erasure race serialization", () => {
  it("does not recreate an actor V4 budget after deletion wins between the signed guard and frozen shared-budget completion", async () => {
    const w = await work(),
      actor = await f.account("user");
    owned(actor);
    // A real V3 mutation establishes the unchanged shared30/min row: no SQL
    // fake authority, synthetic limiter reset or direct counter seeding.
    await addLibraryEntry(
      { workId: w.id, mutationKey: randomUUID() },
      h(actor),
    );
    const sharedKey = `catalog.write:${actor.id}`;
    const [before] =
      await sql`select id,key,count,last_request from rate_limits where key=${sharedKey}`;
    expect(before).toMatchObject({ key: sharedKey, count: 1 });
    await noActorKeys(actor);
    const backend = await sql.reserve();
    let transaction = false;
    let parsed = false;
    let request:
      | Promise<Outcome<Awaited<ReturnType<typeof createCommunityThread>>>>
      | undefined;
    try {
      const [settings] =
        await backend`select pg_backend_pid() as pid,current_setting('statement_timeout') as statement_timeout`;
      expect(settings.statement_timeout).toBe("5s");
      await backend`BEGIN`;
      transaction = true;
      expect(
        await backend`select id from rate_limits where key=${sharedKey} for update`,
      ).toEqual([{ id: before.id }]);
      request = observed(
        createCommunityThread(
          w.id,
          async () => {
            parsed = true;
            return threadInput();
          },
          h(actor),
        ),
      );
      // This actual request reached the legacy SQL upsert only after fetching
      // its real verified principal. The lazy privileged body is still untouched.
      const waiting = await blockedBy(Number(settings.pid), "rate_limits");
      expect(waiting.query.toLowerCase()).toContain("insert into");
      expect(parsed).toBe(false);
      // 0011 intentionally does NOT touch this frozen catalog.write key. Thus
      // root account deletion can commit while the request remains held here.
      expect(
        await sql`delete from users where id=${actor.id} and email=${actor.email} returning id`,
      ).toEqual([{ id: actor.id }]);
      expect(await sql`select id from users where id=${actor.id}`).toHaveLength(
        0,
      );
      await noActorKeys(actor);
      await backend`COMMIT`;
      transaction = false;
      expect(await request).toMatchObject({
        status: "rejected",
        reason: { status: 403 },
      });
      await noActorKeys(actor);
      expect(parsed).toBe(false);
      expect(
        await sql`select id from community_contents where author_id=${actor.id}`,
      ).toHaveLength(0);
      expect(
        await sql`select id from community_content_events where actor_id=${actor.id}`,
      ).toHaveLength(0);
      expect(
        await sql`select id from community_mutation_receipts where actor_id=${actor.id}`,
      ).toHaveLength(0);
      expect(
        await sql`select id,key,count,last_request from rate_limits where key=${sharedKey}`,
      ).toEqual([{ ...before, count: 2 }]);
    } finally {
      // Release every fixture lock BEFORE settling the request, even if a lock
      // observation/assertion fails. Nothing may continue into the next test.
      try {
        if (transaction) {
          await backend`ROLLBACK`;
          transaction = false;
        }
      } finally {
        backend.release();
        if (request) await request;
      }
    }
  });

  it("holds the persisted user fence while moderator-read budget SQL waits, so root deletion waits for that actor transaction and erases its committed keys", async () => {
    const w = await work(),
      mod = await f.account("moderator");
    owned(mod);
    const target = await createCommunityThread(w.id, threadInput(), h(admin));
    const initial = await communityModerationContext(
      w.id,
      target.content.id,
      h(mod),
    );
    expect(initial.target.id).toBe(target.content.id);
    const modKey = `community.modread:${mod.id}`;
    const [budget] =
      await sql`select id,count from rate_limits where key=${modKey}`;
    expect(budget.count).toBe(1);
    const backend = await sql.reserve();
    let transaction = false;
    let request:
      | Promise<Outcome<Awaited<ReturnType<typeof communityModerationContext>>>>
      | undefined;
    let deletion: Promise<Outcome<unknown>> | undefined;
    try {
      const [settings] =
        await backend`select pg_backend_pid() as pid,current_setting('statement_timeout') as statement_timeout`;
      expect(settings.statement_timeout).toBe("5s");
      await backend`BEGIN`;
      transaction = true;
      expect(
        await backend`select id from rate_limits where key=${modKey} for update`,
      ).toEqual([{ id: budget.id }]);
      request = observed(
        communityModerationContext(w.id, target.content.id, h(mod)),
      );
      const budgetWaiter = await blockedBy(Number(settings.pid), "rate_limits");
      expect(budgetWaiter.query.toLowerCase()).toContain("insert into");
      // pg_blocking_pids also reports soft queue blockers. Independently prove
      // the service holds this USER row before DELETE starts, not only a rate row.
      const userFence = await observed(
        sql.begin(async (probe) => {
          return await probe`select id from users where id=${mod.id} for no key update nowait`;
        }),
      );
      expect(userFence).toMatchObject({
        status: "rejected",
        reason: { code: "55P03" },
      });
      deletion = observed(
        sql`delete from users where id=${mod.id} and email=${mod.email} returning id`,
      );
      // The user DELETE must be blocked BY the request's actual user-row lock,
      // not merely by our modread-row lock in the erasure trigger. The old
      // independent upsert never held this user fence and fails this proof.
      const deletionWaiter = await blockedBy(
        Number(budgetWaiter.pid),
        "delete from users",
      );
      expect(deletionWaiter.pid).not.toBe(budgetWaiter.pid);
      await backend`COMMIT`;
      transaction = false;
      const [contextResult, deletionResult] = await Promise.all([
        request,
        deletion,
      ]);
      expect(deletionResult).toMatchObject({
        status: "fulfilled",
        value: [{ id: mod.id }],
      });
      if (contextResult.status === "rejected") {
        expect(contextResult.reason).toMatchObject({ status: 403 });
      } else {
        // A coherent read may finish before deletion. It is never an authority
        // shortcut: the public service must have re-fenced persisted role/session.
        expect(contextResult.value.target.id).toBe(target.content.id);
      }
      expect(await sql`select id from users where id=${mod.id}`).toHaveLength(
        0,
      );
      await noActorKeys(mod);
      expect(
        await sql`select id from community_contents where author_id=${mod.id}`,
      ).toHaveLength(0);
      expect(
        await sql`select id from community_content_events where actor_id=${mod.id}`,
      ).toHaveLength(0);
      expect(
        await sql`select id from community_mutation_receipts where actor_id=${mod.id}`,
      ).toHaveLength(0);
      await expect(
        communityModerationContext(w.id, target.content.id, h(mod)),
      ).rejects.toMatchObject({ status: 401 });
      await noActorKeys(mod);
    } finally {
      try {
        if (transaction) {
          await backend`ROLLBACK`;
          transaction = false;
        }
      } finally {
        backend.release();
        await Promise.all([
          ...(request ? [request] : []),
          ...(deletion ? [deletion] : []),
        ]);
      }
    }
  });
});
