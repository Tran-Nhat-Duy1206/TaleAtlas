import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAuth } from "../../apps/web/src/server/auth";
import { ReaderProfileFoundationError } from "../../apps/web/src/features/reader-profile/http-contracts";
import {
  requireReaderProfilePrincipal,
  type ReaderProfilePrincipal,
} from "../../apps/web/src/server/reader-profile/authority";
import {
  chargeReaderProfileAttempt,
  type ReaderProfileAttemptClass,
} from "../../apps/web/src/server/reader-profile/rate-limits";
import { readingAuthFixture } from "../helpers/reading-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";

// Unconditional real-PG cases: genuine signup/SMTP verification/login and opaque
// signed principals. No fabricated business authority, transaction mocks, sleeps,
// client-clock overrides, planner adjustments or timeout increases.
const f = readingAuthFixture();
const sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
type Outcome = { ok: true } | { ok: false; error: unknown };
const observe = (promise: Promise<unknown>): Promise<Outcome> =>
  promise.then(
    () => ({ ok: true }),
    (error: unknown) => ({ ok: false, error }),
  );
const ips = new Map<string, string>();
function headers(actor: Actor) {
  if (!ips.has(actor.id))
    ips.set(
      actor.id,
      `127.91.${Math.floor(ips.size / 250)}.${(ips.size % 250) + 1}`,
    );
  return new Headers({
    Origin: f.origin,
    Cookie: actor.cookie,
    "x-real-ip": ips.get(actor.id)!,
  });
}
function owned(actor: Actor) {
  requireTestDatabase();
  expect(
    f.users.some((user) => user.id === actor.id && user.email === actor.email),
  ).toBe(true);
}
const kinds = ["ordinary", "content", "withdrawal"] as const;
function legacyKeys(actor: Actor) {
  owned(actor);
  return ["attempt", "write", "withdraw"].map(
    (bucket) => `reader-profile.${bucket}:${actor.id}`,
  );
}
// Resolve the pinned key constructor from the existing owning dependency, never
// guess its separator or reset a shared/global authentication bucket.
const webRequire = createRequire(
  new URL("../../apps/web/package.json", import.meta.url),
);
const authRequire = createRequire(webRequire.resolve("better-auth"));
const { createRateLimitKey } = authRequire("@better-auth/core/utils/ip") as {
  createRateLimitKey: (ip: string, path: string) => string;
};
const principal = (actor: Actor) =>
  requireReaderProfilePrincipal(headers(actor));
