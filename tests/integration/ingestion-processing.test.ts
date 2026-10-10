import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import { GET as list } from "../../apps/web/src/app/api/admin/ingestion/route";
import { POST as process } from "../../apps/web/src/app/api/admin/ingestion/process/route";
import {
  createStoryRequest,
  myStoryRequest,
  amendStoryRequest,
  cancelStoryRequest,
} from "../../apps/web/src/server/ingestion/service";
import { claimJobs } from "../../apps/web/src/server/ingestion/jobs";
import {
  processClaimedJob,
  processIngestion,
} from "../../apps/web/src/server/ingestion/processor";
import {
  adminIngestion,
  retrieveIdentityWorks,
} from "../../apps/web/src/server/ingestion/candidates";
import {
  normalizeIngestionCandidate,
  identityMatch,
} from "../../apps/web/src/features/ingestion/pipeline";
import { getDatabase } from "../../apps/web/src/server/database";
import { normalizeRequestTitle } from "../../apps/web/src/features/ingestion/contracts";
import {
  reviewRequestSummary,
  supportStoryRequest,
  visibleStoryRequest,
  findRequestSummaries,
} from "../../apps/web/src/server/ingestion/request-public";
const f = catalogAuthFixture();
type Actor = Awaited<ReturnType<typeof f.account>>;
let owner: Actor, admin: Actor, moderator: Actor;
const ownedRequests: string[] = [],
  ownedWorks: string[] = [],
  ownedCreators: string[] = [],
  ownedSources: string[] = [],
  ownedProviders: string[] = [],
  ownedDiscoveryJobs: string[] = [];
