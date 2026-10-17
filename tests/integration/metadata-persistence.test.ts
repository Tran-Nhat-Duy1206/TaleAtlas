import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import { createWork } from "../../apps/web/src/server/catalog/service";
import {
  submitMetadataSuggestion,
  reviewMetadataSuggestion,
} from "../../apps/web/src/server/catalog/metadata-suggestions";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import type { SubmitMetadataProposal } from "../../apps/web/src/features/catalog/metadata-operations";
import type { MetadataSuggestion } from "../../apps/web/src/features/catalog/metadata-suggestion-contracts";

// Deliberately real SQL + Better Auth/SMTP fixture, never an auth or database mock.
// The parent runner owns the disposable migrated cluster. This file never disables
// guards, truncates for cleanup, or deletes append-only history.
const f = catalogAuthFixture();
type Actor = Awaited<ReturnType<typeof f.account>>;
let owner: Actor, other: Actor, admin: Actor;
const workIds = new Set<string>();
const headers = (actor: Actor) =>
  new Headers({ cookie: actor.cookie, origin: f.origin });
const rights = {
  basis: "ORIGINAL_SUMMARY" as const,
  originalityAcknowledged: true as const,
  statement: "PRIVATE persistence rights",
};
async function work() {
  const value = (await createWork(
    {
      primaryTitle: `Persistence ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      source: {
        label: f.sourceLabel,
        citation: "Initial persistence citation",
      },
      titles: [{ title: "Persistence sibling", language: "en", kind: "ALIAS" }],
      descriptions: [{ language: "en", text: "Initial persistence summary" }],
    },
    headers(admin),
  )) as AdminWork;
  workIds.add(value.id);
  return value;
}
function input(
  w: { id: string; revision: number },
  operation: SubmitMetadataProposal["operation"],
): SubmitMetadataProposal {
  return {
    version: 1,
    workId: w.id,
    baseWorkRevision: w.revision,
    submitKey: randomUUID(),
    citation: {
      label: f.sourceLabel,
      citation: `PRIVATE persistence citation ${f.runId}`,
      url: "https://example.invalid/persistence",
      consultedAt: "2026-01-02T03:04:05.123Z",
    },
    operation,
  };
}
async function proposal(
  w: { id: string; revision: number },
  actor = owner,
  operation: SubmitMetadataProposal["operation"] = {
    type: "TITLE_ADD",
    value: {
      title: `Private alias ${randomUUID()}`,
      language: "en",
      kind: "ALIAS",
    },
  },
) {
  return (await submitMetadataSuggestion(
    w.id,
    input(w, operation),
    headers(actor),
  )) as MetadataSuggestion;
}
async function review(s: MetadataSuggestion, approve = true, actor = admin) {
  return (await reviewMetadataSuggestion(
    s.id,
    {
      version: 1,
      suggestionId: s.id,
      revision: s.revision,
      baseWorkRevision: s.baseWorkRevision,
      decision: approve ? "APPROVE" : "REJECT",
      reason: `PRIVATE persistence review ${f.runId}`,
      ...(approve
        ? {
            metadataReviewAcknowledged: true,
            publicationReviewAcknowledged: true,
            rightsReviewAcknowledged: true,
          }
        : {}),
    },
    headers(actor),
  )) as MetadataSuggestion;
}
async function row(id: string) {
  const [value] =
    await f.client`select * from metadata_edit_suggestions where id=${id}`;
  expect(value).toBeTruthy();
  return value!;
}
// Even a broken guard cannot let a destructive mutation escape this transaction.
// The sentinel has no SQLSTATE, so unexpected acceptance fails the code assertion.
async function rejectsSql(
  statement: string,
  parameters: (string | number | boolean | null)[] = [],
  code = "23514",
) {
  requireTestDatabase();
  await expect(
    f.client.begin(async (tx) => {
      await tx.unsafe(statement, parameters);
      throw new Error(
        "guard unexpectedly accepted SQL; rolling back deliberately",
      );
    }),
  ).rejects.toMatchObject({ code });
}
const cloneHeader = `insert into metadata_edit_suggestions select (jsonb_populate_record(null::metadata_edit_suggestions, to_jsonb(s) || $2::jsonb)).* from metadata_edit_suggestions s where id=$1`;

beforeAll(async () => {
  await f.start();
  owner = await f.account("user");
  other = await f.account("user");
  admin = await f.account("admin");
});
beforeEach(async () => {
  requireTestDatabase();
  for (const actor of f.users)
    await f.client`delete from rate_limits where key=${`catalog.write:${actor.id}`}`;
});
afterAll(async () => {
  requireTestDatabase();
  try {
    for (const id of workIds) {
      const hidden =
        await f.client`update works set visibility='HIDDEN' where id=${id} and source_id in (select id from catalog_sources where label=${f.sourceLabel}) returning id`;
      expect(hidden).toHaveLength(1);
    }
  } finally {
    await f.stop();
  }
});

describe.sequential(
  "V5B typed persistence and irreversible privacy guards (real SQL)",
  () => {
    it("rejects null-pass discriminator and raw mass-assignment shapes without persisting partial proposals", async () => {
      const s = await proposal(await work());
      const baseline = await row(s.id);
      const invalid = [
        { title_text: null },
        { title_language: null },
        { title_kind: null },
        { title_id: randomUUID() },
        { description_text: "unrelated payload" },
        { rights_statement: "unrelated private statement" },
        { citation_label: null },
        { citation_text: null },
        { submit_key: null },
        { input_hash: null },
        { input_hash: "A".repeat(64) },
        { version: 2 },
        { base_work_revision: 0 },
        { title_language: "english" },
        { title_text: "x".repeat(501) },
        { operation_type: "ARBITRARY_PATCH" },
        { state: "APPROVED", revision: 2, applied_work_revision: 2 },
        { content_state: "ERASED", owner_user_id: null },
        {
          operation_type: "DESCRIPTION_ADD",
          title_text: null,
          title_language: null,
          title_kind: null,
          description_language: "en",
          description_text: "summary",
          rights_basis: "ORIGINAL_SUMMARY",
          originality_acknowledged: null,
          rights_statement: "declaration",
        },
        {
          operation_type: "GENRE_REMOVE_MEMBERSHIP",
          title_text: null,
          title_language: null,
          title_kind: null,
          genre_slug: "fantasy",
          operation_reason: null,
        },
        {
          operation_type: "DESCRIPTION_ADD",
          title_text: null,
          title_language: null,
          title_kind: null,
          description_language: "en",
          description_text: "界".repeat(20000),
          rights_basis: "ORIGINAL_SUMMARY",
          originality_acknowledged: true,
          rights_statement: "declaration",
        },
      ];
      for (const patch of invalid) {
        const id = randomUUID();
        await rejectsSql(cloneHeader, [
          s.id,
          JSON.stringify({ id, submit_key: randomUUID(), ...patch }),
        ]);
        expect(
          await f.client`select id from metadata_edit_suggestions where id=${id}`,
        ).toHaveLength(0);
      }
      expect(await row(s.id)).toEqual(baseline);
    });

    it("preserves lexical citation TEXT without inventing a 64-character datetime or lowercase URL constraint", async () => {
      const s = await proposal(await work());
      const id = randomUUID();
      const consultedAt = `2026-01-02T03:04:05.${"1".repeat(100)}Z`;
      await expect(
        f.client.begin(async (tx) => {
          await tx.unsafe(cloneHeader, [
            s.id,
            JSON.stringify({
              id,
              submit_key: randomUUID(),
              citation_consulted_at: consultedAt,
              citation_url: "HTTPS://EXAMPLE.INVALID/persistence",
            }),
          ]);
          await tx`insert into metadata_edit_events (suggestion_id,revision,to_state,actor_user_id) values (${id},1,'SUBMITTED',${owner.id})`;
          await tx`set constraints all immediate`;
          const [stored] =
            await tx`select citation_consulted_at,citation_url from metadata_edit_suggestions where id=${id}`;
          expect(stored!.citation_consulted_at).toBe(consultedAt);
          expect(stored!.citation_url).toBe(
            "HTTPS://EXAMPLE.INVALID/persistence",
          );
          throw new Error("lexical storage verified; deliberate rollback");
        }),
      ).rejects.toThrow("lexical storage verified; deliberate rollback");
      expect(
        await f.client`select id from metadata_edit_suggestions where id=${id}`,
      ).toHaveLength(0);
    });

    it("forbids submitted-field/key/owner mutation and proposal deletion", async () => {
      const s = await proposal(await work());
      const baseline = await row(s.id);
      for (const [column, value] of [
        ["title_text", "mass assigned"],
        ["input_hash", "0".repeat(64)],
        ["submit_key", randomUUID()],
        ["owner_user_id", other.id],
        ["owner_user_id", null],
        ["work_id", randomUUID()],
        ["operation_reason", "invented reason"],
      ] as const) {
        await rejectsSql(
          `update metadata_edit_suggestions set ${column}=$2 where id=$1`,
          [s.id, value],
        );
      }
      await rejectsSql("delete from metadata_edit_suggestions where id=$1", [
        s.id,
      ]);
      expect(await row(s.id)).toEqual(baseline);
    });

    it("requires the initial event at transaction end and rolls back rejected/approved lifecycle without complete terminal history", async () => {
      const s = await proposal(await work());
      const clone = randomUUID();
      await expect(
        f.client.begin(async (tx) => {
          await tx.unsafe(cloneHeader, [
            s.id,
            JSON.stringify({ id: clone, submit_key: randomUUID() }),
          ]);
        }),
      ).rejects.toMatchObject({ code: "23514" });
      expect(
        await f.client`select id from metadata_edit_suggestions where id=${clone}`,
      ).toHaveLength(0);
      await expect(
        f.client.begin(async (tx) => {
          await tx`update metadata_edit_suggestions set state='REJECTED', revision=2 where id=${s.id}`;
        }),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        f.client.begin(async (tx) => {
          await tx`update metadata_edit_suggestions set state='APPROVED', revision=2, applied_work_revision=base_work_revision+1 where id=${s.id}`;
          await tx`insert into metadata_edit_events (suggestion_id, revision, from_state, to_state, actor_user_id, review_reason, applied_work_revision, metadata_review_acknowledged, publication_review_acknowledged, rights_review_acknowledged) values (${s.id},2,'SUBMITTED','APPROVED',${admin.id},'Missing evidence',${s.baseWorkRevision + 1},true,true,true)`;
        }),
      ).rejects.toMatchObject({ code: "23514" });
      expect((await row(s.id)).state).toBe("SUBMITTED");
      expect(
        await f.client`select id from metadata_edit_events where suggestion_id=${s.id}`,
      ).toHaveLength(1);
      expect(
        await f.client`select id from catalog_metadata_evidence where suggestion_id=${s.id}`,
      ).toHaveLength(0);
    });

    it("requires a full review transition and approval acknowledgments, not NULL-pass booleans", async () => {
      const s = await proposal(await work());
      await rejectsSql(
        "update metadata_edit_suggestions set state='APPROVED', revision=2, applied_work_revision=null where id=$1",
        [s.id],
      );
      await rejectsSql(
        "update metadata_edit_suggestions set state='REJECTED', revision=2, applied_work_revision=base_work_revision+1 where id=$1",
        [s.id],
      );
      await expect(
        f.client.begin(async (tx) => {
          await tx`update metadata_edit_suggestions set state='APPROVED',revision=2,applied_work_revision=base_work_revision+1 where id=${s.id}`;
          await tx`insert into metadata_edit_events (suggestion_id,revision,from_state,to_state,actor_user_id,review_reason,applied_work_revision,metadata_review_acknowledged,publication_review_acknowledged,rights_review_acknowledged) values (${s.id},2,'SUBMITTED','APPROVED',${admin.id},'Null acknowledgment attack',${s.baseWorkRevision + 1},true,true,null)`;
        }),
      ).rejects.toMatchObject({ code: "23514" });
      expect((await row(s.id)).state).toBe("SUBMITTED");
    });

    it("makes events append-only and rejects actor rebinding/manual nulling, reason edits/redaction, and history deletion", async () => {
      const s = await review(await proposal(await work()), false);
      const events =
        await f.client`select * from metadata_edit_events where suggestion_id=${s.id} order by revision`;
      for (const statement of [
        "update metadata_edit_events set actor_user_id=$2 where id=$1",
        "update metadata_edit_events set review_reason=$2 where id=$1",
      ])
        await rejectsSql(statement, [
          events[1]!.id,
          statement.includes("actor_user") ? other.id : "restored text",
        ]);
      await rejectsSql(
        "update metadata_edit_events set actor_user_id=null where id=$1",
        [events[1]!.id],
      );
      await rejectsSql(
        "update metadata_edit_events set review_reason=null,reason_redacted=true where id=$1",
        [events[1]!.id],
      );
      await rejectsSql("delete from metadata_edit_events where id=$1", [
        events[0]!.id,
      ]);
      expect(
        await f.client`select * from metadata_edit_events where suggestion_id=${s.id} order by revision`,
      ).toEqual(events);
    });

    it("rejects immutable evidence mutation/deletion and evidence for rejected suggestions", async () => {
      const approved = await review(await proposal(await work()));
      const [e] =
        await f.client`select * from catalog_metadata_evidence where suggestion_id=${approved.id}`;
      expect(e).toBeTruthy();
      await rejectsSql(
        "update catalog_metadata_evidence set after_title='invented published fact' where id=$1",
        [e!.id],
      );
      await rejectsSql("delete from catalog_metadata_evidence where id=$1", [
        e!.id,
      ]);
      const rejected = await review(await proposal(await work()), false);
      await rejectsSql(
        `insert into catalog_metadata_evidence select (jsonb_populate_record(null::catalog_metadata_evidence,to_jsonb(e)||$2::jsonb)).* from catalog_metadata_evidence e where id=$1`,
        [
          e!.id,
          JSON.stringify({ id: randomUUID(), suggestion_id: rejected.id }),
        ],
      );
      expect(
        await f.client`select * from catalog_metadata_evidence where id=${e!.id}`,
      ).toEqual([e]);
    });

    it("validates evidence intent, same-Work/revision audit, static actor snapshot, minimal audit body and actually applied source", async () => {
      const approved = await review(await proposal(await work()));
      const [original] =
        await f.client`select * from catalog_metadata_evidence where suggestion_id=${approved.id}`;
      const [foreignSource] =
        await f.client`select id from catalog_sources where id<>${original!.decision_source_id} and label=${f.sourceLabel} order by created_at limit 1`;
      expect(foreignSource).toBeTruthy();
      const unrelatedWork = await work();
      for (const attack of [
        { evidence: { after_title: "not the submitted title" }, audit: {} },
        { evidence: {}, audit: { new_revision: original!.work_revision + 1 } },
        { evidence: {}, audit: { work_id: unrelatedWork.id } },
        { evidence: {}, audit: { actor_id_snapshot: owner.id } },
        {
          evidence: {},
          audit: {
            changes: {
              sourceId: original!.decision_source_id,
              primaryTitle: "private narrative",
            },
          },
        },
        {
          evidence: {
            decision_source_id: foreignSource!.id,
            resulting_source_id: foreignSource!.id,
          },
          audit: { changes: { sourceId: foreignSource!.id } },
        },
      ]) {
        const suggestionId = randomUUID(),
          eventId = randomUUID(),
          auditId = randomUUID();
        await expect(
          f.client.begin(async (tx) => {
            await tx.unsafe(cloneHeader, [
              approved.id,
              JSON.stringify({
                id: suggestionId,
                submit_key: randomUUID(),
                state: "SUBMITTED",
                revision: 1,
                applied_work_revision: null,
              }),
            ]);
            await tx`insert into metadata_edit_events (suggestion_id,revision,to_state,actor_user_id) values (${suggestionId},1,'SUBMITTED',${owner.id})`;
            await tx`update metadata_edit_suggestions set state='APPROVED',revision=2,applied_work_revision=base_work_revision+1 where id=${suggestionId}`;
            await tx`insert into metadata_edit_events select (jsonb_populate_record(null::metadata_edit_events,to_jsonb(e)||${JSON.stringify({ id: eventId, suggestion_id: suggestionId })}::jsonb)).* from metadata_edit_events e where id=${original!.approval_event_id}`;
            await tx`insert into catalog_audit_events select (jsonb_populate_record(null::catalog_audit_events,to_jsonb(a)||${JSON.stringify({ id: auditId, ...attack.audit })}::jsonb)).* from catalog_audit_events a where id=${original!.audit_event_id}`;
            await tx`insert into catalog_metadata_evidence select (jsonb_populate_record(null::catalog_metadata_evidence,to_jsonb(e)||${JSON.stringify({ id: randomUUID(), suggestion_id: suggestionId, approval_event_id: eventId, audit_event_id: auditId, ...attack.evidence })}::jsonb)).* from catalog_metadata_evidence e where id=${original!.id}`;
            throw new Error("evidence attack unexpectedly accepted; rollback");
          }),
        ).rejects.toMatchObject({
          code: "23514",
        });
        expect(
          await f.client`select id from metadata_edit_suggestions where id=${suggestionId}`,
        ).toHaveLength(0);
        expect(
          await f.client`select id from catalog_audit_events where id=${auditId}`,
        ).toHaveLength(0);
      }
    });

    it("owner deletion purges every private column in submitted/rejected/approved states, redacts linked reasons, retains approved facts and forbids restoration", async () => {
      const erasedOwner = await f.account("user");
      const suggestions: MetadataSuggestion[] = [];
      for (const state of ["SUBMITTED", "REJECTED", "APPROVED"] as const) {
        let s = await proposal(await work(), erasedOwner, {
          type: "DESCRIPTION_REPLACE",
          language: "en",
          text: `PRIVATE original replacement ${randomUUID()}`,
          rights,
        });
        if (state !== "SUBMITTED") s = await review(s, state === "APPROVED");
        suggestions.push(s);
      }
      const approved = suggestions[2]!;
      const facts =
        await f.client`select * from catalog_metadata_evidence where suggestion_id=${approved.id}`;
      const sources =
        await f.client`select s.* from catalog_sources s join catalog_metadata_evidence e on e.decision_source_id=s.id where e.suggestion_id=${approved.id}`;
      await f.client`delete from users where id=${erasedOwner.id} and email=${erasedOwner.email}`;
      const privateColumns = [
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
      ];
      for (const s of suggestions) {
        const erased = await row(s.id);
        expect(erased.content_state).toBe("ERASED");
        expect(erased.owner_user_id).toBeNull();
        expect(erased.erased_at).not.toBeNull();
        expect(erased.state).toBe(s.state);
        expect(erased.revision).toBe(s.revision);
        for (const column of privateColumns)
          expect(erased[column], column).toBeNull();
        const reviews =
          await f.client`select review_reason,reason_redacted,actor_user_id from metadata_edit_events where suggestion_id=${s.id} and revision=2`;
        if (s.state !== "SUBMITTED") {
          expect(reviews[0]!.review_reason).toBeNull();
          expect(reviews[0]!.reason_redacted).toBe(true);
          expect(reviews[0]!.actor_user_id).toBe(admin.id);
        }
        await rejectsSql(
          "update metadata_edit_suggestions set owner_user_id=$2,content_state='ACTIVE',erased_at=null where id=$1",
          [s.id, other.id],
        );
        await rejectsSql(
          "update metadata_edit_suggestions set rights_statement='restored private text' where id=$1",
          [s.id],
        );
        await rejectsSql(
          "update metadata_edit_suggestions set state='REJECTED',revision=2 where id=$1",
          [s.id],
        );
        await rejectsSql(
          "insert into metadata_edit_events (suggestion_id,revision,from_state,to_state,actor_user_id,review_reason) values ($1,2,'SUBMITTED','REJECTED',$2,'post-erasure narrative')",
          [s.id, admin.id],
        );
        if (reviews.length)
          await rejectsSql(
            "update metadata_edit_events set review_reason='restored reason',reason_redacted=false where suggestion_id=$1 and revision=2",
            [s.id],
          );
      }
      expect(
        await f.client`select * from catalog_metadata_evidence where suggestion_id=${approved.id}`,
      ).toEqual(facts);
      expect(
        await f.client`select s.* from catalog_sources s join catalog_metadata_evidence e on e.decision_source_id=s.id where e.suggestion_id=${approved.id}`,
      ).toEqual(sources);
      expect(Object.keys(facts[0]!)).not.toContain("rights_statement");
      expect(facts[0]!.rights_basis).toBe("ORIGINAL_SUMMARY");
      expect(facts[0]!.originality_acknowledged).toBe(true);
      const [audit] =
        await f.client`select a.actor_id_snapshot,a.changes from catalog_audit_events a join catalog_metadata_evidence e on e.audit_event_id=a.id where e.suggestion_id=${approved.id}`;
      expect(audit!.actor_id_snapshot).toBe("metadata-review");
      expect(Object.keys(audit!.changes)).toEqual(["sourceId"]);
    });

    it("reviewer deletion clears only that review reason without purging a surviving owner's proposal or allowing actor/text restoration", async () => {
      const reviewer = await f.account("admin");
      const s = await review(await proposal(await work()), false, reviewer);
      const before = await row(s.id);
      const [event] =
        await f.client`select id from metadata_edit_events where suggestion_id=${s.id} and revision=2`;
      await f.client`delete from users where id=${reviewer.id} and email=${reviewer.email}`;
      const [erased] =
        await f.client`select * from metadata_edit_events where id=${event!.id}`;
      expect(erased!.actor_user_id).toBeNull();
      expect(erased!.review_reason).toBeNull();
      expect(erased!.reason_redacted).toBe(true);
      expect(await row(s.id)).toEqual(before);
      await rejectsSql(
        "update metadata_edit_events set actor_user_id=$2 where id=$1",
        [event!.id, admin.id],
      );
      await rejectsSql(
        "update metadata_edit_events set review_reason='restored text',reason_redacted=false where id=$1",
        [event!.id],
      );
    });

    it("denies TRUNCATE for each new history table inside transactions that always roll back", async () => {
      for (const table of [
        "metadata_edit_suggestions",
        "metadata_edit_events",
        "catalog_metadata_evidence",
      ]) {
        // CASCADE reaches only disposable fixture tables; even unexpected success is
        // forcibly rolled back by rejectsSql. No trigger/constraint is disabled.
        await rejectsSql(`truncate table ${table} cascade`);
      }
    });
  },
);
