import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import {
  createStoryRequest,
  myStoryRequest,
  myStoryRequests,
  amendStoryRequest,
  cancelStoryRequest,
  adminStoryRequest,
  moderateStoryRequest,
} from "../../apps/web/src/server/ingestion/service";
import {
  claimJobs,
  completeJob,
  failJob,
} from "../../apps/web/src/server/ingestion/jobs";
const f = catalogAuthFixture();
type Actor = Awaited<ReturnType<typeof f.account>>;
let owner: Actor, other: Actor, admin: Actor, moderator: Actor;
const headers = (actor: Actor) => new Headers({ cookie: actor.cookie });
const details = (overrides: Record<string, unknown> = {}) => ({
  title: `Synthetic missing ${f.runId}`,
  format: "UNKNOWN",
  ...overrides,
});
const create = (
  actor = owner,
  overrides: Record<string, unknown> = {},
  submitKey = randomUUID(),
) =>
  createStoryRequest(
    { submitKey, details: details(overrides) },
    headers(actor),
  );
beforeAll(async () => {
  await f.start();
  owner = await f.account("user");
  other = await f.account("user");
  admin = await f.account("admin");
  moderator = await f.account("moderator");
});
afterAll(async () => {
  const ids = f.users.map((user) => user.id);
  if (ids.length) {
    await f.client`delete from ingestion_jobs where request_id in (select id from work_requests where owner_user_id in ${f.client(ids)})`;
    await f.client`delete from request_events where request_id in (select id from work_requests where owner_user_id in ${f.client(ids)})`;
    await f.client`delete from work_requests where owner_user_id in ${f.client(ids)}`;
  }
  await f.stop();
});
describe.sequential(
  "V2A request domain against real PostgreSQL and verified sessions",
  () => {
    it("denies anonymous malformed submissions before parsing and never trusts client ownership", async () => {
      await expect(
        createStoryRequest({ ownerUserId: owner.id }, new Headers()),
      ).rejects.toMatchObject({ status: 401 });
      await expect(
        createStoryRequest(
          {
            submitKey: randomUUID(),
            details: details(),
            ownerUserId: other.id,
          },
          headers(owner),
        ),
      ).rejects.toThrow();
    });
    it("creates idempotently under concurrent delivery with one request, event and job", async () => {
      const key = randomUUID();
      const rows = await Promise.all(
        Array.from({ length: 8 }, () => create(owner, {}, key)),
      );
      expect(new Set(rows.map((row) => row.id)).size).toBe(1);
      const [request] =
        await f.client`select * from work_requests where id = ${rows[0]!.id}`;
      expect(request!.owner_user_id).toBe(owner.id);
      expect(request!.state).toBe("SUBMITTED");
      expect(request!.public_title).toBeNull();
      expect(request!.resulting_work_id).toBeNull();
      expect(
        await f.client`select * from request_events where request_id = ${rows[0]!.id}`,
      ).toHaveLength(1);
      expect(
        await f.client`select * from ingestion_jobs where request_id = ${rows[0]!.id}`,
      ).toHaveLength(1);
      await expect(
        create(owner, { title: "Different input" }, key),
      ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
    });
    it("never merges normalized equal titles, different authors or novel/adaptation requests", async () => {
      const a = await create(other, {
        title: "Đường Về",
        author: "Author A",
        format: "WEB_NOVEL",
      });
      const b = await create(other, {
        title: "Duong ve",
        author: "Author B",
        format: "WEB_NOVEL",
      });
      const adaptation = await create(other, {
        title: "Duong ve",
        author: "Author A",
        format: "MANHWA",
        notes: "An adaptation needs separate Work evidence",
      });
      expect(new Set([a.id, b.id, adaptation.id]).size).toBe(3);
      expect(
        await f.client`select * from works where id in (${a.id},${b.id},${adaptation.id})`,
      ).toHaveLength(0);
      const rows =
        await f.client`select normalized_title from work_requests where id in (${a.id},${b.id},${adaptation.id})`;
      expect(rows.every((row) => row.normalized_title === "duong ve")).toBe(
        true,
      );
    });
    it("isolates details/list/history and conceals existence from another authenticated user", async () => {
      const row = await create(owner, {
        notes: "PRIVATE REQUEST NOTES",
        additionalEvidence: "Private citation explanation",
      });
      expect((await myStoryRequest(row.id, headers(owner))).details.notes).toBe(
        "PRIVATE REQUEST NOTES",
      );
      await expect(
        myStoryRequest(row.id, headers(other)),
      ).rejects.toMatchObject({ status: 404, code: "REQUEST_NOT_FOUND" });
      await expect(
        myStoryRequest(randomUUID(), headers(other)),
      ).rejects.toMatchObject({ status: 404, code: "REQUEST_NOT_FOUND" });
      await expect(
        amendStoryRequest(
          row.id,
          { revision: 1, details: details() },
          headers(other),
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        cancelStoryRequest(row.id, { revision: 1 }, headers(other)),
      ).rejects.toMatchObject({ status: 404 });
      expect(
        (await myStoryRequests({}, headers(other))).items.map(
          (item) => item.id,
        ),
      ).not.toContain(row.id);
      const value = await myStoryRequest(row.id, headers(owner));
      expect(value).not.toHaveProperty("ownerUserId");
      expect(value.events[0]).not.toHaveProperty("actorSnapshot");
    });
    it("authorizes moderation before validation and records information request/amendment atomically", async () => {
      const row = await create();
      await expect(
        adminStoryRequest(row.id, headers(moderator)),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        moderateStoryRequest(row.id, { state: "APPROVED" }, headers(moderator)),
      ).rejects.toMatchObject({ status: 403 });
      const pending = await moderateStoryRequest(
        row.id,
        {
          revision: 1,
          state: "NEEDS_INFO",
          reason:
            "Please supply the original creator or official bibliographic source.",
        },
        headers(admin),
      );
      expect(pending.state).toBe("NEEDS_INFO");
      const changed = await amendStoryRequest(
        row.id,
        {
          revision: 2,
          details: details({ originalTitle: "物語", author: "Named author" }),
        },
        headers(owner),
      );
      expect(changed).toMatchObject({
        state: "SUBMITTED",
        revision: 3,
        inputRevision: 2,
      });
      const value = await myStoryRequest(row.id, headers(owner));
      expect(value.events.map((event) => event.revision)).toEqual([1, 2, 3]);
      expect(value.events[2]!.payload).toMatchObject({
        previousDetails: { title: row.details.title },
        details: { author: "Named author" },
      });
      const jobs =
        await f.client`select state, expected_input_revision from ingestion_jobs where request_id = ${row.id} order by expected_input_revision`;
      expect(jobs).toMatchObject([
        { state: "CANCELLED", expected_input_revision: 1 },
        { state: "QUEUED", expected_input_revision: 2 },
      ]);
      const [decision] =
        await f.client`select actor_user_id, actor_snapshot from request_events where request_id=${row.id} and revision=2`;
      expect(decision!.actor_user_id).toBe(admin.id);
      expect(decision!.actor_snapshot).toBe(admin.id);
    });
    it("fences concurrent edit/cancel using revision locks without partial jobs/history", async () => {
      const row = await create(other);
      const results = await Promise.allSettled([
        amendStoryRequest(
          row.id,
          { revision: 1, details: details({ notes: "Additional evidence" }) },
          headers(other),
        ),
        cancelStoryRequest(row.id, { revision: 1 }, headers(other)),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected).toMatchObject({
        reason: { status: 409, code: "REVISION_CONFLICT" },
      });
      const value = await myStoryRequest(row.id, headers(other));
      expect(value.revision).toBe(2);
      expect(value.events.map((event) => event.revision)).toEqual([1, 2]);
      const [queued] =
        await f.client`select count(*)::int as count from ingestion_jobs where request_id=${row.id} and state in ('QUEUED','RUNNING','RETRY_WAIT')`;
      expect(queued!.count).toBe(value.state === "CANCELLED" ? 0 : 1);
    });
    it("keeps processing failure separate from request lifecycle and cancellation fences a claimed job", async () => {
      const row = await create(other);
      await f.client`update ingestion_jobs set run_after='1900-01-01' where request_id=${row.id}`;
      const [job] = await claimJobs(`request-fixture-${f.runId}`, 1, 30);
      expect(job!.requestId).toBe(row.id);
      await cancelStoryRequest(row.id, { revision: 1 }, headers(other));
      expect(
        await completeJob(job!.id, job!.leaseToken!, job!.leaseOwner!),
      ).toBe(false);
      const [stored] =
        await f.client`select state,last_error_code,lease_token from ingestion_jobs where id=${job!.id}`;
      expect(stored).toMatchObject({
        state: "CANCELLED",
        last_error_code: null,
        lease_token: null,
      });
      expect((await myStoryRequest(row.id, headers(other))).state).toBe(
        "CANCELLED",
      );
    });
    it("does not reject a request when its provider fails or is unavailable", async () => {
      const row = await create(other);
      await f.client`update ingestion_jobs set run_after='1900-01-01' where request_id=${row.id}`;
      const [job] = await claimJobs(`request-failure-${f.runId}`, 1, 30);
      expect(job!.requestId).toBe(row.id);
      expect(
        await failJob(
          job!.id,
          job!.leaseToken!,
          job!.leaseOwner!,
          "PROVIDER_DISABLED",
        ),
      ).toBe(true);
      expect((await myStoryRequest(row.id, headers(other))).state).toBe(
        "SUBMITTED",
      );
      const [stored] =
        await f.client`select state,last_error_code from ingestion_jobs where id=${job!.id}`;
      expect(stored).toMatchObject({
        state: "RETRY_WAIT",
        last_error_code: "PROVIDER_DISABLED",
      });
    });
    it("requires explicit review reasons and forbids final state resurrection or fabricated approval", async () => {
      const row = await create(other);
      await expect(
        moderateStoryRequest(
          row.id,
          { revision: 1, state: "APPROVED", reason: "Unverified" },
          headers(admin),
        ),
      ).rejects.toThrow();
      await expect(
        moderateStoryRequest(
          row.id,
          { revision: 1, state: "REJECTED", reason: " " },
          headers(admin),
        ),
      ).rejects.toThrow();
      await moderateStoryRequest(
        row.id,
        {
          revision: 1,
          state: "REJECTED",
          reason:
            "Submitted source does not establish the claimed Work identity.",
        },
        headers(admin),
      );
      await expect(
        amendStoryRequest(
          row.id,
          { revision: 2, details: details() },
          headers(other),
        ),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        cancelStoryRequest(row.id, { revision: 2 }, headers(other)),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        moderateStoryRequest(
          row.id,
          {
            revision: 2,
            state: "NEEDS_REVIEW",
            reason: "Attempted resurrection",
          },
          headers(admin),
        ),
      ).rejects.toMatchObject({ status: 409, code: "INVALID_TRANSITION" });
    });
    it("retains both previous and new bounded details in a large transactional history record", async () => {
      const large = {
        description: "a".repeat(4000),
        additionalEvidence: "e".repeat(3000),
        notes: "n".repeat(2000),
      };
      const row = await create(owner, large);
      await amendStoryRequest(
        row.id,
        {
          revision: 1,
          details: details({ ...large, description: "b".repeat(4000) }),
        },
        headers(owner),
      );
      const [event] =
        await f.client`select payload, octet_length(payload::text) as bytes from request_events where request_id=${row.id} and revision=2`;
      expect(event!.bytes).toBeGreaterThan(16384);
      expect(event!.bytes).toBeLessThanOrEqual(32768);
      expect(event!.payload.previousDetails.description).toBe("a".repeat(4000));
      expect(event!.payload.details.description).toBe("b".repeat(4000));
    });
    it("enforces the existing atomic mutation budget on concurrent authenticated deliveries", async () => {
      const actor = await f.account("user");
      const key = randomUUID();
      const results = await Promise.allSettled(
        Array.from({ length: 31 }, () => create(actor, {}, key)),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(30);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toMatchObject([{ reason: { status: 429, code: "RATE_LIMITED" } }]);
      expect((await myStoryRequests({}, headers(actor))).total).toBe(1);
    });
  },
);
