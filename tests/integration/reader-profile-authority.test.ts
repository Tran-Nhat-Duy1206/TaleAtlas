// Drizzle belongs to the existing web workspace, not a new root dependency.
import { sql as statement } from "../../apps/web/node_modules/drizzle-orm/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAuth } from "../../apps/web/src/server/auth";
import { getDatabase } from "../../apps/web/src/server/database";
import { ReaderProfileFoundationError } from "../../apps/web/src/features/reader-profile/http-contracts";
import {
  assertReaderProfilePrincipalCurrent,
  lockReaderProfilePrincipal,
  requireReaderProfilePrincipal,
  type ReaderProfilePrincipal,
} from "../../apps/web/src/server/reader-profile/authority";
import { readingAuthFixture } from "../helpers/reading-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";

// Authored real PostgreSQL coverage: normal SMTP verification/login, opaque
// capabilities and owned persisted auth rows only. No fabricated sessions,
// authority mocks, profile/app-data writes, sleeps or statement-budget changes.
const f = readingAuthFixture();
const sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
type Tx = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];
type Outcome<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };
function observed<T>(promise: Promise<T>): Promise<Outcome<T>> {
  return promise.then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason: unknown) => ({ status: "rejected" as const, reason }),
  );
}
function denial(
  result: Outcome<unknown>,
  status: 401 | 403,
  allowCoreAuth = false,
) {
  // Never serialize a driver exception, private frame, cookie or fixture ID.
  expect(result.status).toBe("rejected");
  if (result.status !== "rejected") return;
  const error = result.reason as { status?: unknown; code?: unknown } | null;
  expect(error?.status).toBe(status);
  if (allowCoreAuth && !(error instanceof ReaderProfileFoundationError)) {
    expect(status).toBe(401);
    return;
  }
  expect(error instanceof ReaderProfileFoundationError).toBe(true);
  expect(error?.code).toBe(
    status === 401 ? "AUTHENTICATION_REQUIRED" : "ACCESS_DENIED",
  );
}
const ips = new Map<string, string>();
function headers(actor: Actor) {
  if (!ips.has(actor.id)) ips.set(actor.id, `127.53.0.${ips.size + 1}`);
  return new Headers({
    Origin: f.origin,
    Cookie: actor.cookie,
    "x-real-ip": ips.get(actor.id)!,
  });
}
function owned(actor: Actor) {
  requireTestDatabase();
  expect(
    f.users.some((u) => u.id === actor.id && u.email === actor.email),
  ).toBe(true);
}
async function signedSession(actor: Actor) {
  owned(actor);
  const signed = await getAuth().api.getSession({ headers: headers(actor) });
  expect(
    Boolean(
      signed &&
      signed.user.id === actor.id &&
      signed.session.userId === actor.id,
    ),
  ).toBe(true);
  if (!signed) throw new Error("Owned signed fixture unavailable");
  expect(signed.user.emailVerified).toBe(true);
  const rows =
    await sql`select id from sessions where id=${signed.session.id} and user_id=${actor.id}`;
  expect(rows.length).toBe(1);
  return signed.session.id;
}
async function fence(principal: ReaderProfilePrincipal) {
  return getDatabase().transaction((tx) =>
    lockReaderProfilePrincipal(tx, principal),
  );
}
async function exactOwner(
  tx: Tx,
  principal: ReaderProfilePrincipal,
  actor: Actor,
) {
  expect((await lockReaderProfilePrincipal(tx, principal)) === actor.id).toBe(
    true,
  );
  expect(
    (await assertReaderProfilePrincipalCurrent(tx, principal)) === actor.id,
  ).toBe(true);
}
async function blockedBy(blockerPid: number, tag: string) {
  requireTestDatabase();
  const deadline = performance.now() + 2900;
  for (
    let attempt = 0;
    attempt < 256 && performance.now() < deadline;
    attempt++
  ) {
    const rows = await sql<{ pid: number }[]>`
      select a.pid from pg_stat_activity a
      where a.datname=current_database() and a.wait_event_type='Lock'
        and ${blockerPid}=any(pg_blocking_pids(a.pid))
        and position(${tag} in lower(a.query))>0
      order by a.pid`;
    if (rows.length) {
      expect(rows.length).toBe(1);
      return Number(rows[0].pid);
    }
  }
  throw new Error(
    "Expected owned PostgreSQL lock barrier within three seconds",
  );
}
async function lastQueryIsFresh(pid: number) {
  const [row] = await sql<{ fresh: boolean }[]>`
    select position('reader_profile_authority_current' in lower(query))>0 as fresh
    from pg_stat_activity where pid=${pid} and datname=current_database()`;
  expect(row?.fresh).toBe(true);
}
const envKeys = [
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
const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
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
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

describe("reader-profile authority with real signed sessions and PostgreSQL fences", () => {
  it("retains the exact owner for users, moderators and admins without exposing capability facts", async () => {
    for (const role of ["user", "moderator", "admin"] as const) {
      const actor = await f.account(role);
      const other = await f.account("user");
      const h = headers(actor);
      h.set("x-user-id", other.id);
      h.set("x-owner-id", other.id);
      h.set("x-role", "admin");
      const principal = await requireReaderProfilePrincipal(h);
      expect(Object.isFrozen(principal)).toBe(true);
      expect(Reflect.ownKeys(principal).length).toBe(0);
      expect(JSON.stringify(principal)).toBe("{}");
      await getDatabase().transaction((tx) => exactOwner(tx, principal, actor));
    }
  });

  it("rejects forged, copied and augmented capabilities and ignores unsigned custom headers", async () => {
    const actor = await f.account("user");
    const sessionId = await signedSession(actor);
    const genuine = await requireReaderProfilePrincipal(headers(actor));
    const candidates = [
      {},
      { ...genuine },
      Object.create(genuine) as object,
      {
        ...genuine,
        accountId: actor.id,
        userId: actor.id,
        sessionId,
        role: "admin",
      },
    ];
    for (const candidate of candidates) {
      const principal = candidate as ReaderProfilePrincipal;
      denial(await observed(fence(principal)), 401);
      await getDatabase().transaction(async (tx) => {
        denial(
          await observed(assertReaderProfilePrincipalCurrent(tx, principal)),
          401,
        );
      });
    }
    denial(
      await observed(
        requireReaderProfilePrincipal(
          new Headers({
            "x-user-id": actor.id,
            "x-session-id": sessionId,
            "x-role": "admin",
          }),
        ),
      ),
      401,
      true,
    );
    await getDatabase().transaction((tx) => exactOwner(tx, genuine, actor));
  });

  it("rejects a cached genuine capability when its exact persisted session changes owners", async () => {
    const actor = await f.account("user");
    const other = await f.account("admin");
    const sessionId = await signedSession(actor);
    const principal = await requireReaderProfilePrincipal(headers(actor));
    owned(other);
    await sql`update sessions set user_id=${other.id} where id=${sessionId} and user_id=${actor.id}`;
    try {
      denial(await observed(fence(principal)), 401);
    } finally {
      await sql`update sessions set user_id=${actor.id} where id=${sessionId} and user_id=${other.id}`;
    }
  });

  it("denies persisted unverified users before resolution and after a genuine initial resolution", async () => {
    const actor = await f.account("user");
    const principal = await requireReaderProfilePrincipal(headers(actor));
    owned(actor);
    await sql`update users set email_verified=false where id=${actor.id} and email=${actor.email}`;
    denial(await observed(requireReaderProfilePrincipal(headers(actor))), 403);
    denial(await observed(fence(principal)), 403);
  });

  it("denies a cached capability after actual Better Auth sign-out revokes its exact session", async () => {
    const actor = await f.account("user");
    const sessionId = await signedSession(actor);
    const principal = await requireReaderProfilePrincipal(headers(actor));
    const response = await getAuth().handler(
      new Request(`${f.origin}/api/auth/sign-out`, {
        method: "POST",
        headers: headers(actor),
      }),
    );
    expect(response.status).toBe(200);
    expect(
      (
        await sql`select id from sessions where id=${sessionId} and user_id=${actor.id}`
      ).length,
    ).toBe(0);
    denial(await observed(fence(principal)), 401);
    denial(
      await observed(requireReaderProfilePrincipal(headers(actor))),
      401,
      true,
    );
  });

  it("denies expired legitimate sessions both before resolution and after a cached resolution", async () => {
    const actor = await f.account("user");
    const sessionId = await signedSession(actor);
    const principal = await requireReaderProfilePrincipal(headers(actor));
    owned(actor);
    await sql`update sessions set expires_at=clock_timestamp()-interval '1 second'
      where id=${sessionId} and user_id=${actor.id}`;
    // Fence first: resolving the expired cookie may legitimately delete the row.
    denial(await observed(fence(principal)), 401);
    denial(
      await observed(requireReaderProfilePrincipal(headers(actor))),
      401,
      true,
    );
  });

  it("denies a cached capability after deletion of its owned root account", async () => {
    const actor = await f.account("user");
    const principal = await requireReaderProfilePrincipal(headers(actor));
    owned(actor);
    const rows =
      await sql`delete from users where id=${actor.id} and email=${actor.email} returning id`;
    expect(rows.length).toBe(1);
    denial(await observed(fence(principal)), 403);
  });

  async function userWait(change: "unverify" | "delete") {
    const actor = await f.account("user");
    const principal = await requireReaderProfilePrincipal(headers(actor));
    owned(actor);
    const backend = await sql.reserve();
    let transaction = false;
    let request: Promise<Outcome<string>> | undefined;
    try {
      const [settings] =
        await backend`select pg_backend_pid() as pid,current_setting('statement_timeout') as budget`;
      expect(settings.budget).toBe("5s");
      await backend`BEGIN`;
      transaction = true;
      expect(
        (
          await backend`select id from users where id=${actor.id} for no key update`
        ).length,
      ).toBe(1);
      request = observed(fence(principal));
      await blockedBy(Number(settings.pid), "reader_profile_authority_user");
      if (change === "unverify") {
        await backend`update users set email_verified=false where id=${actor.id} and email=${actor.email}`;
      } else {
        await backend`delete from users where id=${actor.id} and email=${actor.email}`;
      }
      await backend`COMMIT`;
      transaction = false;
      denial(await request, 403);
    } finally {
      try {
        if (transaction) await backend`ROLLBACK`;
      } finally {
        backend.release();
        if (request) await request;
      }
    }
  }
  it("rechecks verification after a real user NO KEY UPDATE wait", async () => {
    await userWait("unverify");
  });
  it("denies deletion committed while its real user fence was waiting", async () => {
    await userWait("delete");
  });

  it("takes a session SHARE fence and performs its final fresh-clock query after the lock wait", async () => {
    const actor = await f.account("user");
    const sessionId = await signedSession(actor);
    const principal = await requireReaderProfilePrincipal(headers(actor));
    owned(actor);
    const backend = await sql.reserve();
    let transaction = false;
    let request: Promise<Outcome<void>> | undefined;
    try {
      const [settings] =
        await backend`select pg_backend_pid() as pid,current_setting('statement_timeout') as budget`;
      expect(settings.budget).toBe("5s");
      await backend`BEGIN`;
      transaction = true;
      expect(
        (
          await backend`select id from sessions where id=${sessionId} and user_id=${actor.id} for no key update`
        ).length,
      ).toBe(1);
      request = observed(
        getDatabase().transaction(async (tx) => {
          const rows = await tx.execute(
            statement`select pg_backend_pid() as pid`,
          );
          const result = await observed(
            lockReaderProfilePrincipal(tx, principal),
          );
          denial(result, 401);
          // A separate fixture connection inspects only a fixed metadata predicate.
          // Catch inside the callback so COMMIT/ROLLBACK cannot obscure the last query.
          await lastQueryIsFresh(Number(rows[0].pid));
        }),
      );
      await blockedBy(Number(settings.pid), "reader_profile_authority_session");
      // Expiry is set only AFTER the authority transaction is actually waiting.
      // Its transaction_timestamp()/now() is older; a fresh SQL clock is required.
      await backend`update sessions set expires_at=clock_timestamp()
        where id=${sessionId} and user_id=${actor.id}`;
      const [clock] =
        await backend`select expires_at<clock_timestamp() as expired
        from sessions where id=${sessionId} and user_id=${actor.id}`;
      expect(clock.expired).toBe(true);
      await backend`COMMIT`;
      transaction = false;
      expect((await request).status).toBe("fulfilled");
    } finally {
      try {
        if (transaction) await backend`ROLLBACK`;
      } finally {
        backend.release();
        if (request) await request;
      }
    }
  });

  it("assertCurrent rejects expiry after initial binding and a later real transaction wait", async () => {
    const actor = await f.account("user");
    const blockerActor = await f.account("user");
    const sessionId = await signedSession(actor);
    const principal = await requireReaderProfilePrincipal(headers(actor));
    owned(actor);
    owned(blockerActor);
    const backend = await sql.reserve();
    let transaction = false;
    let request: Promise<Outcome<void>> | undefined;
    try {
      const [settings] =
        await backend`select pg_backend_pid() as pid,current_setting('statement_timeout') as budget`;
      expect(settings.budget).toBe("5s");
      await backend`BEGIN`;
      transaction = true;
      expect(
        (
          await backend`select id from users where id=${blockerActor.id} for no key update`
        ).length,
      ).toBe(1);
      request = observed(
        getDatabase().transaction(async (tx) => {
          await exactOwner(tx, principal, actor);
          // The already-bound transaction may update its own legitimate session.
          // Set a DB-clock boundary after initial validation, without fabricating auth.
          await tx.execute(statement`update sessions set expires_at=clock_timestamp()
          where id=${sessionId} and user_id=${actor.id}`);
          await tx.execute(statement`select /* reader_profile_authority_test_later_wait */ id
          from users where id=${blockerActor.id} for no key update`);
          denial(
            await observed(assertReaderProfilePrincipalCurrent(tx, principal)),
            401,
          );
        }),
      );
      await blockedBy(
        Number(settings.pid),
        "reader_profile_authority_test_later_wait",
      );
      await backend`COMMIT`;
      transaction = false;
      expect((await request).status).toBe("fulfilled");
    } finally {
      try {
        if (transaction) await backend`ROLLBACK`;
      } finally {
        backend.release();
        if (request) await request;
      }
    }
  });

  it("requires binding to the exact transaction and cannot reuse another transaction's fence", async () => {
    const actor = await f.account("user");
    const principal = await requireReaderProfilePrincipal(headers(actor));
    await getDatabase().transaction(async (tx) => {
      denial(
        await observed(assertReaderProfilePrincipalCurrent(tx, principal)),
        401,
      );
      await exactOwner(tx, principal, actor);
      await getDatabase().transaction(async (otherTx) => {
        denial(
          await observed(
            assertReaderProfilePrincipalCurrent(otherTx, principal),
          ),
          401,
        );
      });
      expect(
        (await assertReaderProfilePrincipalCurrent(tx, principal)) === actor.id,
      ).toBe(true);
    });
    await getDatabase().transaction(async (tx) => {
      denial(
        await observed(assertReaderProfilePrincipalCurrent(tx, principal)),
        401,
      );
    });
  });
});