async function charge(
  actor: Actor,
  kind: ReaderProfileAttemptClass = "ordinary",
) {
  return chargeReaderProfileAttempt(await principal(actor), kind);
}
async function counts(actor: Actor) {
  const result: number[] = [];
  owned(actor);
  for (const kind of kinds) {
    const rows =
      await sql`select count from reader_profile_rate_limits where user_id=${actor.id} and kind=${kind}`;
    expect(rows.length <= 1).toBe(true);
    result.push(rows.length ? Number(rows[0]!.count) : 0);
  }
  return result;
}
async function digest(actor: Actor) {
  owned(actor);
  return (
    await sql`select count(*)::int as count,md5(coalesce(string_agg(row_to_json(r)::text,'|' order by r.kind),'')) as digest from reader_profile_rate_limits r where r.user_id=${actor.id}`
  )[0];
}
async function sharedDigest(selected: string[]) {
  requireTestDatabase();
  return (
    await sql`select count(*)::int as count,md5(coalesce(string_agg(row_to_json(r)::text,'|' order by r.key),'')) as digest from rate_limits r where r.key=any(${selected}::text[])`
  )[0];
}
function denied(result: Outcome, status: number) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  const error = result.error as ReaderProfileFoundationError | undefined;
  expect(error instanceof ReaderProfileFoundationError).toBe(true);
  expect(error?.status).toBe(status);
  if (status === 429) {
    expect(error?.code).toBe("RATE_LIMITED");
    expect(Number.isInteger(error?.retryAfterSeconds)).toBe(true);
    expect(
      error!.retryAfterSeconds! >= 1 && error!.retryAfterSeconds! <= 60,
    ).toBe(true);
  }
}
async function sessionId(actor: Actor) {
  owned(actor);
  const session = await getAuth().api.getSession({ headers: headers(actor) });
  expect(
    Boolean(
      session &&
      session.user.id === actor.id &&
      session.session.userId === actor.id,
    ),
  ).toBe(true);
  if (!session) throw new Error("Owned verified session missing");
  return session.session.id;
}
async function blockedBy(pid: number, fragment: string) {
  const deadline = performance.now() + 2900;
  for (
    let attempt = 0;
    attempt < 256 && performance.now() < deadline;
    attempt++
  ) {
    const rows = await sql<
      { pid: number; query: string }[]
    >`select a.pid,a.query from pg_stat_activity a where a.datname=current_database() and a.wait_event_type='Lock' and ${pid}=any(pg_blocking_pids(a.pid)) and position(${fragment} in lower(a.query))>0 order by a.pid`;
    if (rows.length) {
      expect(rows.length).toBe(1);
      return rows[0]!;
    }
  }
  throw new Error(
    "Expected owned physical PostgreSQL lock barrier within three seconds",
  );
}
const envNames = [
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
const savedEnv = new Map(envNames.map((key) => [key, process.env[key]]));
beforeAll(async () => {
  requireTestDatabase();
  await f.start();
  process.env.V6B_PROFILE_OWNER_ENABLED = "true";
  process.env.V6B_PROFILE_PUBLIC_ENABLED = "false";
});
afterAll(async () => {
  try {
    requireTestDatabase();
    await f.stop();
  } finally {
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

describe("reader-profile committed fixed-window admission with real signed actors", () => {
  it("ignores locked legacy shared prefixes during admission and root erasure without importing, deleting or resurrecting them", async () => {
    const actor = await f.account("user");
    const other = await f.account("user");
    await charge(other, "content");
    await charge(other, "withdrawal");
    const otherBefore = await digest(other);
    // Mint genuine capabilities before seeding: no auth housekeeping is invoked
    // between the controlled legacy snapshot, admission and direct SQL deletion.
    const content = await principal(actor);
    const withdrawal = await principal(actor);
    const stale = await principal(actor);
    const shared = [
      ...legacyKeys(actor),
      `catalog.write:${actor.id}`,
      `auth-isolation:${randomUUID()}`,
    ];
    const backend = await sql.reserve();
    let open = false;
    try {
      for (const key of shared)
        await sql`insert into rate_limits(id,key,count,last_request) values(${randomUUID()},${key},21,12345)`;
      const before = await sharedDigest(shared);
      expect(before?.count).toBe(shared.length);
      expect(await counts(actor)).toEqual([0, 0, 0]);
      await backend`BEGIN`;
      open = true;
      await backend`select id from rate_limits where key=any(${shared}::text[]) for update`;
      await chargeReaderProfileAttempt(content, "content");
      await chargeReaderProfileAttempt(withdrawal, "withdrawal");
      expect(await counts(actor)).toEqual([1, 1, 1]);
      expect((await digest(actor))?.count).toBe(3);
      expect(await sharedDigest(shared)).toEqual(before);
      await sql`delete from users where id=${actor.id}`;
      expect(await counts(actor)).toEqual([0, 0, 0]);
      denied(await observe(chargeReaderProfileAttempt(stale)), 403);
      expect(await sharedDigest(shared)).toEqual(before);
      expect(await digest(other)).toEqual(otherBefore);
      await backend`COMMIT`;
      open = false;
    } finally {
      if (open) await backend`ROLLBACK`;
      backend.release();
      await sql`delete from rate_limits where key=any(${shared}::text[])`;
    }
  });

  it("actually exercises expired Better Auth shared-store pruning without changing any active isolated quota row", async () => {
    const actor = await f.account("user");
    await charge(actor, "content");
    await charge(actor, "withdrawal");
    const before = await digest(actor);
    expect(before?.count).toBe(3);
    const h = headers(actor);
    const client = randomUUID().replaceAll("-", "");
    const ip = `127.${2 + (parseInt(client.slice(0, 2), 16) % 250)}.${parseInt(client.slice(2, 4), 16)}.${parseInt(client.slice(4, 6), 16)}`;
    h.set("x-real-ip", ip);
    const authKey = createRateLimitKey(ip, "/get-session");
    const shared = [
      ...legacyKeys(actor),
      `auth-expired-isolation:${randomUUID()}`,
    ];
    const readSession = () =>
      getAuth().handler(
        new Request(`${f.origin}/api/auth/get-session`, { headers: h }),
      );
    let authBucketOwned = false;
    try {
      // Do not expire a pre-existing bucket belonging to another test/client.
      // A collision fails this precondition rather than causing reset or retry.
      expect(
        (
          await sql`select count(*)::int as n from rate_limits where key=${authKey}`
        )[0]?.n,
      ).toBe(0);
      const firstSession = await readSession();
      authBucketOwned = true;
      expect(firstSession.status).toBe(200);
      const bucket =
        await sql`select count from rate_limits where key=${authKey}`;
      expect(bucket.length).toBe(1);
      expect(
        Number(bucket[0]?.count) >= 1 && Number(bucket[0]?.count) < 100,
      ).toBe(true);
      // Controlled expiry of this exact owned below-cap auth bucket is not a
      // limiter bypass/reset: the next real handler must take its normal expired
      // existing-row reset path. No session, rule, clock or auth implementation changes.
      await sql`update rate_limits set last_request=0 where key=${authKey}`;
      for (const key of shared)
        await sql`insert into rate_limits(id,key,count,last_request) values(${randomUUID()},${key},1,0)`;
      expect((await sharedDigest(shared))?.count).toBe(shared.length);
      expect((await readSession()).status).toBe(200);
      const [reset] =
        await sql`select count=1 and last_request>0 as reset from rate_limits where key=${authKey}`;
      expect(reset?.reset).toBe(true);
      // This proves pruning actually ran; a merely successful auth response is
      // insufficient evidence of the foreign writer's cleanup branch.
      expect((await sharedDigest(shared))?.count).toBe(0);
      expect(await digest(actor)).toEqual(before);
      const [active] =
        await sql`select count(*)::int as count,bool_and(last_request<=floor(extract(epoch from clock_timestamp())*1000)::bigint and floor(extract(epoch from clock_timestamp())*1000)::bigint-last_request<60000) as active from reader_profile_rate_limits where user_id=${actor.id}`;
      expect(active?.count).toBe(3);
      expect(active?.active).toBe(true);
      expect(await counts(actor)).toEqual([1, 1, 1]);
    } finally {
      await sql`delete from rate_limits where key=any(${[...(authBucketOwned ? [authKey] : []), ...shared]}::text[])`;
    }
  });
  for (const [kind, cap, saturated] of [
    ["ordinary", 20, [21, 0, 0]],
    ["content", 5, [8, 6, 0]],
    ["withdrawal", 10, [0, 0, 11]],
  ] as const) {
    it(`admits exactly ${cap} ${kind} attempts and commits saturated denials`, async () => {
      const actor = await f.account("user");
      for (let i = 0; i < cap; i++) await charge(actor, kind);
      expect(await counts(actor)).toEqual(
        kind === "ordinary"
          ? [20, 0, 0]
          : kind === "content"
            ? [5, 5, 0]
            : [0, 0, 10],
      );
      for (let i = 0; i < 3; i++)
        denied(await observe(charge(actor, kind)), 429);
      expect(await counts(actor)).toEqual(saturated);
    });
  }

  it("charges content to ordinary and write together even when either is denied; withdrawal remains independent", async () => {
    const actor = await f.account("user");
    for (let i = 0; i < 20; i++) await charge(actor);
    denied(await observe(charge(actor, "content")), 429);
    expect(await counts(actor)).toEqual([21, 1, 0]);
    for (let i = 0; i < 10; i++) await charge(actor, "withdrawal");
    expect(await counts(actor)).toEqual([21, 1, 10]);
    const second = await f.account("user");
    for (let i = 0; i < 5; i++) await charge(second, "content");
    denied(await observe(charge(second, "content")), 429);
    await charge(second);
    expect(await counts(second)).toEqual([7, 6, 0]);
    expect(await counts(actor)).toEqual([21, 1, 10]);
  });

  it("withdrawal exhaustion does not consume ordinary/content allowance or another signed actor's allowance", async () => {
    const actor = await f.account("user");
    const other = await f.account("user");
    for (let i = 0; i < 10; i++) await charge(actor, "withdrawal");
    denied(await observe(charge(actor, "withdrawal")), 429);
    await charge(actor);
    await charge(actor, "content");
    await charge(other, "content");
    expect(await counts(actor)).toEqual([2, 1, 11]);
    expect(await counts(other)).toEqual([1, 1, 0]);
  });

  it("preserves the fixed database anchor through allowed and denied attempts rather than sliding it", async () => {
    const actor = await f.account("user");
    await charge(actor, "content");
    const anchor = async () =>
      (
        await sql`select md5(string_agg(last_request::text,'|' order by kind)) as digest from reader_profile_rate_limits where user_id=${actor.id}`
      )[0]?.digest;
    const before = await anchor();
    for (let i = 1; i < 5; i++) await charge(actor, "content");
    denied(await observe(charge(actor, "content")), 429);
    expect(await anchor()).toBe(before);
    expect(await counts(actor)).toEqual([6, 6, 0]);
  });

  it("resets expired owned anchors using the database clock without sleeps or a client-clock input", async () => {
    const actor = await f.account("user");
    await charge(actor, "content");
    await charge(actor, "withdrawal");
    await sql`update reader_profile_rate_limits set count=case when kind='ordinary' then 21 when kind='content' then 6 else 11 end,last_request=floor(extract(epoch from clock_timestamp())*1000)::bigint-60001 where user_id=${actor.id}`;
    const [before] =
      await sql`select floor(extract(epoch from clock_timestamp())*1000)::bigint as at`;
    await charge(actor, "content");
    await charge(actor, "withdrawal");
    expect(await counts(actor)).toEqual([1, 1, 1]);
    const [fresh] =
      await sql`select bool_and(last_request>=${before!.at}::bigint and last_request<=floor(extract(epoch from clock_timestamp())*1000)::bigint) as fresh from reader_profile_rate_limits where user_id=${actor.id}`;
    expect(fresh?.fresh).toBe(true);
  });

  for (const [kind, cap, n, expected] of [
    ["ordinary", 20, 28, [21, 0, 0]],
    ["content", 5, 12, [12, 6, 0]],
    ["withdrawal", 10, 18, [0, 0, 11]],
  ] as const) {
    it(`serializes concurrent fresh signed ${kind} capabilities to the exact cap`, async () => {
      const actor = await f.account("user");
      const principals = await Promise.all(
        Array.from({ length: n }, () => principal(actor)),
      );
      const results = await Promise.all(
        principals.map((p) => observe(chargeReaderProfileAttempt(p, kind))),
      );
      expect(results.filter((result) => result.ok).length).toBe(cap);
      for (const result of results.filter((result) => !result.ok))
        denied(result, 429);
      expect(await counts(actor)).toEqual(expected);
    });
  }

  it("memoizes the same in-flight and terminal Promise once, refuses class changes and retains rejected results", async () => {
    const actor = await f.account("user");
    const p = await principal(actor);
    const first = chargeReaderProfileAttempt(p, "content");
    expect(chargeReaderProfileAttempt(p, "content") === first).toBe(true);
    denied(await observe(chargeReaderProfileAttempt(p, "ordinary")), 503);
    await first;
    expect(chargeReaderProfileAttempt(p, "content") === first).toBe(true);
    await first;
    expect(await counts(actor)).toEqual([1, 1, 0]);
    for (let i = 1; i < 5; i++) await charge(actor, "content");
    const deniedPrincipal = await principal(actor);
    const rejected = chargeReaderProfileAttempt(deniedPrincipal, "content");
    const result = await observe(rejected);
    denied(result, 429);
    expect(
      chargeReaderProfileAttempt(deniedPrincipal, "content") === rejected,
    ).toBe(true);
    const before = await digest(actor);
    denied(await observe(rejected), 429);
    expect(await digest(actor)).toEqual(before);
  });

  it("retains root-scoped quotas through owned profile removal and genuine sign-out/re-login", async () => {
    const actor = await f.account("user");
    await charge(actor, "content");
    const before = await digest(actor);
    expect(await counts(actor)).toEqual([1, 1, 0]);
    owned(actor);
    // Controlled owned erasure edge only, not live profile-command coverage.
    // Root cleanup remains f.stop(); removing a presentation is not root erasure.
    const handle = `r${randomUUID().replaceAll("-", "").slice(0, 23)}`;
    await sql`insert into reader_profiles(user_id,handle,display_name) values(${actor.id},${handle},'Synthetic quota-retention fixture')`;
    await sql`update reader_profiles set state='REMOVED',visibility='PRIVATE',display_name=null,biography=null,revision=revision+1,updated_at=clock_timestamp() where user_id=${actor.id}`;
    const [removed] =
      await sql`select state='REMOVED' and visibility='PRIVATE' and display_name is null and biography is null as removed from reader_profiles where user_id=${actor.id}`;
    expect(removed?.removed).toBe(true);
    expect(await digest(actor)).toEqual(before);
    const previousSession = await sessionId(actor);
    const previousCookie = actor.cookie;
    const logoutHeaders = headers(actor);
    logoutHeaders.set("Content-Type", "application/json");
    const logout = await getAuth().handler(
      new Request(`${f.origin}/api/auth/sign-out`, {
        method: "POST",
        headers: logoutHeaders,
        body: "{}",
      }),
    );
    expect(logout.status).toBe(200);
    expect(
      (
        await sql`select count(*)::int as count from sessions where id=${previousSession} and user_id=${actor.id}`
      )[0]?.count,
    ).toBe(0);
    // Check before re-login: sign-out itself must not clear the root's allowance.
    expect(await digest(actor)).toEqual(before);
    const loginHeaders = headers(actor);
    loginHeaders.delete("Cookie");
    loginHeaders.set("Content-Type", "application/json");
    const login = await getAuth().handler(
      new Request(`${f.origin}/api/auth/sign-in/email`, {
        method: "POST",
        headers: loginHeaders,
        body: JSON.stringify({
          email: actor.email,
          password: "Synthetic-only-password-17!",
        }),
      }),
    );
    expect(login.status).toBe(200);
    actor.cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    expect(actor.cookie.includes("session_token")).toBe(true);
    expect(actor.cookie !== previousCookie).toBe(true);
    expect((await sessionId(actor)) !== previousSession).toBe(true);
    expect(await digest(actor)).toEqual(before);
    await chargeReaderProfileAttempt(await principal(actor), "content");
    expect(await counts(actor)).toEqual([2, 2, 0]);
  });

  it("keeps admission committed after unrelated business SQL rollback (not domain-command coverage)", async () => {
    const actor = await f.account("user");
    await charge(actor, "content");
    const before = await digest(actor);
    const rollback = new Error("Synthetic owned business rollback");
    const result = await observe(
      sql.begin(async (tx) => {
        await tx`update users set name='Synthetic rolled-back value' where id=${actor.id}`;
        throw rollback;
      }),
    );
    expect(result.ok).toBe(false);
    expect(await digest(actor)).toEqual(before);
    expect(await counts(actor)).toEqual([1, 1, 0]);
  });

  for (const mutation of [
    "expire",
    "unverify",
    "delete-session",
    "delete-root",
  ] as const) {
    it(`rechecks genuine authentication after the physical root-row wait: ${mutation}`, async () => {
      const actor = await f.account("user");
      const p = await principal(actor);
      const sid = await sessionId(actor);
      const backend = await sql.reserve();
      let open = false;
      let pending: Promise<Outcome> | undefined;
      try {
        const [settings] =
          await backend`select pg_backend_pid() as pid,current_setting('statement_timeout') as timeout`;
        expect(settings?.timeout).toBe("5s");
        await backend`BEGIN`;
        open = true;
        await backend`select id from users where id=${actor.id} for no key update`;
        pending = observe(chargeReaderProfileAttempt(p, "content"));
        await blockedBy(Number(settings!.pid), "users");
        expect(await counts(actor)).toEqual([0, 0, 0]);
        if (mutation === "expire")
          await backend`update sessions set expires_at=clock_timestamp()-interval '1 second' where id=${sid} and user_id=${actor.id}`;
        if (mutation === "unverify")
          await backend`update users set email_verified=false where id=${actor.id}`;
        if (mutation === "delete-session")
          await backend`delete from sessions where id=${sid} and user_id=${actor.id}`;
        if (mutation === "delete-root")
          await backend`delete from users where id=${actor.id}`;
        await backend`COMMIT`;
        open = false;
        denied(
          await pending,
          mutation === "unverify" || mutation === "delete-root" ? 403 : 401,
        );
        expect(await counts(actor)).toEqual([0, 0, 0]);
      } finally {
        if (open) await backend`ROLLBACK`;
        backend.release();
        if (pending) await pending;
      }
    });
  }

  for (const mutation of ["expire", "delete-session"] as const) {
    it(`rechecks authority after the physical session-row wait: ${mutation}`, async () => {
      const actor = await f.account("user");
      const p = await principal(actor);
      const sid = await sessionId(actor);
      const backend = await sql.reserve();
      let open = false;
      let pending: Promise<Outcome> | undefined;
      try {
        const [settings] =
          await backend`select pg_backend_pid() as pid,current_setting('statement_timeout') as timeout`;
        expect(settings?.timeout).toBe("5s");
        await backend`BEGIN`;
        open = true;
        await backend`select id from sessions where id=${sid} and user_id=${actor.id} for update`;
        pending = observe(chargeReaderProfileAttempt(p, "content"));
        await blockedBy(Number(settings!.pid), "sessions");
        if (mutation === "expire")
          await backend`update sessions set expires_at=clock_timestamp()-interval '1 second' where id=${sid} and user_id=${actor.id}`;
        else
          await backend`delete from sessions where id=${sid} and user_id=${actor.id}`;
        await backend`COMMIT`;
        open = false;
        denied(await pending, 401);
        expect(await counts(actor)).toEqual([0, 0, 0]);
      } finally {
        if (open) await backend`ROLLBACK`;
        backend.release();
        if (pending) await pending;
      }
    });
  }

  for (const missing of [false, true]) {
    it(`uses a fresh DB anchor after an actual ${missing ? "missing-key unique insertion" : "existing-quota row"} wait and holds root/session fences`, async () => {
      const actor = await f.account("user");
      if (!missing) await charge(actor);
      const p = await principal(actor);
      const sid = await sessionId(actor);
      const kind = "ordinary";
      const backend = await sql.reserve();
      let open = false;
      let pending: Promise<Outcome> | undefined;
      let deletion: Promise<Outcome> | undefined;
      try {
        const [settings] =
          await backend`select pg_backend_pid() as pid,current_setting('statement_timeout') as timeout`;
        expect(settings?.timeout).toBe("5s");
        await backend`BEGIN`;
        open = true;
        if (missing) {
          // A real uncommitted competing key, not mocked limiter authority.
          await backend`insert into reader_profile_rate_limits(user_id,kind,count,last_request) values(${actor.id},${kind},21,floor(extract(epoch from clock_timestamp())*1000)::bigint-60001)`;
        } else {
          await backend`select user_id from reader_profile_rate_limits where user_id=${actor.id} and kind=${kind} for update`;
          await backend`update reader_profile_rate_limits set count=21,last_request=floor(extract(epoch from clock_timestamp())*1000)::bigint-60001 where user_id=${actor.id} and kind=${kind}`;
        }
        pending = observe(chargeReaderProfileAttempt(p));
        const waiter = await blockedBy(
          Number(settings!.pid),
          "reader_profile_rate_limits",
        );
        const rootProbe = await observe(
          sql.begin(async (tx) => {
            await tx`select id from users where id=${actor.id} for no key update nowait`;
          }),
        );
        expect(rootProbe.ok).toBe(false);
        if (!rootProbe.ok)
          expect((rootProbe.error as { code?: string }).code).toBe("55P03");
        const keyShare = await observe(
          sql.begin(async (tx) => {
            await tx`select id from users where id=${actor.id} for key share nowait`;
          }),
        );
        expect(keyShare.ok).toBe(true);
        const sessionShare = await observe(
          sql.begin(async (tx) => {
            await tx`select id from sessions where id=${sid} for share nowait`;
          }),
        );
        expect(sessionShare.ok).toBe(true);
        const sessionProbe = await observe(
          sql.begin(async (tx) => {
            await tx`select id from sessions where id=${sid} for no key update nowait`;
          }),
        );
        expect(sessionProbe.ok).toBe(false);
        if (!sessionProbe.ok)
          expect((sessionProbe.error as { code?: string }).code).toBe("55P03");
        // Observe the fresh anchor before root cleanup can erase it.
        const [releasedAt] =
          await backend`select floor(extract(epoch from clock_timestamp())*1000)::bigint as at`;
        await backend`COMMIT`;
        open = false;
        expect((await pending).ok).toBe(true);
        const [fresh] =
          await sql`select count,last_request>=${releasedAt!.at}::bigint as fresh from reader_profile_rate_limits where user_id=${actor.id} and kind=${kind}`;
        expect(fresh).toEqual({ count: 1, fresh: true });
        // Admission wins first: deletion erases it and an already-issued stale
        // capability cannot resurrect it after the root disappears.
        const stale = await principal(actor);
        deletion = observe(
          sql`delete from users where id=${actor.id} and email=${actor.email}`,
        );
        expect((await deletion).ok).toBe(true);
        denied(await observe(chargeReaderProfileAttempt(stale)), 403);
        expect(await counts(actor)).toEqual([0, 0, 0]);
        expect(Number(waiter.pid) > 0).toBe(true);
      } finally {
        if (open) await backend`ROLLBACK`;
        backend.release();
        if (pending) await pending;
        if (deletion) await deletion;
      }
    });
  }

  for (const missing of [false, true]) {
    it(`rejects wall-clock session expiry after the physical ${missing ? "missing-key unique" : "quota-row"} wait without committing counters or shells`, async () => {
      const actor = await f.account("user");
      // Warm the real module/connection through an independent quota class, not
      // an import-only shortcut; preserve that committed counter throughout.
      await charge(actor, "withdrawal");
      if (!missing) await charge(actor, "content");
      const p = await principal(actor);
      const sid = await sessionId(actor);
      const before = await digest(actor);
      const backend = await sql.reserve();
      let open = false;
      let pending: Promise<Outcome> | undefined;
      try {
        const [settings] =
          await backend`select pg_backend_pid() as pid,current_setting('statement_timeout') as timeout`;
        expect(settings?.timeout).toBe("5s");
        await backend`BEGIN`;
        open = true;
        const kind = "ordinary";
        if (missing)
          await backend`insert into reader_profile_rate_limits(user_id,kind,count,last_request) values(${actor.id},${kind},0,0)`;
        else
          await backend`select user_id from reader_profile_rate_limits where user_id=${actor.id} and kind=${kind} for update`;
        // Mint first, then commit a DB-clock expiry before admission takes its
        // SHARE fence. No attempt to UPDATE a session already SHARE-locked.
        await sql`update sessions set expires_at=clock_timestamp()+interval '1 second' where id=${sid} and user_id=${actor.id}`;
        pending = observe(chargeReaderProfileAttempt(p, "content"));
        await blockedBy(Number(settings!.pid), "reader_profile_rate_limits");
        const [headroom] =
          await sql`select expires_at>clock_timestamp()+interval '250 milliseconds' as sufficient from sessions where id=${sid} and user_id=${actor.id}`;
        expect(headroom?.sufficient).toBe(true);
        const deadline = performance.now() + 2900;
        let expired = false;
        // Time-bounded awaited SQL observations, not admission retries or sleeps:
        // a fast database must not exhaust an arbitrary count before time passes.
        while (performance.now() < deadline) {
          const [row] =
            await sql`select s.expires_at<=clock_timestamp() as expired,exists(select 1 from pg_stat_activity a where a.datname=current_database() and a.wait_event_type='Lock' and ${Number(settings!.pid)}=any(pg_blocking_pids(a.pid)) and position('reader_profile_rate_limits' in lower(a.query))>0) as held from sessions s where s.id=${sid} and s.user_id=${actor.id}`;
          expect(row?.held).toBe(true);
          if (row?.expired) {
            expired = true;
            break;
          }
        }
        expect(expired).toBe(true);
        // Roll back the competing missing row, or release the unchanged row.
        // The waiting transaction must fresh-check AFTER whichever wait it hit.
        await backend`ROLLBACK`;
        open = false;
        denied(await pending, 401);
        expect(await digest(actor)).toEqual(before);
      } finally {
        if (open) await backend`ROLLBACK`;
        backend.release();
        if (pending) await pending;
      }
    });
  }

  it("root deletion waits on the admission user fence, then removes every committed profile budget without stale resurrection", async () => {
    const actor = await f.account("user");
    await charge(actor, "content");
    await charge(actor, "withdrawal");
    const p: ReaderProfilePrincipal = await principal(actor);
    const stale = await principal(actor);
    const backend = await sql.reserve();
    let open = false;
    let pending: Promise<Outcome> | undefined;
    let deletion: Promise<Outcome> | undefined;
    try {
      const [settings] =
        await backend`select pg_backend_pid() as pid,current_setting('statement_timeout') as timeout`;
      expect(settings?.timeout).toBe("5s");
      await backend`BEGIN`;
      open = true;
      await backend`select user_id from reader_profile_rate_limits where user_id=${actor.id} and kind='ordinary' for update`;
      pending = observe(chargeReaderProfileAttempt(p, "content"));
      const waiter = await blockedBy(
        Number(settings!.pid),
        "reader_profile_rate_limits",
      );
      deletion = observe(
        sql`delete from users where id=${actor.id} and email=${actor.email}`,
      );
      await blockedBy(Number(waiter.pid), "delete from users");
      await backend`COMMIT`;
      open = false;
      expect((await pending).ok).toBe(true);
      expect((await deletion).ok).toBe(true);
      denied(await observe(chargeReaderProfileAttempt(stale)), 403);
      expect(await counts(actor)).toEqual([0, 0, 0]);
    } finally {
      if (open) await backend`ROLLBACK`;
      backend.release();
      if (pending) await pending;
      if (deletion) await deletion;
    }
  });
});
