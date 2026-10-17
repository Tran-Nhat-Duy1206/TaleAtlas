import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import { createWork } from "../../apps/web/src/server/catalog/service";
import {
  submitMetadataSuggestion,
  reviewMetadataSuggestion,
} from "../../apps/web/src/server/catalog/metadata-suggestions";
import { POST as review } from "../../apps/web/src/app/api/admin/metadata-suggestions/[id]/review/route";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import type { MetadataSuggestion } from "../../apps/web/src/features/catalog/metadata-suggestion-contracts";

const f = catalogAuthFixture();
type Actor = Awaited<ReturnType<typeof f.account>>;
type Reserved = Awaited<ReturnType<typeof f.client.reserve>>;
let admin: Actor;
const workIds = new Set<string>();
const headers = (a: Actor) =>
  new Headers({ cookie: a.cookie, origin: f.origin });
const settle = <T>(p: Promise<T>) =>
  p.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
async function fixture() {
  const owner = await f.account("user");
  const w = (await createWork(
    {
      primaryTitle: `Concurrency ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      releaseStatus: "UNKNOWN",
      publicationReviewAcknowledged: true,
      source: {
        label: f.sourceLabel,
        citation: "Synthetic concurrency baseline",
      },
      titles: [{ title: "Untouched sibling", language: "vi", kind: "ALIAS" }],
      descriptions: [{ language: "en", text: "Untouched summary" }],
    },
    headers(admin),
  )) as AdminWork;
  workIds.add(w.id);
  const input = {
    version: 1,
    workId: w.id,
    baseWorkRevision: w.revision,
    submitKey: randomUUID(),
    operation: {
      type: "TITLE_ADD",
      value: {
        title: `Concurrent published ${randomUUID()}`,
        language: "fr",
        kind: "ALIAS",
      },
    },
    citation: {
      label: f.sourceLabel,
      citation: `Private concurrency ${f.runId}`,
    },
  };
  const s = await submitMetadataSuggestion(w.id, input, headers(owner));
  return { owner, w, input, s };
}
function decision(s: MetadataSuggestion) {
  return {
    version: 1,
    suggestionId: s.id,
    revision: s.revision,
    baseWorkRevision: s.baseWorkRevision,
    decision: "APPROVE",
    reason: `Private concurrency review ${f.runId}`,
    metadataReviewAcknowledged: true,
    publicationReviewAcknowledged: true,
    rightsReviewAcknowledged: true,
  };
}
function approve(s: MetadataSuggestion) {
  return review(
    new Request(`${f.origin}/api/admin/metadata-suggestions/${s.id}/review`, {
      method: "POST",
      headers: {
        cookie: admin.cookie,
        origin: f.origin,
        "content-type": "application/json",
      },
      body: JSON.stringify(decision(s)),
    }),
    { params: Promise.resolve({ id: s.id }) },
  );
}
async function snapshot(id: string) {
  return {
    work: [...(await f.client`select * from works where id=${id}`)],
    titles: [
      ...(await f.client`select * from work_titles where work_id=${id} order by id`),
    ],
    descriptions: [
      ...(await f.client`select * from work_descriptions where work_id=${id} order by language`),
    ],
    sources: [
      ...(await f.client`select * from catalog_sources where label=${f.sourceLabel} order by id`),
    ],
    audits: [
      ...(await f.client`select * from catalog_audit_events where work_id=${id} order by id`),
    ],
    evidence: [
      ...(await f.client`select * from catalog_metadata_evidence where work_id=${id} order by id`),
    ],
  };
}
/** Observe real lock dependencies, never retry a mutation or sleep for presumed ordering. */
async function blockedBy(
  observer: Reserved,
  blocker: number,
  expectedWaiter?: number,
) {
  const deadline = Date.now() + 4500;
  do {
    const rows =
      await observer`select pid from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and ${blocker}::integer = any(pg_blocking_pids(pid)) and (${expectedWaiter ?? null}::integer is null or pid=${expectedWaiter ?? null}::integer)`;
    if (rows.length === 1) return Number(rows[0].pid);
    if (rows.length > 1)
      throw new Error("Owned lock barrier unexpectedly has multiple waiters");
  } while (Date.now() < deadline);
  throw new Error(
    "Owned PostgreSQL lock dependency did not materialize within 4.5 seconds",
  );
}
async function erased(id: string) {
  const [row] =
    await f.client`select * from metadata_edit_suggestions where id=${id}`;
  expect(row.content_state).toBe("ERASED");
  expect(row.owner_user_id).toBeNull();
  expect(row.erased_at).toBeTruthy();
  for (const key of [
    "title_id",
    "title_text",
    "title_language",
    "title_kind",
    "description_language",
    "description_text",
    "genre_slug",
    "operation_reason",
    "citation_label",
    "citation_text",
    "citation_url",
    "citation_consulted_at",
    "rights_basis",
    "originality_acknowledged",
    "rights_statement",
    "submit_key",
    "input_hash",
  ])
    expect(row[key]).toBeNull();
  return row;
}
beforeAll(async () => {
  await f.start();
  admin = await f.account("admin");
});
afterAll(async () => {
  requireTestDatabase();
  try {
    for (const id of workIds)
      expect(
        await f.client`update works set visibility='HIDDEN' where id=${id} and source_id in (select id from catalog_sources where label=${f.sourceLabel}) returning id`,
      ).toHaveLength(1);
  } finally {
    await f.stop();
  }
});
describe.sequential(
  "V5B real PostgreSQL publication/erasure lock ordering",
  () => {
    it("APPROVE owns principals before Work wait; owner DELETE waits, then erases only private content after publication", async () => {
      const { owner, w, input, s } = await fixture();
      const before = await snapshot(w.id);
      const a = await f.client.reserve(),
        c = await f.client.reserve();
      let reviewTask: ReturnType<typeof settle<Response>> | undefined;
      let deleteTask: ReturnType<typeof settle<unknown>> | undefined;
      let holding = false;
      try {
        await a`begin`;
        holding = true;
        const [{ pid: aPid }] = await a`select pg_backend_pid() as pid`;
        const [{ pid: cPid }] = await c`select pg_backend_pid() as pid`;
        await a`select id from works where id=${w.id} for update`;
        reviewTask = settle(approve(s));
        const bPid = await blockedBy(a, Number(aPid));
        deleteTask = settle(
          c`delete from users where id=${owner.id} and email=${owner.email}`.execute(),
        );
        await blockedBy(a, bPid, Number(cPid));
        await a`commit`;
        holding = false;
        const reviewed = await reviewTask;
        expect(reviewed.ok).toBe(true);
        if (!reviewed.ok) throw reviewed.error;
        expect(reviewed.value.status).toBe(200);
        const deleted = await deleteTask;
        expect(deleted.ok).toBe(true);
        if (!deleted.ok) throw deleted.error;
        const row = await erased(s.id);
        expect(row.state).toBe("APPROVED");
        expect(row.applied_work_revision).toBe(w.revision + 1);
        const after = await snapshot(w.id);
        expect(after.work[0].revision).toBe(w.revision + 1);
        expect(
          after.titles.filter((t) => t.title === input.operation.value.title),
        ).toHaveLength(1);
        for (const t of before.titles)
          expect(after.titles.find((r) => r.id === t.id)).toEqual(t);
        expect(after.descriptions).toEqual(before.descriptions);
        expect(after.sources.length).toBe(before.sources.length + 1);
        expect(after.audits.length).toBe(before.audits.length + 1);
        expect(after.evidence).toHaveLength(1);
        const events =
          await f.client`select * from metadata_edit_events where suggestion_id=${s.id} order by revision`;
        expect(events).toHaveLength(2);
        expect(events[1].review_reason).toBeNull();
        expect(events[1].reason_redacted).toBe(true);
      } finally {
        // Releasing A always unblocks both real operations before connections/accounts close.
        try {
          if (holding) await a`rollback`;
        } finally {
          try {
            await Promise.all([reviewTask, deleteTask]);
          } finally {
            a.release();
            c.release();
          }
        }
      }
    });
    it("DELETE owns proposer before header wait; APPROVE waits on DELETE and fails closed after irreversible erasure", async () => {
      const { owner, w, s } = await fixture();
      const before = await snapshot(w.id);
      const a = await f.client.reserve(),
        c = await f.client.reserve();
      let reviewTask: ReturnType<typeof settle<Response>> | undefined;
      let deleteTask: ReturnType<typeof settle<unknown>> | undefined;
      let holding = false;
      try {
        await a`begin`;
        holding = true;
        const [{ pid: aPid }] = await a`select pg_backend_pid() as pid`;
        const [{ pid: cPid }] = await c`select pg_backend_pid() as pid`;
        await a`select id from metadata_edit_suggestions where id=${s.id} for update`;
        deleteTask = settle(
          c`delete from users where id=${owner.id} and email=${owner.email}`.execute(),
        );
        await blockedBy(a, Number(aPid), Number(cPid));
        reviewTask = settle(approve(s));
        const bPid = await blockedBy(a, Number(cPid));
        expect(bPid).not.toBe(Number(aPid));
        await a`commit`;
        holding = false;
        const deleted = await deleteTask;
        expect(deleted.ok).toBe(true);
        if (!deleted.ok) throw deleted.error;
        const reviewed = await reviewTask;
        expect(reviewed.ok).toBe(true);
        if (!reviewed.ok) throw reviewed.error;
        expect([403, 409]).toContain(reviewed.value.status);
        const row = await erased(s.id);
        expect(row.state).toBe("SUBMITTED");
        expect(row.revision).toBe(1);
        expect(await snapshot(w.id)).toEqual(before);
        expect(
          await f.client`select * from metadata_edit_events where suggestion_id=${s.id}`,
        ).toHaveLength(1);
      } finally {
        try {
          if (holding) await a`rollback`;
        } finally {
          try {
            await Promise.all([reviewTask, deleteTask]);
          } finally {
            a.release();
            c.release();
          }
        }
      }
    });
    it("rejects an exact genre target deleted by operator curation after its MVCC display snapshot", async () => {
      requireTestDatabase();
      const { owner, w, input } = await fixture();
      const slug = `aaa-meta-race-${randomUUID()}`;
      const nameEn = `Owned operator curation ${f.runId}`;
      const nameVi = `Thể loại riêng ${f.runId}`;
      await f.client`insert into genres (slug, name_en, name_vi) values (${slug}, ${nameEn}, ${nameVi})`;
      const before = await snapshot(w.id);
      const proposals = [
        ...(await f.client`select * from metadata_edit_suggestions where work_id=${w.id} order by id`),
      ];
      const events = [
        ...(await f.client`select e.* from metadata_edit_events e join metadata_edit_suggestions s on s.id=e.suggestion_id where s.work_id=${w.id} order by e.id`),
      ];
      const memberships = [
        ...(await f.client`select * from work_genres where work_id=${w.id} order by genre_slug`),
      ];
      const otherGenres = [
        ...(await f.client`select * from genres where slug<>${slug} order by slug`),
      ];
      const a = await f.client.reserve(),
        c = await f.client.reserve();
      let holding = false;
      let submitTask: ReturnType<typeof settle<MetadataSuggestion>> | undefined;
      try {
        await c`begin`;
        holding = true;
        const [{ pid: cPid }] = await c`select pg_backend_pid() as pid`;
        expect(
          await c`delete from genres where slug=${slug} and name_en=${nameEn} and name_vi=${nameVi} and not exists (select 1 from work_genres where genre_slug=${slug}) returning slug`,
        ).toHaveLength(1);
        // A sees the old version while C's controlled single-row deletion is uncommitted.
        expect(
          await a`select slug from genres where slug=${slug}`,
        ).toHaveLength(1);
        submitTask = settle(
          submitMetadataSuggestion(
            w.id,
            {
              ...input,
              submitKey: randomUUID(),
              operation: { type: "GENRE_ADD_MEMBERSHIP", slug },
            },
            headers(owner),
          ),
        );
        const bPid = await blockedBy(a, Number(cPid));
        const [waiting] =
          await a`select query from pg_stat_activity where pid=${bPid}`;
        expect(waiting.query).toMatch(/genres/);
        expect(waiting.query).toMatch(/for share/i);
        await c`commit`;
        holding = false;
        const attempted = await submitTask;
        expect(attempted.ok).toBe(false);
        if (attempted.ok)
          throw new Error(
            "Deleted genre unexpectedly produced a metadata proposal",
          );
        expect(attempted.error).toMatchObject({
          status: 409,
          code: "TARGET_MISSING",
        });
        expect(await snapshot(w.id)).toEqual(before);
        expect([
          ...(await f.client`select * from metadata_edit_suggestions where work_id=${w.id} order by id`),
        ]).toEqual(proposals);
        expect([
          ...(await f.client`select e.* from metadata_edit_events e join metadata_edit_suggestions s on s.id=e.suggestion_id where s.work_id=${w.id} order by e.id`),
        ]).toEqual(events);
        expect([
          ...(await f.client`select * from work_genres where work_id=${w.id} order by genre_slug`),
        ]).toEqual(memberships);
        expect(
          await f.client`select slug from genres where slug=${slug}`,
        ).toHaveLength(0);
        expect([
          ...(await f.client`select * from genres where slug<>${slug} order by slug`),
        ]).toEqual(otherGenres);
      } finally {
        try {
          if (holding) await c`rollback`;
        } finally {
          try {
            if (submitTask) await submitTask;
          } finally {
            a.release();
            c.release();
            // Only the generated, unreferenced operator-fixture definition is eligible.
            await f.client`delete from genres where slug=${slug} and name_en=${nameEn} and name_vi=${nameVi} and not exists (select 1 from work_genres where genre_slug=${slug})`;
          }
        }
      }
    });
    it("serializes simultaneous owner and reviewer erasure without a parent-event lock cycle", async () => {
      requireTestDatabase();
      const { owner, w, s } = await fixture();
      const reviewer = await f.account("admin");
      const approved = await review(
        new Request(
          `${f.origin}/api/admin/metadata-suggestions/${s.id}/review`,
          {
            method: "POST",
            headers: {
              cookie: reviewer.cookie,
              origin: f.origin,
              "content-type": "application/json",
            },
            body: JSON.stringify(decision(s)),
          },
        ),
        { params: Promise.resolve({ id: s.id }) },
      );
      expect(approved.status).toBe(200);
      const before = await snapshot(w.id);
      const expected = {
        ...before,
        audits: before.audits.map((row) =>
          row.actor_user_id === reviewer.id
            ? { ...row, actor_user_id: null }
            : row,
        ),
      };
      const a = await f.client.reserve(),
        b = await f.client.reserve();
      let aHolding = false,
        bHolding = false,
        reviewerDone = false;
      let ownerTask: ReturnType<typeof settle<unknown>> | undefined;
      let reviewerTask: ReturnType<typeof settle<unknown>> | undefined;
      try {
        await a`begin`;
        aHolding = true;
        const [{ pid: aPid }] = await a`select pg_backend_pid() as pid`;
        const [{ pid: bPid }] = await b`select pg_backend_pid() as pid`;
        expect(
          await a`select id from users where id=${owner.id} and email=${owner.email} for update`,
        ).toHaveLength(1);
        expect(
          await a`select id from metadata_edit_suggestions where id=${s.id} for update`,
        ).toHaveLength(1);
        reviewerTask = settle(
          (async () => {
            await b`begin`;
            bHolding = true;
            try {
              const rows =
                await b`delete from users where id=${reviewer.id} and email=${reviewer.email} returning id`;
              await b`commit`;
              bHolding = false;
              return rows;
            } catch (error) {
              try {
                await b`rollback`;
              } finally {
                bHolding = false;
              }
              throw error;
            }
          })(),
        ).then((result) => {
          reviewerDone = true;
          return result;
        });
        // Old guard: B holds event E and waits on A's header. Correct privacy-only
        // guard: B may already finish, so requiring a parent wait would reject the fix.
        const deadline = Date.now() + 4500;
        let reached = false;
        do {
          const waiting =
            await a`select query from pg_stat_activity where pid=${bPid} and wait_event_type='Lock' and ${aPid}::integer=any(pg_blocking_pids(pid))`;
          if (waiting.length === 1) {
            expect(waiting[0].query).toMatch(/delete from users/i);
            reached = true;
            break;
          }
          if (reviewerDone) {
            reached = true;
            break;
          }
        } while (Date.now() < deadline);
        expect(
          reached,
          "Reviewer erasure must either reach the owned header lock or finish without that unnecessary lock within 4.5 seconds",
        ).toBe(true);
        ownerTask = settle(
          (async () => {
            try {
              const rows =
                await a`delete from users where id=${owner.id} and email=${owner.email} returning id`;
              await a`commit`;
              aHolding = false;
              return rows;
            } catch (error) {
              try {
                await a`rollback`;
              } finally {
                aHolding = false;
              }
              throw error;
            }
          })(),
        );
        const [deletedOwner, deletedReviewer] = await Promise.all([
          ownerTask,
          reviewerTask,
        ]);
        expect(
          {
            committed: deletedOwner.ok,
            sqlState: deletedOwner.ok ? null : deletedOwner.error?.code,
          },
          "Owner deletion must commit without a parent-event deadlock or timeout",
        ).toEqual({ committed: true, sqlState: null });
        expect(
          {
            committed: deletedReviewer.ok,
            sqlState: deletedReviewer.ok ? null : deletedReviewer.error?.code,
          },
          "Reviewer deletion must commit without a parent-event deadlock or timeout",
        ).toEqual({ committed: true, sqlState: null });
        if (!deletedOwner.ok) throw deletedOwner.error;
        if (!deletedReviewer.ok) throw deletedReviewer.error;
        expect(deletedOwner.value).toHaveLength(1);
        expect(deletedReviewer.value).toHaveLength(1);
        expect(
          await f.client`select id from users where id in (${owner.id},${reviewer.id})`,
        ).toHaveLength(0);
        const header = await erased(s.id);
        expect(header.state).toBe("APPROVED");
        expect(header.revision).toBe(2);
        expect(header.applied_work_revision).toBe(w.revision + 1);
        const events =
          await f.client`select * from metadata_edit_events where suggestion_id=${s.id} order by revision`;
        expect(events).toHaveLength(2);
        for (const event of events) {
          expect(event.actor_user_id).toBeNull();
          expect(event.review_reason).toBeNull();
          expect(event.reason_redacted).toBe(true);
        }
        // Frozen V1 audit actor FK nulling is expected; every other factual value,
        // source/audit/evidence identity, and row count must remain unchanged.
        expect(await snapshot(w.id)).toEqual(expected);
      } finally {
        try {
          // Before launching ownerTask, A is the only manually held blocker.
          if (!ownerTask && aHolding) {
            await a`rollback`;
            aHolding = false;
          }
        } finally {
          try {
            await Promise.all([ownerTask, reviewerTask]);
          } finally {
            try {
              if (aHolding) await a`rollback`;
            } finally {
              try {
                if (bHolding) await b`rollback`;
              } finally {
                a.release();
                b.release();
              }
            }
          }
        }
      }
    });
    it("same-PK session-token rotation, expiry and verification revocation after preflight cannot authorize publication", async () => {
      for (const change of ["TOKEN", "EXPIRY", "VERIFIED"] as const) {
        const { w, s } = await fixture();
        const reviewer = await f.account("admin");
        const before = await snapshot(w.id);
        const [session] =
          await f.client`select id from sessions where user_id=${reviewer.id}`;
        expect(session).toBeTruthy();
        const attempt = await settle(
          reviewMetadataSuggestion(
            s.id,
            async () => {
              if (change === "TOKEN")
                await f.client`update sessions set token=${randomUUID()} where id=${session.id} and user_id=${reviewer.id}`;
              else if (change === "EXPIRY")
                await f.client`update sessions set expires_at=clock_timestamp()-interval '1 second' where id=${session.id} and user_id=${reviewer.id}`;
              else
                await f.client`update users set email_verified=false where id=${reviewer.id} and email=${reviewer.email}`;
              return decision(s);
            },
            headers(reviewer),
          ),
        );
        expect(attempt.ok).toBe(false);
        if (attempt.ok)
          throw new Error("Revoked principal unexpectedly published");
        expect(attempt.error).toMatchObject({
          status: change === "VERIFIED" ? 403 : 401,
        });
        expect(await snapshot(w.id)).toEqual(before);
        expect(
          (
            await f.client`select state from metadata_edit_suggestions where id=${s.id}`
          )[0].state,
        ).toBe("SUBMITTED");
        expect(
          await f.client`select * from metadata_edit_events where suggestion_id=${s.id}`,
        ).toHaveLength(1);
      }
    });
  },
);
