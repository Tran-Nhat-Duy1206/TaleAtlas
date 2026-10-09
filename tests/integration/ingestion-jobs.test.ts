import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../packages/database/src/client";
import * as database from "../../apps/web/src/server/database";
import {
  claimJobs,
  completeJob,
  enqueueRequestJob,
  failJob,
  reserveProviderBudget,
} from "../../apps/web/src/server/ingestion/jobs";
import {
  PRODUCTION_PROVIDER_POLICIES,
  ProviderPolicySchema,
} from "../../apps/web/src/features/ingestion/providers";
import { requireTestDatabase } from "../helpers/test-database";

// Real, explicitly guarded PostgreSQL; no authentication or database behavior mocks.
const connection = createDatabase(requireTestDatabase());
const db = connection.db;
const client = connection.client;
type JobSnapshot = {
  id: string;
  state: string;
  attempts: number;
  leaseToken: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  lastErrorCode: string | null;
  runAfter: string;
  updatedAt: string;
  completedAt: string | null;
  backoffMillis: number;
};
const ownedRequests: string[] = [];
let ownsProvider = false;
const providerId = "official-feed";
const owner = `ingestion-fixture-${randomUUID()}`;
beforeAll(() => {
  vi.spyOn(database, "getDatabase").mockReturnValue(db);
});
afterEach(async () => {
  if (ownedRequests.length) {
    await client`delete from ingestion_jobs where request_id in ${client(ownedRequests)}`;
    await client`delete from request_events where request_id in ${client(ownedRequests)}`;
    await client`delete from work_requests where id in ${client(ownedRequests)}`;
    ownedRequests.length = 0;
  }
  if (ownsProvider) {
    await client`delete from provider_registry where id = ${providerId}`;
    ownsProvider = false;
  }
});
afterAll(async () => {
  vi.restoreAllMocks();
  await connection.client.end();
});
async function fixture(count = 1) {
  const jobs = [];
  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    ownedRequests.push(id);
    await client`insert into work_requests (id, owner_user_id, details, normalized_title, input_hash, submit_key)
      values (${id}, null, ${JSON.stringify({ title: "Synthetic ingestion fixture", format: "UNKNOWN" })}::jsonb, 'synthetic ingestion fixture', ${"a".repeat(64)}, ${randomUUID()})`;
    const job = await db.transaction((tx) => enqueueRequestJob(tx, id, 1));
    await client`update ingestion_jobs set run_after = '2000-01-01T00:00:00Z' where id = ${job.id}`;
    jobs.push(job);
  }
  return jobs;
}
async function job(id: string) {
  const [row] = await client<JobSnapshot[]>`select id, state, attempts,
    lease_token as "leaseToken", lease_owner as "leaseOwner", lease_expires_at as "leaseExpiresAt",
    last_error_code as "lastErrorCode", run_after as "runAfter", updated_at as "updatedAt", completed_at as "completedAt",
    (extract(epoch from (run_after - updated_at)) * 1000)::double precision as "backoffMillis"
    from ingestion_jobs where id = ${id}`;
  return row!;
}
async function expire(id: string) {
  await client`update ingestion_jobs set lease_expires_at = '1999-01-01T00:00:00Z' where id = ${id}`;
}
async function provider(enabled: boolean, maxRequests = 2) {
  const base = PRODUCTION_PROVIDER_POLICIES.find(
    (policy) => policy.providerId === "OFFICIAL_FEED",
  )!;
  const policy = ProviderPolicySchema.parse({
    ...base,
    reviewState: "REVIEWED",
    reviewStatus: "REVIEWED",
    reviewedAt: "2026-10-09",
    metadataStorageAllowed: true,
    approvalStatus: "APPROVED",
    intendedUseReview: "Synthetic test approval, not production permission",
    enabled,
    auth: "NONE",
    capabilities: ["SEARCH_WORKS"],
    rateLimit: { maxRequests, intervalSeconds: 60 },
    rateIntervalMs: 60000,
    rateMaxRequests: maxRequests,
  });
  // Never overwrite or clean up a pre-existing registry row.
  await client`insert into provider_registry (id, enabled, policy) values (${providerId}, ${enabled}, ${JSON.stringify(policy)}::jsonb)`;
  ownsProvider = true;
}

