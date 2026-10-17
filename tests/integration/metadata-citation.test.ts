import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import { createWork } from "../../apps/web/src/server/catalog/service";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import {
  submitMetadataProposalSchema,
  type SubmitMetadataProposal,
} from "../../apps/web/src/features/catalog/metadata-operations";
import {
  metadataSuggestionSchema,
  metadataSuggestionDetailSchema,
  metadataAdminSuggestionDetailSchema,
  type MetadataSuggestion,
} from "../../apps/web/src/features/catalog/metadata-suggestion-contracts";
import { POST as submit } from "../../apps/web/src/app/api/catalog/works/[slug]/metadata-suggestions/route";
import { POST as approve } from "../../apps/web/src/app/api/admin/metadata-suggestions/[id]/review/route";
import { GET as ownerDetail } from "../../apps/web/src/app/api/metadata-suggestions/[id]/route";
import { GET as adminDetail } from "../../apps/web/src/app/api/admin/metadata-suggestions/[id]/route";

// Requires the parent-owned, disposable, migrated PostgreSQL cluster. This file
// starts no database, changes no DDL, fetches no URL, and retains immutable history.
const f = catalogAuthFixture();
type Actor = Awaited<ReturnType<typeof f.account>>;
let owner: Actor, admin: Actor;
const workIds = new Set<string>();
const headers = (a: Actor) =>
  new Headers({ cookie: a.cookie, origin: f.origin });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
function request(path: string, actor: Actor, body?: unknown) {
  return new Request(`${f.origin}/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie: actor.cookie,
      origin: f.origin,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function work() {
  const value = (await createWork(
    {
      primaryTitle: `Citation persistence ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      source: { label: f.sourceLabel, citation: "Synthetic initial citation" },
      titles: [
        { title: "Untouched citation sibling", language: "vi", kind: "ALIAS" },
      ],
      descriptions: [{ language: "en", text: "Untouched citation summary" }],
      genres: [],
    },
    headers(admin),
  )) as AdminWork;
  workIds.add(value.id);
  return value;
}
function proposal(
  w: AdminWork,
  citation: SubmitMetadataProposal["citation"],
): SubmitMetadataProposal {
  return {
    version: 1,
    workId: w.id,
    baseWorkRevision: w.revision,
    submitKey: randomUUID(),
    operation: {
      type: "TITLE_ADD",
      value: {
        title: `Citation alias ${randomUUID()}`,
        language: "en",
        kind: "ALIAS",
      },
    },
    citation,
  };
}
async function send(p: SubmitMetadataProposal) {
  return submit(
    request(`catalog/works/${p.workId}/metadata-suggestions`, owner, p),
    { params: Promise.resolve({ slug: p.workId }) },
  );
}
async function decision(s: MetadataSuggestion) {
  return approve(
    request(`admin/metadata-suggestions/${s.id}/review`, admin, {
      version: 1,
      suggestionId: s.id,
      revision: s.revision,
      baseWorkRevision: s.baseWorkRevision,
      decision: "APPROVE",
      reason: "Synthetic precision review",
      metadataReviewAcknowledged: true,
      publicationReviewAcknowledged: true,
      rightsReviewAcknowledged: true,
    }),
    context(s.id),
  );
}
async function submitted(p: SubmitMetadataProposal) {
  expect(submitMetadataProposalSchema.safeParse(p).success).toBe(true);
  const response = await send(p);
  expect(response.status).toBe(200);
  return metadataSuggestionSchema.parse(await response.json());
}
// Excludes rate-limit/auth bookkeeping, which is intentionally charged before
// writes. Includes every Work child and all this fixture's source rows, rather
// than merely asserting no revision increment after an uncertain publication.
async function persisted(workId: string) {
  return {
    work: [...(await f.client`select * from works where id=${workId}`)],
    titles: [
      ...(await f.client`select * from work_titles where work_id=${workId} order by id`),
    ],
    descriptions: [
      ...(await f.client`select * from work_descriptions where work_id=${workId} order by language`),
    ],
    genres: [
      ...(await f.client`select * from work_genres where work_id=${workId} order by genre_slug`),
    ],
    editions: [
      ...(await f.client`select * from editions where work_id=${workId} order by id`),
    ],
    creators: [
      ...(await f.client`select * from work_creators where work_id=${workId} order by id`),
    ],
    covers: [
      ...(await f.client`select * from work_covers where work_id=${workId}`),
    ],
    identifiers: [
      ...(await f.client`select * from work_identifiers where work_id=${workId} order by id`),
    ],
    relations: [
      ...(await f.client`select * from work_relations where from_work_id=${workId} or to_work_id=${workId} order by from_work_id,to_work_id,type`),
    ],
    sources: [
      ...(await f.client`select * from catalog_sources where label=${f.sourceLabel} order by id`),
    ],
    audit: [
      ...(await f.client`select * from catalog_audit_events where work_id=${workId} order by id`),
    ],
    fieldEvidence: [
      ...(await f.client`select * from catalog_field_evidence where work_id=${workId} order by id`),
    ],
    suggestions: [
      ...(await f.client`select * from metadata_edit_suggestions where work_id=${workId} order by id`),
    ],
    events: [
      ...(await f.client`select e.* from metadata_edit_events e join metadata_edit_suggestions s on s.id=e.suggestion_id where s.work_id=${workId} order by e.id`),
    ],
    evidence: [
      ...(await f.client`select * from catalog_metadata_evidence where work_id=${workId} order by id`),
    ],
  };
}
beforeAll(async () => {
  await f.start();
  owner = await f.account("user");
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
      expect(
        await f.client`update works set visibility='HIDDEN' where id=${id} and source_id in (select id from catalog_sources where label=${f.sourceLabel}) returning id`,
      ).toHaveLength(1);
    }
  } finally {
    await f.stop();
  }
});

