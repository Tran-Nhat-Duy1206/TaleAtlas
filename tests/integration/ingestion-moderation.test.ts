import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import { submitRequest } from "../../apps/web/src/server/ingestion/requests";
import {
  myStoryRequest,
  amendStoryRequest,
} from "../../apps/web/src/server/ingestion/service";
import { claimJobs } from "../../apps/web/src/server/ingestion/jobs";
import { processClaimedJob } from "../../apps/web/src/server/ingestion/processor";
import { reviewStoryRequest } from "../../apps/web/src/server/ingestion/moderation";
import { POST } from "../../apps/web/src/app/api/admin/requests/[id]/review/route";
import { listWorks } from "../../apps/web/src/server/catalog/service";
import { saveWorkInTransaction } from "../../apps/web/src/server/catalog/repository";
import { getDatabase } from "../../apps/web/src/server/database";
import { workInputSchema } from "../../apps/web/src/features/catalog/contracts";
import { lockRequest } from "../../apps/web/src/server/ingestion/requests";
const f = catalogAuthFixture();
type Actor = Awaited<ReturnType<typeof f.account>>;
let owner: Actor, admin: Actor, moderator: Actor;
const requests: string[] = [];
const headers = (actor: Actor) => new Headers({ cookie: actor.cookie });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
function command(
  id: string,
  actor?: Actor,
  body: unknown = {},
  extra: Record<string, string> = {},
) {
  return new Request(`${f.origin}/api/admin/requests/${id}/review`, {
    method: "POST",
    headers: {
      origin: f.origin,
      "content-type": "application/json",
      ...(actor ? { cookie: actor.cookie } : {}),
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
function work(patch: Record<string, unknown> = {}) {
  return {
    primaryTitle: `Human verified ${randomUUID()}`,
    primaryTitleLanguage: "en",
    format: "NOVEL",
    visibility: "PUBLISHED",
    publicationReviewAcknowledged: true,
    releaseStatus: "UNKNOWN",
    source: {
      label: f.sourceLabel,
      citation: "Exact manually verified citation, not candidate data",
    },
    titles: [
      { title: `Verified alias ${f.runId}`, language: "en", kind: "ALIAS" },
    ],
    ...patch,
  };
}
async function ready() {
  const row = await submitRequest(owner.id, randomUUID(), {
    title: `PRIVATE candidate ${randomUUID()}`,
    format: "NOVEL",
    alternativeTitles: [],
    notes: "PRIVATE OWNER NOTE",
  });
  requests.push(row.id);
  const leaseOwner = `fixture:${randomUUID()}`;
  const [job] = await claimJobs(leaseOwner, 1, 30, row.id);
  expect(await processClaimedJob(job!, leaseOwner)).toBe("PROCESSED");
  const [candidate] =
    await f.client`select id from ingestion_candidates where request_id = ${row.id}`;
  return {
    id: row.id,
    revision: 3,
    inputRevision: 1,
    candidateId: String(candidate!.id),
  };
}
function approval(
  row: Awaited<ReturnType<typeof ready>>,
  patch: Record<string, unknown> = {},
) {
  const { id: _id, ...fields } = row;
  return {
    action: "APPROVE",
    ...fields,
    reason: "Human checked identity and publication",
    identityReviewAcknowledged: true,
    publicationReviewAcknowledged: true,
    work: work(),
    ...patch,
  };
}
async function snapshot(id: string) {
  return {
    request: await f.client`select * from work_requests where id = ${id}`,
    candidates:
      await f.client`select * from ingestion_candidates where request_id = ${id} order by id`,
    events:
      await f.client`select * from request_events where request_id = ${id} order by revision`,
    jobs: await f.client`select * from ingestion_jobs where request_id = ${id} order by id`,
    sources:
      await f.client`select * from catalog_sources where label = ${f.sourceLabel} order by id`,
    works:
      await f.client`select * from works where source_id in (select id from catalog_sources where label = ${f.sourceLabel}) order by id`,
  };
}
beforeAll(async () => {
  await f.start();
  owner = await f.account("user");
  admin = await f.account("admin");
  moderator = await f.account("moderator");
});
afterAll(async () => {
  requireTestDatabase();
  if (requests.length) {
    await f.client`delete from work_request_supporters where request_id in ${f.client(requests)}`;
    await f.client`delete from ingestion_candidates where request_id in ${f.client(requests)}`;
    await f.client`delete from ingestion_jobs where request_id in ${f.client(requests)}`;
    await f.client`delete from request_events where request_id in ${f.client(requests)}`;
    await f.client`delete from work_requests where id in ${f.client(requests)}`;
  }
  // Only this run's guarded UUID-labelled synthetic fixtures, never production history.
  const rows =
    await f.client`select id from works where source_id in (select id from catalog_sources where label = ${f.sourceLabel})`;
  for (const row of rows) {
    const id = String(row.id);
    await f.client`delete from catalog_field_evidence where work_id = ${id}`;
    await f.client`delete from catalog_audit_events where work_id = ${id}`;
    await f.client`delete from work_relations where from_work_id = ${id} or to_work_id = ${id}`;
    await f.client`delete from work_creators where work_id = ${id}`;
    await f.client`delete from work_titles where work_id = ${id}`;
    await f.client`delete from work_descriptions where work_id = ${id}`;
    await f.client`delete from work_genres where work_id = ${id}`;
    await f.client`delete from work_covers where work_id = ${id}`;
    await f.client`delete from work_identifiers where work_id = ${id}`;
    await f.client`delete from editions where work_id = ${id}`;
    await f.client`delete from works where id = ${id}`;
  }
  await f.client`delete from catalog_sources where label = ${f.sourceLabel}`;
  await f.stop();
});
describe.sequential(
  "V2D scoped candidate moderation real signed sessions and PostgreSQL",
  () => {
    it("authenticates before parsing, rejects header role claims, checks Origin/streamed budget and direct-call role", async () => {
      expect(
        (
          await POST(
            command(
              "bad",
              undefined,
              {},
              { "x-user-id": admin.id, "x-role": "admin" },
            ),
            context("bad"),
          )
        ).status,
      ).toBe(401);
      for (const actor of [owner, moderator]) {
        expect((await POST(command("bad", actor), context("bad"))).status).toBe(
          403,
        );
        await expect(
          reviewStoryRequest("bad", {}, headers(actor)),
        ).rejects.toMatchObject({ status: 403 });
      }
      expect(
        (
          await POST(
            command("bad", admin, {}, { origin: "https://evil.example" }),
            context("bad"),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await POST(
            command("bad", admin, {}, { "content-type": "text/plain" }),
            context("bad"),
          )
        ).status,
      ).toBe(415);
      const big = new Request(`${f.origin}/api/admin/requests/bad/review`, {
        method: "POST",
        headers: {
          cookie: admin.cookie,
          origin: f.origin,
          "content-type": "application/json",
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({ padding: "x".repeat(65537) }),
              ),
            );
            controller.close();
          },
        }),
        duplex: "half",
      } as RequestInit);
      const response = await POST(big, context("bad"));
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ error: "BODY_TOO_LARGE" });
    });
    it("rolls back wrong revision, wrong/stale candidate, invalid work, and FK failures including source/audit writes", async () => {
      const row = await ready(),
        other = await ready();
      const before = await snapshot(row.id);
      for (const patch of [
        { revision: 2 },
        { inputRevision: 2 },
        { candidateId: other.candidateId },
      ]) {
        await expect(
          reviewStoryRequest(row.id, approval(row, patch), headers(admin)),
        ).rejects.toMatchObject({ status: 409 });
        expect(await snapshot(row.id)).toEqual(before);
      }
      await expect(
        reviewStoryRequest(
          row.id,
          approval(row, { work: work({ visibility: "DRAFT" }) }),
          headers(admin),
        ),
      ).rejects.toThrow();
      await expect(
        reviewStoryRequest(
          row.id,
          approval(row, {
            work: work({
              relations: [{ toWorkId: randomUUID(), type: "SEQUEL" }],
            }),
          }),
          headers(admin),
        ),
      ).rejects.toThrow();
      expect(await snapshot(row.id)).toEqual(before);
    });
    it("rejects non-strict or mismatched request evidence snapshots without any side effects", async () => {
      const row = await ready();
      const [stored] =
        await f.client`select candidate from ingestion_candidates where id = ${row.candidateId}`;
      for (const candidate of [
        { ...stored!.candidate, unexpectedPrivateField: true },
        JSON.parse(
          JSON.stringify(stored!.candidate).replaceAll(row.id, randomUUID()),
        ),
      ]) {
        await f.client`update ingestion_candidates set candidate = ${JSON.stringify(candidate)}::jsonb where id = ${row.candidateId}`;
        const before = await snapshot(row.id);
        await expect(
          reviewStoryRequest(row.id, approval(row), headers(admin)),
        ).rejects.toMatchObject({ status: 409, code: "CANDIDATE_CONFLICT" });
        expect(await snapshot(row.id)).toEqual(before);
      }
    });
    it("keeps reusable catalog guards and rolls back outer request edits on a real audit-actor FK failure", async () => {
      const row = await ready();
      const before = await snapshot(row.id);
      await expect(
        getDatabase().transaction(async (tx) => {
          await lockRequest(tx, row.id);
          // row.id comes exclusively from our own UUID fixture, not external input.
          await tx.execute(
            `update work_requests set revision = 4 where id = '${row.id}'`,
          );
          // A nonexistent actor fails the actual audit FK after Work/source/children/evidence writes.
          await saveWorkInTransaction(
            tx,
            workInputSchema.parse(work()),
            `absent-fixture:${randomUUID()}`,
          );
        }),
      ).rejects.toMatchObject({ cause: { code: "23503" } });
      expect(await snapshot(row.id)).toEqual(before);
      await expect(
        getDatabase().transaction((tx) =>
          saveWorkInTransaction(
            tx,
            {
              ...workInputSchema.parse(work()),
              publicationReviewAcknowledged: false,
            },
            admin.id,
          ),
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(await snapshot(row.id)).toEqual(before);
    });
    it("publishes only supplied verified facts with exact V1 source/evidence/audit and request invariant", async () => {
      const row = await ready(),
        value = approval(row);
      const jobId = randomUUID();
      await f.client`insert into ingestion_jobs (id,request_id,expected_input_revision,kind,idempotency_key,state,lease_owner,lease_token,lease_expires_at) values (${jobId},${row.id},1,'REQUEST_ENRICH',${`fixture:${jobId}`},'RUNNING','fixture',${randomUUID()},clock_timestamp()+interval '1 hour')`;
      const response = await POST(
        command(row.id, admin, value),
        context(row.id),
      );
      expect(response.status).toBe(200);
      const record = await response.json();
      expect(record).toEqual({
        id: row.id,
        state: "APPROVED",
        revision: 4,
        inputRevision: 1,
        resultingWorkId: expect.any(String),
      });
      const [saved] =
        await f.client`select * from works where id = ${record.resultingWorkId}`;
      expect(saved).toMatchObject({
        primary_title: (value.work as ReturnType<typeof work>).primaryTitle,
        visibility: "PUBLISHED",
        revision: 1,
      });
      const [source] =
        await f.client`select * from catalog_sources where id = ${saved!.source_id}`;
      expect(source!.citation).toBe(
        "Exact manually verified citation, not candidate data",
      );
      const evidence =
        await f.client`select * from catalog_field_evidence where work_id = ${saved!.id}`;
      expect(evidence.length).toBeGreaterThan(0);
      expect(
        evidence.every(
          (e) => e.source_id === saved!.source_id && e.revision === 1,
        ),
      ).toBe(true);
      const [audit] =
        await f.client`select * from catalog_audit_events where work_id = ${saved!.id}`;
      expect(audit).toMatchObject({
        operation: "CREATE",
        previous_revision: null,
        new_revision: 1,
        actor_id_snapshot: admin.id,
      });
      expect(audit!.changes.publicationReviewAcknowledged).toBe(true);
      expect(audit!.changes.sourceId).toBe(saved!.source_id);
      const owned = await myStoryRequest(row.id, headers(owner));
      expect(owned.events.at(-1)!.payload).toEqual({
        reason: value.reason,
        resultingWorkId: saved!.id,
      });
      expect(JSON.stringify(owned.events.at(-1))).not.toContain("candidate");
      const [job] =
        await f.client`select state,lease_token,lease_owner,lease_expires_at from ingestion_jobs where id = ${jobId}`;
      expect(job).toEqual({
        state: "CANCELLED",
        lease_token: null,
        lease_owner: null,
        lease_expires_at: null,
      });
      expect(
        (
          await listWorks({
            q: (value.work as ReturnType<typeof work>).primaryTitle,
          })
        ).items.some((item) => item.id === saved!.id),
      ).toBe(true);
      const after = await snapshot(row.id);
      await expect(
        reviewStoryRequest(row.id, value, headers(admin)),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        amendStoryRequest(
          row.id,
          { revision: 4, details: { title: "Cannot reopen", format: "NOVEL" } },
          headers(owner),
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(await snapshot(row.id)).toEqual(after);
    });
    it("links only a locked current published revision, without changing target or copying candidate facts", async () => {
      const source = await ready();
      const approved = await reviewStoryRequest(
        source.id,
        approval(source),
        headers(admin),
      );
      const row = await ready();
      const link = {
        action: "LINK",
        revision: row.revision,
        inputRevision: 1,
        candidateId: row.candidateId,
        identityReviewAcknowledged: true,
        reason: "Explicitly checked same identity",
        workId: approved.resultingWorkId,
        workRevision: 1,
      };
      const before = await snapshot(row.id);
      await expect(
        reviewStoryRequest(
          row.id,
          { ...link, workRevision: 2 },
          headers(admin),
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(await snapshot(row.id)).toEqual(before);
      await f.client`update works set visibility = 'HIDDEN' where id = ${approved.resultingWorkId!}`;
      const hidden = await snapshot(row.id);
      await expect(
        reviewStoryRequest(row.id, link, headers(admin)),
      ).rejects.toMatchObject({ status: 409 });
      expect(await snapshot(row.id)).toEqual(hidden);
      await f.client`update works set visibility = 'PUBLISHED' where id = ${approved.resultingWorkId!}`;
      const result = await reviewStoryRequest(row.id, link, headers(admin));
      expect(result).toMatchObject({
        state: "LINKED_EXISTING",
        revision: 4,
        inputRevision: 1,
        resultingWorkId: approved.resultingWorkId,
      });
      const [target] =
        await f.client`select revision from works where id = ${approved.resultingWorkId!}`;
      expect(target!.revision).toBe(1);
      expect(
        await f.client`select * from catalog_audit_events where work_id = ${approved.resultingWorkId!}`,
      ).toHaveLength(1);
    });
    it("allows reasoned needs-info/rejection without a candidate and cannot reopen terminal decisions", async () => {
      const row = await ready();
      const needs = await reviewStoryRequest(
        row.id,
        {
          action: "NEEDS_INFO",
          revision: 3,
          reason: "Please provide source evidence",
        },
        headers(admin),
      );
      expect(needs).toMatchObject({
        state: "NEEDS_INFO",
        revision: 4,
        inputRevision: 1,
        resultingWorkId: null,
      });
      const rejected = await reviewStoryRequest(
        row.id,
        { action: "REJECT", revision: 4, reason: "No evidence supplied" },
        headers(admin),
      );
      expect(rejected).toMatchObject({
        state: "REJECTED",
        revision: 5,
        inputRevision: 1,
        resultingWorkId: null,
      });
      await expect(
        reviewStoryRequest(
          row.id,
          { action: "NEEDS_INFO", revision: 5, reason: "Reopen" },
          headers(admin),
        ),
      ).rejects.toMatchObject({ status: 409 });
    });
    it("has exactly one concurrent winner and remains deadlock-safe beyond the application SQL pool limit", async () => {
      const concurrencyAdmin = await f.account("admin");
      const row = await ready();
      const decisions = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          reviewStoryRequest(row.id, approval(row), headers(concurrencyAdmin)),
        ),
      );
      expect(decisions.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const conflicts = decisions.filter((r) => r.status === "rejected");
      expect(conflicts).toHaveLength(19);
      for (const result of conflicts)
        if (result.status === "rejected")
          expect(result.reason.status).toBe(409);
      const [saved] =
        await f.client`select state,revision,input_revision,resulting_work_id from work_requests where id = ${row.id}`;
      expect(saved).toMatchObject({
        state: "APPROVED",
        revision: 4,
        input_revision: 1,
      });
      expect(
        await f.client`select * from catalog_audit_events where work_id = ${saved!.resulting_work_id}`,
      ).toHaveLength(1);
      expect(
        await f.client`select * from request_events where request_id = ${row.id} and revision = 4`,
      ).toHaveLength(1);
    }, 15000);
    it("charges a successful HTTP review budget exactly once and direct service calls enforce the same limiter", async () => {
      const budgetAdmin = await f.account("admin"),
        row = await ready();
      expect(
        (
          await POST(
            command(row.id, budgetAdmin, {
              action: "REJECT",
              revision: 3,
              reason: "Fixture rejection",
            }),
            context(row.id),
          )
        ).status,
      ).toBe(200);
      const key = `catalog.write:${budgetAdmin.id}`;
      const [budget] =
        await f.client`select count from rate_limits where key = ${key}`;
      expect(budget!.count).toBe(1);
      await f.client`update rate_limits set count = 30 where key = ${key}`;
      await expect(
        reviewStoryRequest("bad", {}, headers(budgetAdmin)),
      ).rejects.toMatchObject({ status: 429 });
    });
  },
);