describe.sequential("bounded durable ingestion jobs", () => {
  it("enqueues idempotently within the caller transaction and rolls back with it", async () => {
    const [first] = await fixture();
    const same = await db.transaction((tx) =>
      enqueueRequestJob(tx, first!.requestId!, 1),
    );
    expect(same.id).toBe(first!.id);
    await expect(
      db.transaction(async (tx) => {
        await enqueueRequestJob(tx, first!.requestId!, 2);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    const rows = await client<
      { idempotencyKey: string }[]
    >`select idempotency_key as "idempotencyKey" from ingestion_jobs where request_id = ${first!.requestId!}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.idempotencyKey).toBe(`request:${first!.requestId}:input1`);
  });
  it("claims concurrently without duplicates and respects bounded limits", async () => {
    const fixtures = await fixture(10);
    const ids = new Set(fixtures.map((row) => row.id));
    const batches = await Promise.all([
      claimJobs(owner, 3, 5),
      claimJobs(`${owner}-other`, 3, 5),
    ]);
    expect(batches.every((batch) => batch.length <= 3)).toBe(true);
    const claimed = batches.flat();
    expect(claimed).toHaveLength(6);
    expect(new Set(claimed.map((row) => row.id)).size).toBe(6);
    expect(
      claimed.every(
        (row) =>
          ids.has(row.id) &&
          row.attempts === 1 &&
          row.leaseToken &&
          row.state === "RUNNING",
      ),
    ).toBe(true);
    await expect(claimJobs(owner, 11, 5)).rejects.toThrow();
    await expect(claimJobs(owner, 0, 5)).rejects.toThrow();
    await expect(claimJobs(owner, 1, 4)).rejects.toThrow();
    await expect(claimJobs(owner, 1, 121)).rejects.toThrow();
    await expect(claimJobs("x".repeat(201), 1, 5)).rejects.toThrow();
  });
  it("fences wrong owners/tokens, expired leases and stale workers after recovery", async () => {
    const [fixtureJob] = await fixture();
    const [first] = await claimJobs(owner, 1, 5);
    expect(first!.id).toBe(fixtureJob!.id);
    expect(await completeJob(first!.id, first!.leaseToken!, "wrong")).toBe(
      false,
    );
    expect(
      await failJob(first!.id, randomUUID(), owner, "PROCESSING_FAILED"),
    ).toBe(false);
    await expire(first!.id);
    expect(await completeJob(first!.id, first!.leaseToken!, owner)).toBe(false);
    expect(
      await failJob(first!.id, first!.leaseToken!, owner, "PROVIDER_TIMEOUT"),
    ).toBe(false);
    const [recovered] = await claimJobs(owner, 1, 5);
    expect(recovered!.id).toBe(first!.id);
    expect(recovered!.attempts).toBe(2);
    expect(recovered!.leaseToken).not.toBe(first!.leaseToken);
    expect(await completeJob(first!.id, first!.leaseToken!, owner)).toBe(false);
    expect(
      await failJob(first!.id, first!.leaseToken!, owner, "PROCESSING_FAILED"),
    ).toBe(false);
    expect(
      await completeJob(recovered!.id, recovered!.leaseToken!, owner),
    ).toBe(true);
    expect(
      await completeJob(recovered!.id, recovered!.leaseToken!, owner),
    ).toBe(false);
    const done = await job(first!.id);
    expect(done.state).toBe("SUCCEEDED");
    expect([done.leaseToken, done.leaseOwner, done.leaseExpiresAt]).toEqual([
      null,
      null,
      null,
    ]);
  });
  it("rejects complete and fail when an unchanged row lock outlasts the lease", async () => {
    await fixture();
    for (const operation of ["complete", "fail"] as const) {
      const [claimed] = await claimJobs(owner, 1, 5);
      // Commit the shortened lease first: the lock holder must not change the
      // tuple, so this tests expiry after waiting without an EPQ tuple recheck.
      await client`update ingestion_jobs set lease_expires_at = clock_timestamp() + interval '500 milliseconds' where id = ${claimed!.id}`;
      let locked!: () => void;
      let startHold!: () => void;
      const ready = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        startHold = resolve;
      });
      const holder = client.begin(async (tx) => {
        await tx`select id from ingestion_jobs where id = ${claimed!.id} for update`;
        locked();
        await hold;
        await tx`select pg_sleep(1)`;
      });
      await ready;
      const acknowledgement =
        operation === "complete"
          ? completeJob(claimed!.id, claimed!.leaseToken!, owner)
          : failJob(
              claimed!.id,
              claimed!.leaseToken!,
              owner,
              "PROCESSING_FAILED",
            );
      startHold();
      const [accepted] = await Promise.all([acknowledgement, holder]);
      expect(accepted).toBe(false);
      const unchanged = await job(claimed!.id);
      expect(unchanged.state).toBe("RUNNING");
      expect(unchanged.leaseToken).toBe(claimed!.leaseToken);
      expect(unchanged.lastErrorCode).toBeNull();
    }
  });
  it("uses stable error codes and database-time exponential retry backoff", async () => {
    await fixture();
    const [first] = await claimJobs(owner, 1, 5);
    await expect(
      failJob(
        first!.id,
        first!.leaseToken!,
        owner,
        "raw provider secret" as never,
      ),
    ).rejects.toThrow();
    expect(
      await failJob(first!.id, first!.leaseToken!, owner, "PROVIDER_TIMEOUT"),
    ).toBe(true);
    let row = await job(first!.id);
    expect(row.state).toBe("RETRY_WAIT");
    expect(row.lastErrorCode).toBe("PROVIDER_TIMEOUT");
    expect(row.backoffMillis).toBeGreaterThanOrEqual(29900);
    expect(row.backoffMillis).toBeLessThan(31000);
    expect([row.leaseToken, row.leaseOwner, row.leaseExpiresAt]).toEqual([
      null,
      null,
      null,
    ]);
    await client`update ingestion_jobs set run_after = '2000-01-01T00:00:00Z' where id = ${row.id}`;
    const [second] = await claimJobs(owner, 1, 5);
    expect(
      await failJob(
        second!.id,
        second!.leaseToken!,
        owner,
        "PROVIDER_UNAVAILABLE",
      ),
    ).toBe(true);
    row = await job(row.id);
    expect(row.backoffMillis).toBeGreaterThanOrEqual(59900);
    expect(row.backoffMillis).toBeLessThan(61000);
    await client`update ingestion_jobs set run_after = '2000-01-01T00:00:00Z', attempts = 7 where id = ${row.id}`;
    const [last] = await claimJobs(owner, 1, 5);
    expect(
      await failJob(last!.id, last!.leaseToken!, owner, "INVALID_RESPONSE"),
    ).toBe(true);
    row = await job(row.id);
    expect(row.state).toBe("DEAD_LETTER");
    expect(row.attempts).toBe(8);
    expect(row.backoffMillis).toBeGreaterThanOrEqual(3599900);
    expect(row.backoffMillis).toBeLessThan(3601000);
    expect(row.completedAt).not.toBeNull();
  });
  it("dead-letters no more than ten exhausted expired leases per claim", async () => {
    const fixtures = await fixture(12);
    const ids = fixtures.map((row) => row.id);
    await client`update ingestion_jobs set state = 'RUNNING', attempts = 8, lease_token = ${randomUUID()}, lease_owner = ${owner}, lease_expires_at = '1999-01-01T00:00:00Z' where id in ${client(ids)}`;
    await claimJobs(owner, 1, 5);
    const dead = await client<
      {
        leaseToken: string | null;
        leaseOwner: string | null;
        leaseExpiresAt: Date | null;
      }[]
    >`select lease_token as "leaseToken", lease_owner as "leaseOwner", lease_expires_at as "leaseExpiresAt" from ingestion_jobs where id in ${client(ids)} and state = 'DEAD_LETTER'`;
    expect(dead).toHaveLength(10);
    expect(
      dead.every(
        (row) =>
          row.leaseToken === null &&
          row.leaseOwner === null &&
          row.leaseExpiresAt === null,
      ),
    ).toBe(true);
    await claimJobs(owner, 1, 5);
    const remaining =
      await client`select id from ingestion_jobs where id in ${client(ids)} and state = 'RUNNING'`;
    expect(remaining).toHaveLength(0);
  });
  it("does not reserve counters for disabled providers", async () => {
    await provider(false);
    expect(await reserveProviderBudget(providerId, "SEARCH_WORKS")).toEqual({
      allowed: false,
      errorCode: "PROVIDER_DISABLED",
    });
    const [row] = await client<
      { requestsInWindow: number }[]
    >`select requests_in_window as "requestsInWindow" from provider_registry where id = ${providerId}`;
    expect(row!.requestsInWindow).toBe(0);
  });
  it("reserves provider capacity atomically under concurrency and resets expired windows", async () => {
    await provider(true, 2);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        reserveProviderBudget(providerId, "SEARCH_WORKS"),
      ),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(2);
    expect(
      results.filter(
        (result) => !result.allowed && result.errorCode === "RATE_LIMITED",
      ),
    ).toHaveLength(6);
    expect(await reserveProviderBudget(providerId, "GET_EDITIONS")).toEqual({
      allowed: false,
      errorCode: "PROVIDER_DISABLED",
    });
    const [row] = await client<
      { requestsInWindow: number }[]
    >`select requests_in_window as "requestsInWindow" from provider_registry where id = ${providerId}`;
    expect(row!.requestsInWindow).toBe(2);
    await client`update provider_registry set window_started_at = clock_timestamp() - interval '61 seconds' where id = ${providerId}`;
    expect(
      (await reserveProviderBudget(providerId, "SEARCH_WORKS")).allowed,
    ).toBe(true);
    const [reset] = await client<
      { requestsInWindow: number }[]
    >`select requests_in_window as "requestsInWindow" from provider_registry where id = ${providerId}`;
    expect(reset!.requestsInWindow).toBe(1);
  });
});