describe.sequential(
  "V5B lexical citations versus actual PostgreSQL publication",
  () => {
    it("preserves >64-character datetime intent, publishes PostgreSQL-rounded microseconds, and filters evidence by role", async () => {
      const w = await work();
      const consultedAt = `2026-01-02T03:04:05.1234567${"1".repeat(100)}Z`;
      expect(consultedAt.length).toBeGreaterThan(64);
      const p = proposal(w, {
        label: f.sourceLabel,
        citation: "Synthetic high-precision citation",
        consultedAt,
      });
      const s = await submitted(p);
      expect(s.proposal?.citation.consultedAt).toBe(consultedAt);
      expect(
        (
          await f.client`select citation_consulted_at from metadata_edit_suggestions where id=${s.id}`
        )[0]!.citation_consulted_at,
      ).toBe(consultedAt);
      const response = await decision(s);
      expect(response.status).toBe(200);
      const reviewed = metadataSuggestionSchema.parse(await response.json());
      expect(reviewed.state).toBe("APPROVED");
      expect(reviewed.appliedWorkRevision).toBe(w.revision + 1);
      // Actual PostgreSQL formatting is the precision proof; JS Date is not.
      const [published] =
        await f.client`select to_char(s.consulted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') as consulted_at, e.after_title from catalog_sources s join catalog_metadata_evidence e on e.decision_source_id=s.id where e.suggestion_id=${s.id}`;
      expect(published!.consulted_at).toBe("2026-01-02T03:04:05.123457");
      expect(published!.after_title).toBe(
        p.operation.type === "TITLE_ADD" ? p.operation.value.title : undefined,
      );
      expect(
        (
          await f.client`select citation_consulted_at from metadata_edit_suggestions where id=${s.id}`
        )[0]!.citation_consulted_at,
      ).toBe(consultedAt);
      const ownerResponse = await ownerDetail(
        request(`metadata-suggestions/${s.id}`, owner),
        context(s.id),
      );
      const adminResponse = await adminDetail(
        request(`admin/metadata-suggestions/${s.id}`, admin),
        context(s.id),
      );
      expect(ownerResponse.status).toBe(200);
      expect(adminResponse.status).toBe(200);
      const privateOwner = metadataSuggestionDetailSchema.parse(
        await ownerResponse.json(),
      );
      const privateAdmin = metadataAdminSuggestionDetailSchema.parse(
        await adminResponse.json(),
      );
      expect(privateOwner.evidence).toBeNull();
      expect(privateAdmin.evidence).not.toBeNull();
      expect(privateOwner.suggestion.proposal?.citation.consultedAt).toBe(
        consultedAt,
      );
      expect(privateAdmin.evidence!.workRevision).toBe(w.revision + 1);
    });

    it("fails closed when PostgreSQL rounding crosses year 9999 and rolls back every publication write", async () => {
      const w = await work();
      const consultedAt = "9999-12-31T23:59:59.9999999Z";
      const p = proposal(w, {
        label: f.sourceLabel,
        citation: "Synthetic year-boundary citation",
        consultedAt,
      });
      expect(submitMetadataProposalSchema.safeParse(p).success).toBe(true);
      expect(Number.isFinite(new Date(consultedAt).getTime())).toBe(true);
      expect(new Date(consultedAt).getUTCFullYear()).toBe(9999);
      // A real SQL read establishes the cause; finite JS input alone cannot do so.
      const [rounded] =
        await f.client`select extract(year from ${consultedAt}::timestamptz at time zone 'UTC')::int as year`;
      expect(rounded!.year).toBe(10000);
      const s = await submitted(p);
      const before = await persisted(w.id);
      const response = await decision(s);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "CITATION_NOT_REPRESENTABLE",
      });
      expect(await persisted(w.id)).toEqual(before);
      const [retained] =
        await f.client`select state,revision,citation_consulted_at from metadata_edit_suggestions where id=${s.id}`;
      expect(retained!.state).toBe("SUBMITTED");
      expect(retained!.revision).toBe(1);
      expect(retained!.citation_consulted_at).toBe(consultedAt);
    });

    it("rejects pure-accepted URL lexical forms and year zero before any proposal/source/catalog writes, without normalizing intent", async () => {
      const w = await work();
      for (const citation of [
        {
          label: f.sourceLabel,
          citation: "Synthetic uppercase URL",
          url: "HTTPS://EXAMPLE.INVALID/citation",
        },
        {
          label: f.sourceLabel,
          citation: "Synthetic leading-whitespace URL",
          url: " https://example.invalid/citation",
        },
        {
          label: f.sourceLabel,
          citation: "Synthetic year zero",
          consultedAt: "0000-01-02T03:04:05Z",
        },
      ]) {
        const p = proposal(w, citation);
        const lexicalBefore = JSON.stringify(p);
        expect(submitMetadataProposalSchema.parse(p).citation).toEqual(
          citation,
        );
        const before = await persisted(w.id);
        const response = await send(p);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          error: "CITATION_NOT_REPRESENTABLE",
        });
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await persisted(w.id)).toEqual(before);
        expect(JSON.stringify(p)).toBe(lexicalBefore);
        expect(
          await f.client`select id from metadata_edit_suggestions where owner_user_id=${owner.id} and submit_key=${p.submitKey}`,
        ).toHaveLength(0);
      }
    });
  },
);