const headers = (a: Actor) => new Headers({ cookie: a.cookie });
const libraryRecord = () => `OL1${randomUUID().replace(/\D/g, "")}W`;
function req(
  path: string,
  actor?: Actor,
  body?: unknown,
  extra: Record<string, string> = {},
) {
  return new Request(`${f.origin}/api/admin/ingestion${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(actor ? { cookie: actor.cookie } : {}),
      origin: f.origin,
      "content-type": "application/json",
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function submitted(overrides: Record<string, unknown> = {}) {
  const row = await createStoryRequest(
    {
      submitKey: randomUUID(),
      details: {
        title: `Processing ${f.runId}`,
        format: "WEB_NOVEL",
        author: "Fixture Author",
        notes: "PRIVATE_OWNER_NOTE",
        ...overrides,
      },
    },
    headers(owner),
  );
  ownedRequests.push(row.id);
  return row;
}
async function claim(id: string, leaseOwner = `fixture:${randomUUID()}`) {
  const [job] = await claimJobs(leaseOwner, 1, 30, id);
  expect(job).toBeDefined();
  return { job: job!, leaseOwner };
}
async function snapshot(id: string) {
  const [row] =
    await f.client`select state, revision, input_revision, public_title, public_search_text from work_requests where id = ${id}`;
  const candidates =
    await f.client`select * from ingestion_candidates where request_id = ${id}`;
  const events =
    await f.client`select revision, payload from request_events where request_id = ${id} order by revision`;
  return { row, candidates, events };
}
beforeAll(async () => {
  await f.start();
  owner = await f.account("user");
  admin = await f.account("admin");
  moderator = await f.account("moderator");
});
afterAll(async () => {
  if (ownedRequests.length) {
    await f.client`delete from work_request_supporters where request_id in ${f.client(ownedRequests)}`;
    await f.client`delete from ingestion_candidates where request_id in ${f.client(ownedRequests)}`;
    await f.client`delete from ingestion_jobs where request_id in ${f.client(ownedRequests)}`;
    await f.client`delete from request_events where request_id in ${f.client(ownedRequests)}`;
    await f.client`delete from work_requests where id in ${f.client(ownedRequests)}`;
  }
  if (ownedDiscoveryJobs.length)
    await f.client`delete from ingestion_jobs where id in ${f.client(ownedDiscoveryJobs)}`;
  if (ownedProviders.length)
    await f.client`delete from provider_registry where id in ${f.client(ownedProviders)}`;
  if (ownedWorks.length) {
    await f.client`delete from editions where work_id in ${f.client(ownedWorks)}`;
    await f.client`delete from work_identifiers where work_id in ${f.client(ownedWorks)}`;
    await f.client`delete from work_creators where work_id in ${f.client(ownedWorks)}`;
    await f.client`delete from work_titles where work_id in ${f.client(ownedWorks)}`;
    await f.client`delete from works where id in ${f.client(ownedWorks)}`;
  }
  if (ownedCreators.length)
    await f.client`delete from creators where id in ${f.client(ownedCreators)}`;
  if (ownedSources.length)
    await f.client`delete from catalog_sources where id in ${f.client(ownedSources)}`;
  await f.stop();
});
describe.sequential(
  "V2C private durable processing with real authenticated roles and PostgreSQL",
  () => {
    it("checks actual roles before query/body validation and enforces origin, streaming size and bounds", async () => {
      expect((await list(req("?page=bad"))).status).toBe(401);
      expect((await list(req("?page=bad", owner))).status).toBe(403);
      expect((await list(req("?pageSize=21", moderator))).status).toBe(403);
      expect((await list(req("?pageSize=21", admin))).status).toBe(400);
      expect(
        (await process(req("/process", undefined, { limit: 99 }))).status,
      ).toBe(401);
      expect(
        (await process(req("/process", owner, { limit: 99 }))).status,
      ).toBe(403);
      expect(
        (
          await process(
            req("/process", admin, {}, { origin: "https://evil.example" }),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await process(
            req("/process", admin, {}, { "content-type": "text/plain" }),
          )
        ).status,
      ).toBe(415);
      expect(
        (await process(req("/process", admin, { padding: "x".repeat(65537) })))
          .status,
      ).toBe(413);
      expect((await process(req("/process", admin, { limit: 4 }))).status).toBe(
        400,
      );
      await expect(
        processIngestion({ limit: 99 }, headers(owner)),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        adminIngestion({ page: "bad" }, headers(owner)),
      ).rejects.toMatchObject({ status: 403 });
    });
    it("atomically stores input-origin evidence, safe history and terminal success exactly once", async () => {
      const row = await submitted();
      const { job, leaseOwner } = await claim(row.id);
      expect(await processClaimedJob(job, leaseOwner)).toBe("PROCESSED");
      const before = await snapshot(row.id);
      expect(before.row).toMatchObject({
        state: "NEEDS_REVIEW",
        revision: 3,
        input_revision: 1,
        public_title: null,
      });
      expect(before.candidates).toHaveLength(1);
      expect(before.candidates[0]!.candidate.origin).toBe("REQUEST_INPUT");
      expect(before.candidates[0]!.candidate.provenance[0]).toMatchObject({
        verified: false,
        sourceKind: "REQUEST_INPUT",
      });
      expect(before.events.map((e) => e.revision)).toEqual([1, 2, 3]);
      const [done] =
        await f.client`select state, lease_token, lease_owner from ingestion_jobs where id = ${job.id}`;
      expect(done).toMatchObject({
        state: "SUCCEEDED",
        lease_token: null,
        lease_owner: null,
      });
      expect(await processClaimedJob(job, leaseOwner)).toBe("STALE");
      expect(await snapshot(row.id)).toEqual(before);
      const visible = await myStoryRequest(row.id, headers(owner));
      expect(JSON.stringify(visible)).not.toContain('"candidate"');
      expect(JSON.stringify(visible)).not.toContain('"matches"');
      for (const event of before.events.slice(1))
        expect(Object.keys(event.payload).sort()).toEqual([
          "inputRevision",
          "jobId",
          "processingStatus",
        ]);
      const response = await list(req(`?requestId=${row.id}`, admin));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.items[0].candidate.title.value).toBe(row.details.title);
      expect(JSON.stringify(body)).not.toContain(owner.id);
      expect(JSON.stringify(body)).not.toContain(job.leaseToken!);
    });
    it("preserves independently curated B summaries with unchanged input and keeps follower/search DTOs private", async () => {
      const row = await submitted();
      const reviewed = await reviewRequestSummary(
        row.id,
        {
          revision: row.revision,
          title: `Curated ${f.runId}`,
          format: "WEB_NOVEL",
          alternativeTitles: [],
          sourceUrl: "https://example.com/review",
          reason: "Human curated fixture",
          equivalenceReviewAcknowledged: true,
        },
        headers(admin),
      );
      const follower = await f.account("user");
      await supportStoryRequest(
        row.id,
        { equivalenceAcknowledged: true },
        headers(follower),
      );
      const before = await snapshot(row.id);
      const c = await claim(row.id);
      expect(await processClaimedJob(c.job, c.leaseOwner)).toBe("PROCESSED");
      const after = await snapshot(row.id);
      expect(after.row!.revision).toBe(reviewed.revision + 2);
      expect(after.row!.input_revision).toBe(row.inputRevision);
      expect(after.row!.public_title).toBe(before.row!.public_title);
      expect(after.row!.public_search_text).toBe(
        before.row!.public_search_text,
      );
      const visible = await visibleStoryRequest(row.id, headers(follower));
      const search = await findRequestSummaries(
        { q: "Curated", page: 1, pageSize: 20 },
        headers(follower),
      );
      expect(visible.kind).toBe("FOLLOWED");
      for (const secret of [
        "PRIVATE_OWNER_NOTE",
        '"candidate"',
        '"matches"',
        owner.id,
        c.job.leaseToken!,
      ])
        expect(JSON.stringify({ visible, search })).not.toContain(secret);
    });
    it("fences expired/reclaimed leases, wrong owners and tokens without request effects", async () => {
      const row = await submitted();
      const first = await claim(row.id);
      const before = await snapshot(row.id);
      expect(await processClaimedJob(first.job, "wrong-owner")).toBe("STALE");
      expect(
        await processClaimedJob(
          { ...first.job, leaseToken: randomUUID() },
          first.leaseOwner,
        ),
      ).toBe("STALE");
      await f.client`update ingestion_jobs set lease_expires_at = clock_timestamp() - interval '1 second' where id = ${first.job.id}`;
      expect(await processClaimedJob(first.job, first.leaseOwner)).toBe(
        "STALE",
      );
      expect(await snapshot(row.id)).toEqual(before);
      const second = await claim(row.id);
      expect(second.job.id).toBe(first.job.id);
      expect(second.job.leaseToken).not.toBe(first.job.leaseToken);
      expect(await processClaimedJob(first.job, first.leaseOwner)).toBe(
        "STALE",
      );
      expect(await processClaimedJob(second.job, second.leaseOwner)).toBe(
        "PROCESSED",
      );
    });
    it("does not resurrect cancelled or amended input and processes only the new revision", async () => {
      const cancelled = await submitted();
      const c = await claim(cancelled.id);
      await cancelStoryRequest(
        cancelled.id,
        { revision: cancelled.revision },
        headers(owner),
      );
      const cancelledBefore = await snapshot(cancelled.id);
      expect(await processClaimedJob(c.job, c.leaseOwner)).toBe("STALE");
      expect(await snapshot(cancelled.id)).toEqual(cancelledBefore);
      const amended = await submitted();
      const old = await claim(amended.id);
      const updated = await amendStoryRequest(
        amended.id,
        {
          revision: amended.revision,
          details: { ...amended.details, title: `Amended ${f.runId}` },
        },
        headers(owner),
      );
      const amendedBefore = await snapshot(amended.id);
      expect(await processClaimedJob(old.job, old.leaseOwner)).toBe("STALE");
      expect(await snapshot(amended.id)).toEqual(amendedBefore);
      const fresh = await claim(amended.id);
      expect(await processClaimedJob(fresh.job, fresh.leaseOwner)).toBe(
        "PROCESSED",
      );
      expect((await snapshot(amended.id)).candidates[0]!.input_revision).toBe(
        updated.inputRevision,
      );
    });
    it("evaluates the clock after waiting on the request lock", async () => {
      const row = await submitted();
      const c = await claim(row.id);
      await f.client`update ingestion_jobs set lease_expires_at = clock_timestamp() + interval '500 milliseconds' where id = ${c.job.id}`;
      let locked!: () => void, release!: () => void;
      const ready = new Promise<void>((r) => {
        locked = r;
      });
      const hold = new Promise<void>((r) => {
        release = r;
      });
      const holder = f.client.begin(async (tx) => {
        await tx`select id from work_requests where id = ${row.id} for update`;
        locked();
        await hold;
        await tx`select pg_sleep(1)`;
      });
      await ready;
      const work = processClaimedJob(c.job, c.leaseOwner);
      release();
      const [status] = await Promise.all([work, holder]);
      expect(status).toBe("STALE");
      expect((await snapshot(row.id)).row!.state).toBe("SUBMITTED");
      expect((await snapshot(row.id)).candidates).toHaveLength(0);
    });
    it("retrieves private duplicate-title UUIDs with different-author conflicts but never merges", async () => {
      const sourceId = randomUUID();
      ownedSources.push(sourceId);
      await f.client`insert into catalog_sources (id,label,citation) values (${sourceId},'Private fixture','Private fixture citation')`;
      const title = `Private duplicate ${f.runId}`;
      for (const author of ["Fixture Author", "Different Author"]) {
        const workId = randomUUID(),
          creatorId = randomUUID();
        ownedWorks.push(workId);
        ownedCreators.push(creatorId);
        await f.client`insert into works (id,slug,primary_title,format,source_id,search_text) values (${workId},${`private-${workId}`},${title},'WEB_NOVEL',${sourceId},${normalizeRequestTitle(title)})`;
        await f.client`insert into creators (id,name) values (${creatorId},${author})`;
        await f.client`insert into work_creators (work_id,creator_id,role,source_id) values (${workId},${creatorId},'AUTHOR',${sourceId})`;
      }
      const row = await submitted({ title });
      const response = await process(
        req("/process", admin, { requestId: row.id }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ claimed: 1, processed: 1 });
      const body = await (
        await list(req(`?requestId=${row.id}`, admin))
      ).json();
      expect(body.items[0].matches).toHaveLength(2);
      expect(
        body.items[0].matches.some((m: { conflicts: string[] }) =>
          m.conflicts.includes("Author mismatch"),
        ),
      ).toBe(true);
      const visible = JSON.stringify(
        await myStoryRequest(row.id, headers(owner)),
      );
      for (const id of ownedWorks) expect(visible).not.toContain(id);
      expect(visible).not.toContain("Different Author");
      expect(
        (
          await f.client`select resulting_work_id from work_requests where id = ${row.id}`
        )[0]!.resulting_work_id,
      ).toBeNull();
    });
    it("rolls back candidate/state/history as a unit on bounded-match failure and retries only the job", async () => {
      const sourceId = randomUUID(),
        workId = randomUUID();
      ownedSources.push(sourceId);
      ownedWorks.push(workId);
      const title = `${"Long bounded title ".repeat(24)}${f.runId}`;
      await f.client`insert into catalog_sources (id,label,citation) values (${sourceId},'Rollback fixture','Rollback citation')`;
      await f.client`insert into works (id,slug,primary_title,format,source_id,search_text) values (${workId},${`rollback-${workId}`},${title},'WEB_NOVEL',${sourceId},${normalizeRequestTitle(title)})`;
      for (let i = 0; i < 99; i++)
        await f.client`insert into work_titles (work_id,title,kind,normalized,source_id) values (${workId},${title},'ALIAS',${normalizeRequestTitle(title)},${sourceId})`;
      const row = await submitted({ title });
      const before = await snapshot(row.id);
      const response = await process(
        req("/process", admin, { requestId: row.id }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ failed: 1, processed: 0 });
      expect(await snapshot(row.id)).toEqual(before);
      const [job] =
        await f.client`select state,last_error_code,attempts from ingestion_jobs where request_id = ${row.id}`;
      expect(job).toMatchObject({
        state: "RETRY_WAIT",
        last_error_code: "PROCESSING_FAILED",
        attempts: 1,
      });
    });
    it("correlates alias-only and exact identifier/provider-key retrieval to the right Work", async () => {
      const sourceId = randomUUID();
      ownedSources.push(sourceId);
      await f.client`insert into catalog_sources (id,label,citation) values (${sourceId},'Retrieval fixture','Retrieval citation')`;
      const workId = randomUUID(),
        unrelatedId = randomUUID();
      ownedWorks.push(workId, unrelatedId);
      for (const id of [workId, unrelatedId])
        await f.client`insert into works (id,slug,primary_title,format,source_id,search_text) values (${id},${`retrieval-${id}`},${`Unrelated primary ${id}`},'NOVEL',${sourceId},${`unrelated ${id}`})`;
      const alias = `Correlated alias ${f.runId}`;
      await f.client`insert into work_titles (work_id,title,kind,normalized,source_id) values (${workId},${alias},'ALIAS',${normalizeRequestTitle(alias)},${sourceId})`;
      const record = libraryRecord(),
        identifier = randomUUID();
      await f.client`insert into work_identifiers (work_id,namespace,value,source_id) values (${workId},'openlibrary',${record},${sourceId}), (${workId},'fixture',${identifier},${sourceId})`;
      const input = normalizeIngestionCandidate({
        origin: "REQUEST_INPUT",
        requestId: randomUUID(),
        inputRevision: 1,
        details: { title: alias, format: "NOVEL", alternativeTitles: [] },
      });
      expect(
        (
          await getDatabase().transaction((tx) =>
            retrieveIdentityWorks(tx, input),
          )
        ).map((w) => w.id),
      ).toEqual([workId]);
      const provenance = {
        providerId: "OPEN_LIBRARY" as const,
        sourceRecordId: record,
        retrievedAt: "2026-10-09T00:00:00Z",
      };
      const provider = normalizeIngestionCandidate({
        origin: "PROVIDER",
        candidate: {
          providerId: "OPEN_LIBRARY",
          sourceRecordId: record,
          provenance: [provenance],
          title: {
            value: `Changed provider title ${randomUUID()}`,
            provenance: [provenance],
          },
          autoPublish: false,
          humanReviewRequired: true,
        },
      });
      const providerWorks = await getDatabase().transaction((tx) =>
        retrieveIdentityWorks(tx, provider),
      );
      expect(providerWorks.map((w) => w.id)).toEqual([workId]);
      expect(
        identityMatch(provider, providerWorks)[0]!.reasons.some(
          (r) => r.kind === "EXACT_PROVIDER_RECORD",
        ),
      ).toBe(true);
      const exactRecord = randomUUID();
      const exactProvenance = { ...provenance, sourceRecordId: exactRecord };
      const exact = normalizeIngestionCandidate({
        origin: "PROVIDER",
        candidate: {
          providerId: "OPEN_LIBRARY",
          sourceRecordId: exactRecord,
          provenance: [exactProvenance],
          identifiers: {
            value: [{ namespace: "fixture", value: identifier }],
            provenance: [exactProvenance],
          },
          autoPublish: false,
          humanReviewRequired: true,
        },
      });
      expect(
        (
          await getDatabase().transaction((tx) =>
            retrieveIdentityWorks(tx, exact),
          )
        ).map((w) => w.id),
      ).toEqual([workId]);
    });
    it("retrieves actual edition ISBNs with changed titles and retains duplicate ISBN ambiguity without merging", async () => {
      const sourceId = randomUUID();
      ownedSources.push(sourceId);
      await f.client`insert into catalog_sources (id,label,citation) values (${sourceId},'ISBN edition fixture','Edition ISBN citation')`;
      const ids = [randomUUID(), randomUUID()];
      ownedWorks.push(...ids);
      const prefix = `978${randomUUID().replace(/\D/g, "").slice(0, 9).padEnd(9, "0")}`;
      const checksum =
        (10 -
          ([...prefix].reduce(
            (sum, digit, index) =>
              sum + Number(digit) * (index % 2 === 0 ? 1 : 3),
            0,
          ) %
            10)) %
        10;
      const isbn = `${prefix}${checksum}`;
      for (const id of ids) {
        await f.client`insert into works (id,slug,primary_title,format,source_id,search_text) values (${id},${`isbn-${id}`},${`Existing edition parent ${id}`},'NOVEL',${sourceId},${normalizeRequestTitle(`Existing edition parent ${id}`)})`;
        await f.client`insert into editions (work_id,isbn,source_id) values (${id},${isbn},${sourceId})`;
      }
      const record = randomUUID();
      const provenance = {
        providerId: "OPEN_LIBRARY" as const,
        sourceRecordId: record,
        retrievedAt: "2026-10-09T00:00:00Z",
      };
      const candidate = normalizeIngestionCandidate({
        origin: "PROVIDER",
        candidate: {
          providerId: "OPEN_LIBRARY",
          sourceRecordId: record,
          provenance: [provenance],
          title: {
            value: `Changed edition title ${randomUUID()}`,
            provenance: [provenance],
          },
          editions: {
            value: [
              {
                identifiers: [
                  {
                    namespace: "ISBN-13",
                    value: `${isbn.slice(0, 3)}-${isbn.slice(3, 12)}-${isbn.slice(12)}`,
                  },
                ],
              },
            ],
            provenance: [provenance],
          },
          autoPublish: false,
          humanReviewRequired: true,
        },
      });
      const retrieved = await getDatabase().transaction((tx) =>
        retrieveIdentityWorks(tx, candidate),
      );
      expect(retrieved.map((w) => w.id).sort()).toEqual([...ids].sort());
      const matches = identityMatch(candidate, retrieved);
      expect(matches).toHaveLength(2);
      for (const match of matches) {
        expect(match.ambiguous).toBe(true);
        expect(match.conflicts).toContain(
          "ISBN identifies an edition, not a unique work",
        );
        expect(match.conflicts).toContain(
          "Exact evidence matches multiple Work UUIDs",
        );
        expect(match.autoPublish).toBe(false);
      }
      expect(
        await f.client`select * from work_identifiers where work_id in ${f.client(ids)}`,
      ).toHaveLength(0);
    });
    it("uses only principal provider records, not unrelated author/edition provenance, for exact lookup", async () => {
      const sourceId = randomUUID();
      ownedSources.push(sourceId);
      await f.client`insert into catalog_sources (id,label,citation) values (${sourceId},'Principal fixture','Principal provenance citation')`;
      const wrongId = randomUUID(),
        wrongRecord = libraryRecord();
      ownedWorks.push(wrongId);
      await f.client`insert into works (id,slug,primary_title,format,source_id,search_text) values (${wrongId},${`principal-${wrongId}`},'Unrelated principal fixture','NOVEL',${sourceId},'unrelated principal fixture')`;
      await f.client`insert into work_identifiers (work_id,namespace,value,source_id) values (${wrongId},'openlibrary',${wrongRecord},${sourceId})`;
      const record = randomUUID();
      const provenance = {
        providerId: "OPEN_LIBRARY" as const,
        sourceRecordId: record,
        retrievedAt: "2026-10-09T00:00:00Z",
      };
      const unrelated = { ...provenance, sourceRecordId: wrongRecord };
      const candidate = normalizeIngestionCandidate({
        origin: "PROVIDER",
        candidate: {
          providerId: "OPEN_LIBRARY",
          sourceRecordId: record,
          provenance: [provenance, unrelated],
          creators: {
            value: [{ name: "Citation author" }],
            provenance: [unrelated],
          },
          autoPublish: false,
          humanReviewRequired: true,
        },
      });
      expect(
        await getDatabase().transaction((tx) =>
          retrieveIdentityWorks(tx, candidate),
        ),
      ).toHaveLength(0);
    });
    it("retrieves non-Latin combining titles and prioritizes exact evidence ahead of more than 20 weak hits", async () => {
      const sourceId = randomUUID();
      ownedSources.push(sourceId);
      await f.client`insert into catalog_sources (id,label,citation) values (${sourceId},'Unicode priority fixture','Unicode priority citation')`;
      const title = `漢字 e\u1ab0 Priority ${f.runId}`;
      const strongId = `f0000000-${randomUUID().slice(9)}`;
      for (let i = 0; i < 22; i++) {
        const id = i === 21 ? strongId : `10000000-${randomUUID().slice(9)}`;
        ownedWorks.push(id);
        await f.client`insert into works (id,slug,primary_title,format,source_id,search_text) values (${id},${`unicode-${id}`},${title},'NOVEL',${sourceId},${normalizeRequestTitle(title)})`;
      }
      const identifier = randomUUID(),
        record = randomUUID();
      await f.client`insert into work_identifiers (work_id,namespace,value,source_id) values (${strongId},'fixture',${identifier},${sourceId})`;
      const provenance = {
        providerId: "OPEN_LIBRARY" as const,
        sourceRecordId: record,
        retrievedAt: "2026-10-09T00:00:00Z",
      };
      const candidate = normalizeIngestionCandidate({
        origin: "PROVIDER",
        candidate: {
          providerId: "OPEN_LIBRARY",
          sourceRecordId: record,
          provenance: [provenance],
          title: { value: title, provenance: [provenance] },
          identifiers: {
            value: [{ namespace: "fixture", value: identifier }],
            provenance: [provenance],
          },
          autoPublish: false,
          humanReviewRequired: true,
        },
      });
      const retrieved = await getDatabase().transaction((tx) =>
        retrieveIdentityWorks(tx, candidate),
      );
      expect(retrieved).toHaveLength(20);
      expect(retrieved[0]!.id).toBe(strongId);
      expect(retrieved.some((w) => w.id === strongId)).toBe(true);
      const input = normalizeIngestionCandidate({
        origin: "REQUEST_INPUT",
        requestId: randomUUID(),
        inputRevision: 1,
        details: { title, format: "NOVEL", alternativeTitles: [] },
      });
      expect(
        await getDatabase().transaction((tx) =>
          retrieveIdentityWorks(tx, input),
        ),
      ).toHaveLength(20);
    });
    it("terminates disabled discovery without reporting success or retrying", async () => {
      const row = await submitted();
      const providerId = `fixture-${randomUUID()}`,
        jobId = randomUUID();
      ownedProviders.push(providerId);
      ownedDiscoveryJobs.push(jobId);
      await f.client`insert into provider_registry (id, policy, enabled) values (${providerId}, '{}'::jsonb, false)`;
      await f.client`insert into ingestion_jobs (id, request_id, expected_input_revision, provider_id, kind, idempotency_key, run_after) values (${jobId},${row.id},1,${providerId},'DISCOVER_PROVIDER',${`fixture:${jobId}`},'2000-01-01')`;
      const c = await claim(row.id);
      expect(c.job.id).toBe(jobId);
      expect(await processClaimedJob(c.job, c.leaseOwner)).toBe("DISABLED");
      const [done] =
        await f.client`select state,last_error_code,lease_token from ingestion_jobs where id = ${jobId}`;
      expect(done).toMatchObject({
        state: "DEAD_LETTER",
        last_error_code: "PROVIDER_DISABLED",
        lease_token: null,
      });
      expect((await snapshot(row.id)).row!.state).toBe("SUBMITTED");
      expect((await snapshot(row.id)).candidates).toHaveLength(0);
      expect(await processClaimedJob(c.job, c.leaseOwner)).toBe("STALE");
    });
    it("cancels live obsolete-input jobs without any request or snapshot effects", async () => {
      const row = await submitted();
      const c = await claim(row.id);
      await f.client`update ingestion_jobs set expected_input_revision = 2 where id = ${c.job.id}`;
      const before = await snapshot(row.id);
      expect(await processClaimedJob(c.job, c.leaseOwner)).toBe("STALE");
      expect(await snapshot(row.id)).toEqual(before);
      const [done] =
        await f.client`select state,lease_token from ingestion_jobs where id = ${c.job.id}`;
      expect(done).toMatchObject({ state: "CANCELLED", lease_token: null });
    });
    it("charges the existing admin budget once, never resets unrelated limiter rows", async () => {
      const budgetAdmin = await f.account("admin");
      const response = await process(
        req("/process", budgetAdmin, { requestId: randomUUID() }),
      );
      expect(response.status).toBe(200);
      const [budget] =
        await f.client`select count from rate_limits where key = ${`catalog.write:${budgetAdmin.id}`}`;
      expect(budget!.count).toBe(1);
      await f.client`update rate_limits set count = 30 where key = ${`catalog.write:${budgetAdmin.id}`}`;
      expect(
        (
          await process(
            req("/process", budgetAdmin, { requestId: randomUUID() }),
          )
        ).status,
      ).toBe(429);
    });
  },
);
