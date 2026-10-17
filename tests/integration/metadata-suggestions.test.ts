import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import { addLibraryEntry } from "../../apps/web/src/server/library/service";
import { createWork } from "../../apps/web/src/server/catalog/service";
import {
  submitMetadataSuggestion,
  reviewMetadataSuggestion,
} from "../../apps/web/src/server/catalog/metadata-suggestions";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import type { SubmitMetadataProposal } from "../../apps/web/src/features/catalog/metadata-operations";
import type {
  MetadataSuggestion,
  MetadataTarget,
} from "../../apps/web/src/features/catalog/metadata-suggestion-contracts";
import { POST as submit } from "../../apps/web/src/app/api/catalog/works/[slug]/metadata-suggestions/route";
import { GET as target } from "../../apps/web/src/app/api/catalog/works/[slug]/metadata-target/route";
import { GET as owned } from "../../apps/web/src/app/api/metadata-suggestions/route";
import { GET as detail } from "../../apps/web/src/app/api/metadata-suggestions/[id]/route";
import { GET as queue } from "../../apps/web/src/app/api/admin/metadata-suggestions/route";
import { GET as adminDetail } from "../../apps/web/src/app/api/admin/metadata-suggestions/[id]/route";
import { POST as review } from "../../apps/web/src/app/api/admin/metadata-suggestions/[id]/review/route";
const f = catalogAuthFixture();
type Actor = Awaited<ReturnType<typeof f.account>>;
let owner: Actor, other: Actor, admin: Actor, moderator: Actor;
const workIds = new Set<string>();
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const wc = (slug: string) => ({ params: Promise.resolve({ slug }) });
const headers = (a: Actor) =>
  new Headers({ cookie: a.cookie, origin: f.origin });
function req(
  path: string,
  actor?: Actor,
  body?: unknown,
  extra: Record<string, string> = {},
) {
  return new Request(`${f.origin}/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin: f.origin,
      "content-type": "application/json",
      ...(actor ? { cookie: actor.cookie } : {}),
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function work(visibility = "PUBLISHED") {
  const w = (await createWork(
    {
      primaryTitle: `Metadata synthetic ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility,
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      source: { label: f.sourceLabel, citation: "Synthetic initial citation" },
      titles: [
        { title: "Original protected", language: "ja", kind: "ORIGINAL" },
        { title: "Editable alias", language: "en", kind: "ALIAS" },
        { title: "Sibling alias", language: "vi", kind: "ALIAS" },
      ],
      descriptions: [
        { language: "en", text: "Initial summary" },
        { language: "vi", text: "Sibling summary" },
      ],
    },
    headers(admin),
  )) as AdminWork;
  workIds.add(w.id);
  return w;
}
function proposal(
  w: { id: string; revision: number },
  operation: SubmitMetadataProposal["operation"],
): SubmitMetadataProposal {
  return {
    version: 1,
    workId: w.id,
    baseWorkRevision: w.revision,
    submitKey: randomUUID(),
    citation: { label: f.sourceLabel, citation: `PRIVATE citation ${f.runId}` },
    operation,
  };
}
const rights = {
  basis: "ORIGINAL_SUMMARY" as const,
  originalityAcknowledged: true as const,
  statement: "PRIVATE synthetic rights declaration",
};
const decision = (s: MetadataSuggestion, approve = true) => ({
  version: 1,
  suggestionId: s.id,
  revision: s.revision,
  baseWorkRevision: s.baseWorkRevision,
  decision: approve ? "APPROVE" : "REJECT",
  reason: `PRIVATE review ${f.runId}`,
  ...(approve
    ? {
        metadataReviewAcknowledged: true,
        publicationReviewAcknowledged: true,
        rightsReviewAcknowledged: true,
      }
    : {}),
});
async function send(p: SubmitMetadataProposal, actor = owner) {
  return submit(
    req(`catalog/works/${p.workId}/metadata-suggestions`, actor, p),
    wc(p.workId),
  );
}
async function submitted(
  p: SubmitMetadataProposal,
  actor = owner,
): Promise<MetadataSuggestion> {
  const r = await send(p, actor);
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("no-store");
  return r.json();
}
async function decide(s: MetadataSuggestion, approve = true, actor = admin) {
  return review(
    req(
      `admin/metadata-suggestions/${s.id}/review`,
      actor,
      decision(s, approve),
    ),
    ctx(s.id),
  );
}
async function getTarget(id: string): Promise<MetadataTarget> {
  const r = await target(
    req(`catalog/works/${id}/metadata-target`, owner),
    wc(id),
  );
  expect(r.status).toBe(200);
  return r.json();
}
async function facts(id: string) {
  const titles =
    await f.client`select id, work_id, title, language, kind, source_id from work_titles where work_id=${id} order by id`;
  const descriptions =
    await f.client`select work_id, language, text, source_id from work_descriptions where work_id=${id} order by language`;
  const genres =
    await f.client`select * from work_genres where work_id=${id} order by genre_slug`;
  const works =
    await f.client`select revision, source_id, search_text from works where id=${id}`;
  return {
    titles: [...titles],
    descriptions: [...descriptions],
    genres: [...genres],
    works: [...works],
  };
}
beforeAll(async () => {
  await f.start();
  owner = await f.account("user");
  other = await f.account("user");
  admin = await f.account("admin");
  moderator = await f.account("moderator");
  // Fresh migrations create an empty taxonomy. Seed one curated definition through
  // the real V1 administrator writer on a separate owned Work, not through V5B.
  const taxonomyWork = (await createWork(
    {
      primaryTitle: `Metadata taxonomy fixture ${f.runId}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      releaseStatus: "UNKNOWN",
      publicationReviewAcknowledged: true,
      source: { label: f.sourceLabel, citation: "Synthetic V1 taxonomy setup" },
      genres: [
        {
          slug: `metadata-fixture-${f.runId}`,
          nameEn: `Synthetic existing genre ${f.runId}`,
          nameVi: `Thể loại kiểm thử ${f.runId}`,
        },
      ],
    },
    headers(admin),
  )) as AdminWork;
  workIds.add(taxonomyWork.id);
});
beforeEach(async () => {
  requireTestDatabase();
  for (const a of f.users)
    await f.client`delete from rate_limits where key=${`catalog.write:${a.id}`}`;
});
afterAll(async () => {
  // Parent-owned disposable PG retains append-only history until cluster destruction.
  // Hide only these UUID-owned, source-labelled fixtures; user deletion erases private bodies.
  requireTestDatabase();
  try {
    for (const id of workIds) {
      const rows =
        await f.client`update works set visibility='HIDDEN' where id=${id} and source_id in (select id from catalog_sources where label=${f.sourceLabel}) returning id`;
      expect(rows).toHaveLength(1);
    }
  } finally {
    await f.stop();
  }
});
describe.sequential(
  "V5B metadata routes with real signed sessions, SMTP and SQL",
  () => {
    it("authenticates before body, denies moderators/cross-user/unverified access, rejects untrusted Origin and strict pagination", async () => {
      const w = await work();
      const p = proposal(w, {
        type: "TITLE_ADD",
        value: { title: "New alias", language: "en", kind: "ALIAS" },
      });
      expect(
        (
          await submit(
            req("catalog/works/bad/metadata-suggestions", undefined, {}),
            wc("bad"),
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await review(
            req("admin/metadata-suggestions/bad/review", moderator, {}),
            ctx("bad"),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await send(p).then(async (r) => {
            expect(r.status).toBe(200);
            return r.json();
          })
        ).id,
      ).toBeTruthy();
      const s = await submitted({
        ...p,
        submitKey: randomUUID(),
        operation: {
          ...p.operation,
          value: { title: "Another alias", language: "en", kind: "ALIAS" },
        },
      } as SubmitMetadataProposal);
      expect(
        (await detail(req(`metadata-suggestions/${s.id}`, other), ctx(s.id)))
          .status,
      ).toBe(404);
      expect(
        (
          await adminDetail(
            req(`admin/metadata-suggestions/${s.id}`, moderator),
            ctx(s.id),
          )
        ).status,
      ).toBe(403);
      expect(
        (await queue(req("admin/metadata-suggestions", other))).status,
      ).toBe(403);
      for (const query of ["page=502", "pageSize=51", "unknown=1"])
        expect(
          (await owned(req(`metadata-suggestions?${query}`, owner))).status,
        ).toBe(400);
      expect(
        (
          await submit(
            req("x", owner, p, { origin: "https://evil.invalid" }),
            wc(w.id),
          )
        ).status,
      ).toBe(403);
      expect(
        (await submit(req("x", owner, { junk: "x".repeat(66000) }), wc(w.id)))
          .status,
      ).toBe(413);
      expect(
        (
          await submit(
            req("x", owner, p, { "content-type": "text/plain" }),
            wc(w.id),
          )
        ).status,
      ).toBe(415);
      await f.client`update users set email_verified=false where id=${other.id}`;
      try {
        expect((await send(p, other)).status).toBe(403);
      } finally {
        await f.client`update users set email_verified=true where id=${other.id}`;
      }
    });
    it("executes all eight operations preserving exact UUID/natural keys, siblings and attribution", async () => {
      const w = await work();
      let current = await getTarget(w.id);
      const initial = await facts(w.id);
      const sibling = initial.titles.find((t) => t.title === "Sibling alias");
      const siblingDescription = initial.descriptions.find(
        (d) => d.language === "vi",
      );
      const apply = async (operation: SubmitMetadataProposal["operation"]) => {
        const before = await facts(w.id);
        const s = await submitted(
          proposal({ id: w.id, revision: current.work.revision }, operation),
        );
        const r = await decide(s);
        expect(r.status).toBe(200);
        const rows =
          await f.client`select * from catalog_metadata_evidence where suggestion_id=${s.id}`;
        expect(rows).toHaveLength(1);
        expect(rows[0].operation_type).toBe(operation.type);
        expect(rows[0].work_id).toBe(w.id);
        expect(rows[0].decision_source_id).toBeTruthy();
        expect(
          await f.client`select * from metadata_edit_events where suggestion_id=${s.id} order by revision`,
        ).toHaveLength(2);
        const previous = current.work.revision;
        current = await getTarget(w.id);
        expect(current.work.revision).toBe(previous + 1);
        const now = await facts(w.id);
        const e = rows[0];
        const oldFact = operation.type.startsWith("TITLE_")
          ? before.titles.find((t) => t.id === e.title_id)
          : operation.type.startsWith("DESCRIPTION_")
            ? before.descriptions.find(
                (d) => d.language === e.description_language,
              )
            : before.genres.find((g) => g.genre_slug === e.genre_slug);
        const newFact = operation.type.startsWith("TITLE_")
          ? now.titles.find((t) => t.id === e.title_id)
          : operation.type.startsWith("DESCRIPTION_")
            ? now.descriptions.find(
                (d) => d.language === e.description_language,
              )
            : now.genres.find((g) => g.genre_slug === e.genre_slug);
        expect(e.before_present).toBe(Boolean(oldFact));
        expect(e.after_present).toBe(Boolean(newFact));
        expect(e.previous_source_id).toBe(oldFact?.source_id ?? null);
        expect(e.resulting_source_id).toBe(newFact?.source_id ?? null);
        if (newFact) expect(newFact.source_id).toBe(e.decision_source_id);
        expect(now.titles.find((t) => t.id === sibling?.id)).toEqual(sibling);
        expect(now.descriptions.find((d) => d.language === "vi")).toEqual(
          siblingDescription,
        );
        return rows[0];
      };
      await apply({
        type: "TITLE_ADD",
        value: { title: "New scoped alias", language: "en", kind: "ALIAS" },
      });
      const id = current.titles.find((t) => t.title === "New scoped alias")!.id;
      const evidence = await apply({
        type: "TITLE_REPLACE",
        titleId: id,
        title: "Replaced scoped alias",
      });
      expect(evidence.title_id).toBe(id);
      expect(current.titles.find((t) => t.id === id)?.title).toBe(
        "Replaced scoped alias",
      );
      await apply({
        type: "TITLE_REMOVE",
        titleId: id,
        reason: "Synthetic removal",
      });
      expect(current.titles.some((t) => t.id === id)).toBe(false);
      await apply({
        type: "DESCRIPTION_ADD",
        language: "fr",
        text: "Original synthetic summary",
        rights,
      });
      await apply({
        type: "DESCRIPTION_REPLACE",
        language: "fr",
        text: "Changed original synthetic summary",
        rights,
      });
      await apply({
        type: "DESCRIPTION_REMOVE",
        language: "fr",
        reason: "Synthetic removal",
      });
      const option = current.genreOptions.find(
        (g) =>
          g.slug === `metadata-fixture-${f.runId}` &&
          !current.genreMemberships.some((m) => m.slug === g.slug),
      );
      expect(
        option,
        "The V1 taxonomy fixture must provide an existing genre not assigned to this target Work before V5B membership operations",
      ).toBeTruthy();
      const taxonomy = await f.client`select * from genres order by slug`;
      await apply({ type: "GENRE_ADD_MEMBERSHIP", slug: option!.slug });
      await apply({
        type: "GENRE_REMOVE_MEMBERSHIP",
        slug: option!.slug,
        reason: "Synthetic removal",
      });
      expect([...(await f.client`select * from genres order by slug`)]).toEqual(
        [...taxonomy],
      );
    });
    it("replays identical delivery, conflicts changed delivery and serializes concurrent reviews", async () => {
      const w = await work();
      const p = proposal(w, {
        type: "TITLE_ADD",
        value: { title: "Concurrent alias", language: "en", kind: "ALIAS" },
      });
      const replies = await Promise.all([send(p), send(p)]);
      expect(replies.map((r) => r.status)).toEqual([200, 200]);
      const rows = await Promise.all(replies.map((r) => r.json()));
      expect(rows[0].id).toBe(rows[1].id);
      expect(
        (
          await send({
            ...p,
            citation: { ...p.citation, citation: "Different content" },
          })
        ).status,
      ).toBe(409);
      const results = await Promise.all([decide(rows[0]), decide(rows[0])]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(
        await f.client`select * from catalog_metadata_evidence where suggestion_id=${rows[0].id}`,
      ).toHaveLength(1);
      expect((await send(p)).status).toBe(200);
    });
    it("protects canonical/ORIGINAL rows, rejects unknown genres, stale, no-op, cross-work handles and hidden targets", async () => {
      const w = await work();
      const t = await getTarget(w.id);
      const foreign = await getTarget((await work()).id);
      const ops: SubmitMetadataProposal["operation"][] = [
        {
          type: "TITLE_REMOVE",
          titleId: t.titles.find((x) => x.kind === "ORIGINAL")!.id,
          reason: "Forbidden",
        },
        {
          type: "TITLE_REPLACE",
          titleId: t.titles.find((x) => x.title === w.primaryTitle)!.id,
          title: "Forbidden canonical change",
        },
        {
          type: "TITLE_REPLACE",
          titleId: foreign.titles[0].id,
          title: "Wrong scope",
        },
        {
          type: "DESCRIPTION_REPLACE",
          language: "en",
          text: "Initial summary",
          rights,
        },
        { type: "GENRE_ADD_MEMBERSHIP", slug: `unknown-${f.runId}` },
      ];
      const before = await facts(w.id);
      for (const op of ops) {
        const r = await send(proposal(w, op));
        if (r.status === 200)
          expect((await decide(await r.json())).status).toBe(409);
        else expect([400, 404, 409]).toContain(r.status);
      }
      expect(await facts(w.id)).toEqual(before);
      const hidden = await work("DRAFT");
      expect((await target(req("x", owner), wc(hidden.id))).status).toBe(404);
      expect(
        (
          await send(
            proposal(hidden, {
              type: "TITLE_ADD",
              value: { title: "Hidden", language: "en", kind: "ALIAS" },
            }),
          )
        ).status,
      ).toBe(404);
      const valid = proposal(w, {
        type: "TITLE_ADD",
        value: { title: "First revision", language: "en", kind: "ALIAS" },
      });
      const stale = await submitted({
        ...valid,
        submitKey: randomUUID(),
        operation: {
          type: "DESCRIPTION_ADD",
          language: "fr",
          text: "Stale summary",
          rights,
        },
      });
      expect((await decide(await submitted(valid))).status).toBe(200);
      expect((await decide(stale)).status).toBe(409);
      expect((await decide(stale, false)).status).toBe(200);
    });
    it("rolls back source, targeted facts, Work, audit and evidence atomically on fixture-scoped insert faults", async () => {
      requireTestDatabase();
      const w = await work();
      for (const table of [
        "catalog_sources",
        "catalog_audit_events",
        "catalog_metadata_evidence",
      ] as const) {
        const s = await submitted(
          proposal(w, {
            type: "DESCRIPTION_ADD",
            language: "fr",
            text: "Rollback candidate",
            rights,
          }),
        );
        const before = await facts(w.id);
        const sources =
          await f.client`select id from catalog_sources where label=${f.sourceLabel} order by id`;
        const audits =
          await f.client`select id from catalog_audit_events where work_id=${w.id} order by id`;
        // Identifiers and SQL literals are exclusively generated UUIDs/closed constants.
        const name = `v5b_fault_${randomUUID().replaceAll("-", "")}`;
        const predicate =
          table === "catalog_sources"
            ? `NEW.label = '${f.sourceLabel}'`
            : `NEW.work_id = '${w.id}'::uuid`;
        try {
          await f.client.unsafe(
            `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${predicate} THEN RAISE EXCEPTION 'owned V5B rollback injection'; END IF; RETURN NEW; END $$`,
          );
          await f.client.unsafe(
            `CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}()`,
          );
          expect((await decide(s)).status).toBe(503);
        } finally {
          await f.client.unsafe(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
          await f.client.unsafe(`DROP FUNCTION IF EXISTS ${name}()`);
        }
        expect(await facts(w.id)).toEqual(before);
        expect([
          ...(await f.client`select id from catalog_sources where label=${f.sourceLabel} order by id`),
        ]).toEqual([...sources]);
        expect([
          ...(await f.client`select id from catalog_audit_events where work_id=${w.id} order by id`),
        ]).toEqual([...audits]);
        expect(
          (
            await f.client`select state, revision from metadata_edit_suggestions where id=${s.id}`
          )[0],
        ).toMatchObject({ state: "SUBMITTED", revision: 1 });
        expect(
          await f.client`select * from metadata_edit_events where suggestion_id=${s.id}`,
        ).toHaveLength(1);
        expect(
          await f.client`select * from catalog_metadata_evidence where suggestion_id=${s.id}`,
        ).toHaveLength(0);
      }
    });
    it("revalidates actual persisted session and role after preflight without auth mocks", async () => {
      const w = await work();
      const revoked = await f.account("user");
      const p = proposal(w, {
        type: "TITLE_ADD",
        value: { title: "Revoked", language: "en", kind: "ALIAS" },
      });
      await expect(
        submitMetadataSuggestion(
          w.id,
          async () => {
            await f.client`delete from sessions where user_id=${revoked.id}`;
            return p;
          },
          headers(revoked),
        ),
      ).rejects.toBeTruthy();
      expect(
        await f.client`select * from metadata_edit_suggestions where owner_user_id=${revoked.id}`,
      ).toHaveLength(0);
      const reviewer = await f.account("admin");
      const s = await submitted(p);
      await expect(
        reviewMetadataSuggestion(
          s.id,
          async () => {
            await f.client`update users set role='user' where id=${reviewer.id}`;
            return decision(s);
          },
          headers(reviewer),
        ),
      ).rejects.toBeTruthy();
      expect(
        (
          await f.client`select state from metadata_edit_suggestions where id=${s.id}`
        )[0].state,
      ).toBe("SUBMITTED");
    });
    it("erases reviewer reasons only and never touches another user's private library", async () => {
      const reviewer = await f.account("admin");
      const w = await work();
      await addLibraryEntry(
        { workId: w.id, mutationKey: randomUUID() },
        headers(other),
      );
      const library =
        await f.client`select * from library_entries where user_id=${other.id} and work_id=${w.id}`;
      expect(library).toHaveLength(1);
      const s = await submitted(
        proposal(w, {
          type: "DESCRIPTION_ADD",
          language: "fr",
          text: "Synthetic published summary",
          rights,
        }),
      );
      expect((await decide(s, true, reviewer)).status).toBe(200);
      await f.client`delete from users where id=${reviewer.id} and email=${reviewer.email}`;
      const e = (
        await f.client`select * from metadata_edit_events where suggestion_id=${s.id} and revision=2`
      )[0];
      expect(e.actor_user_id).toBeNull();
      expect(e.review_reason).toBeNull();
      expect(e.reason_redacted).toBe(true);
      const p = (
        await f.client`select * from metadata_edit_suggestions where id=${s.id}`
      )[0];
      expect(p.content_state).toBe("ACTIVE");
      expect(p.owner_user_id).toBe(owner.id);
      expect(p.rights_statement).toBe(rights.statement);
      expect([
        ...(await f.client`select * from library_entries where user_id=${other.id} and work_id=${w.id}`),
      ]).toEqual([...library]);
      const r = await detail(req("x", owner), ctx(s.id));
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(JSON.stringify(body)).not.toContain("library");
      expect(JSON.stringify(body)).not.toContain(other.id);
    });
    it("irreversibly erases private payloads/reasons in all states on account deletion without changing published facts", async () => {
      const erased = await f.account("user");
      const ids: string[] = [];
      const published: {
        id: string;
        snapshot: Awaited<ReturnType<typeof facts>>;
      }[] = [];
      for (const state of ["SUBMITTED", "APPROVED", "REJECTED"]) {
        const w = await work();
        const s = await submitted(
          proposal(w, {
            type: "DESCRIPTION_ADD",
            language: "fr",
            text: `Private summary ${f.runId}`,
            rights,
          }),
          erased,
        );
        ids.push(s.id);
        if (state !== "SUBMITTED")
          expect((await decide(s, state === "APPROVED")).status).toBe(200);
        published.push({ id: w.id, snapshot: await facts(w.id) });
      }
      await f.client`delete from users where id=${erased.id} and email=${erased.email}`;
      for (const id of ids) {
        const row = (
          await f.client`select * from metadata_edit_suggestions where id=${id}`
        )[0];
        expect(row.content_state).toBe("ERASED");
        expect(row.owner_user_id).toBeNull();
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
        for (const e of await f.client`select * from metadata_edit_events where suggestion_id=${id} and revision=2`) {
          expect(e.review_reason).toBeNull();
          expect(e.reason_redacted).toBe(true);
        }
        await expect(
          f.client`update metadata_edit_suggestions set description_text='rehydrate' where id=${id}`,
        ).rejects.toBeTruthy();
        const response = await adminDetail(req("x", admin), ctx(id));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.suggestion.proposal).toBeNull();
        expect((await decide(body.suggestion, false)).status).toBe(409);
      }
      for (const w of published) expect(await facts(w.id)).toEqual(w.snapshot);
      const list = await queue(
        req("admin/metadata-suggestions?pageSize=50", admin),
      );
      expect(list.status).toBe(200);
      expect(
        (await list.json()).items.some((s: MetadataSuggestion) =>
          ids.includes(s.id),
        ),
      ).toBe(false);
    });
  },
);
