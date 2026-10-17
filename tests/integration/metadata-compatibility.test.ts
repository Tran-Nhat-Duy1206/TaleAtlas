import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import {
  createWork,
  adminGetWork,
} from "../../apps/web/src/server/catalog/service";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import { submitMetadataProposalSchema } from "../../apps/web/src/features/catalog/metadata-operations";
import { POST as submit } from "../../apps/web/src/app/api/catalog/works/[slug]/suggestions/route";
import { POST as review } from "../../apps/web/src/app/api/admin/edit-suggestions/[id]/review/route";

// Real signed Better Auth sessions, SMTP and guarded PostgreSQL, not an auth mock.
// V5A has no route or writer: these cases prove the OLD API does not acquire one.
const f = catalogAuthFixture();
type Actor = Awaited<ReturnType<typeof f.account>>;
let owner: Actor, admin: Actor, moderator: Actor, work: AdminWork;
const citation = () => ({
  label: f.sourceLabel,
  citation: "Synthetic manually cited facts",
});
const headers = (actor: Actor) => new Headers({ cookie: actor.cookie });
function request(path: string, actor: Actor, body: unknown) {
  return new Request(`${f.origin}/api/${path}`, {
    method: "POST",
    headers: {
      origin: f.origin,
      "content-type": "application/json",
      cookie: actor.cookie,
    },
    body: JSON.stringify(body),
  });
}
const context = () => ({ params: Promise.resolve({ slug: work.id }) });
async function snapshot() {
  const [row] =
    await f.client`select id, slug, revision, primary_title, source_id from works where id = ${work.id}`;
  const titles =
    await f.client`select id, title, language, kind, source_id from work_titles where work_id = ${work.id} order by id`;
  const descriptions =
    await f.client`select language, text, source_id from work_descriptions where work_id = ${work.id} order by language`;
  const [counts] = await f.client`select
    (select count(*)::int from edit_suggestions where work_id = ${work.id}) as proposals,
    (select count(*)::int from edit_suggestion_events where suggestion_id in (select id from edit_suggestions where work_id = ${work.id})) as events,
    (select count(*)::int from catalog_audit_events where work_id = ${work.id}) as audits,
    (select count(*)::int from catalog_field_evidence where work_id = ${work.id}) as evidence`;
  const [sources] =
    await f.client`select count(*)::int as count from catalog_sources where label = ${f.sourceLabel}`;
  const taxonomy =
    await f.client`select slug, name_en, name_vi from genres order by slug`;
  const memberships =
    await f.client`select * from work_genres where work_id = ${work.id} order by genre_slug`;
  const editions =
    await f.client`select * from editions where work_id = ${work.id} order by id`;
  const credits =
    await f.client`select * from work_creators where work_id = ${work.id} order by id`;
  const identifiers =
    await f.client`select * from work_identifiers where work_id = ${work.id} order by id`;
  const covers =
    await f.client`select * from work_covers where work_id = ${work.id}`;
  const relations =
    await f.client`select * from work_relations where from_work_id = ${work.id} or to_work_id = ${work.id} order by from_work_id, to_work_id, type`;
  return {
    work: row,
    titles: [...titles],
    descriptions: [...descriptions],
    counts,
    sources,
    taxonomy: [...taxonomy],
    memberships: [...memberships],
    editions: [...editions],
    credits: [...credits],
    identifiers: [...identifiers],
    covers: [...covers],
    relations: [...relations],
  };
}
beforeAll(async () => {
  await f.start();
  owner = await f.account("user");
  moderator = await f.account("moderator");
  admin = await f.account("admin");
  work = (await createWork(
    {
      primaryTitle: `V5A compatibility ${f.runId}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      source: citation(),
      titles: [
        {
          title: "Keep independently sourced alias",
          language: "vi",
          kind: "ALIAS",
        },
        { title: "Keep original", language: "ja", kind: "ORIGINAL" },
      ],
      descriptions: [
        { language: "en", text: "Keep English" },
        { language: "vi", text: "Giữ tiếng Việt" },
      ],
    },
    headers(admin),
  )) as AdminWork;
});
afterAll(async () => {
  requireTestDatabase();
  try {
    if (work) {
      await f.client`delete from edit_suggestion_events where suggestion_id in (select id from edit_suggestions where work_id = ${work.id})`;
      await f.client`delete from edit_suggestions where work_id = ${work.id}`;
      await f.client`delete from catalog_field_evidence where work_id = ${work.id}`;
      await f.client`delete from catalog_audit_events where work_id = ${work.id}`;
      await f.client`delete from work_relations where from_work_id = ${work.id} or to_work_id = ${work.id}`;
      await f.client`delete from work_creators where work_id = ${work.id}`;
      await f.client`delete from work_identifiers where work_id = ${work.id}`;
      await f.client`delete from work_genres where work_id = ${work.id}`;
      await f.client`delete from work_covers where work_id = ${work.id}`;
      await f.client`delete from editions where work_id = ${work.id}`;
      await f.client`delete from work_titles where work_id = ${work.id}`;
      await f.client`delete from work_descriptions where work_id = ${work.id}`;
      await f.client`delete from works where id = ${work.id}`;
    }
    await f.client`delete from catalog_sources where label = ${f.sourceLabel}`;
  } finally {
    await f.stop();
  }
});

describe.sequential("V5A does not widen the real V2 HTTP/SQL boundary", () => {
  it.each([
    {
      type: "TITLE_ADD",
      value: { title: "New alias", language: "en", kind: "ALIAS" },
    },
    { type: "TITLE_REPLACE", titleId: randomUUID(), title: "New title" },
    {
      type: "TITLE_REMOVE",
      titleId: randomUUID(),
      reason: "Synthetic removal explanation",
    },
    {
      type: "DESCRIPTION_ADD",
      language: "fr",
      text: "An original summary",
      rights: {
        basis: "ORIGINAL_SUMMARY",
        originalityAcknowledged: true,
        statement: "Written in my own words",
      },
    },
    {
      type: "DESCRIPTION_REPLACE",
      language: "en",
      text: "A new original summary",
      rights: {
        basis: "ORIGINAL_SUMMARY",
        originalityAcknowledged: true,
        statement: "Written in my own words",
      },
    },
    {
      type: "DESCRIPTION_REMOVE",
      language: "en",
      reason: "Synthetic removal explanation",
    },
    { type: "GENRE_ADD_MEMBERSHIP", slug: "synthetic-genre" },
    {
      type: "GENRE_REMOVE_MEMBERSHIP",
      slug: "synthetic-genre",
      reason: "Synthetic removal explanation",
    },
  ])(
    "rejects typed $type without any proposal/catalog side effect",
    async (operation) => {
      const before = await snapshot();
      const value = submitMetadataProposalSchema.parse({
        version: 1,
        submitKey: randomUUID(),
        workId: work.id,
        baseWorkRevision: work.revision,
        citation: citation(),
        operation,
      });
      const response = await submit(
        request(`catalog/works/${work.id}/suggestions`, owner, value),
        context(),
      );
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await snapshot()).toEqual(before);
    },
  );

  it.each([
    { titles: [{ title: "Mass assignment", language: "en", kind: "ALIAS" }] },
    { descriptions: [{ language: "en", text: "Mass assignment" }] },
    { genres: [{ slug: "forged", nameEn: "Forged", nameVi: "Forged" }] },
    { role: "admin", ownerId: "forged" },
    {
      primaryTitle: "Known field must not make unknown keys acceptable",
      operation: { type: "TITLE_REMOVE", titleId: randomUUID() },
    },
  ])(
    "rejects rich/authority keys inside the old patch atomically: %j",
    async (patch) => {
      const before = await snapshot();
      const response = await submit(
        request(`catalog/works/${work.id}/suggestions`, owner, {
          submitKey: randomUUID(),
          baseWorkRevision: work.revision,
          patch,
          citation: citation(),
        }),
        context(),
      );
      expect(response.status).toBe(400);
      expect(await snapshot()).toEqual(before);
    },
  );

  it("still approves all six legacy scalar keys and refuses a real moderator without touching siblings", async () => {
    const before = await snapshot();
    const patch = {
      primaryTitle: `Reviewed compatibility ${f.runId}`,
      primaryTitleLanguage: "en",
      releaseStatus: "ONGOING",
      publicationYear: 2024,
      publicationLabel: "Synthetic 2024",
      originalLanguage: "ja",
    };
    const submitted = await submit(
      request(`catalog/works/${work.id}/suggestions`, owner, {
        submitKey: randomUUID(),
        baseWorkRevision: work.revision,
        patch,
        citation: citation(),
      }),
      context(),
    );
    expect(submitted.status).toBe(200);
    const proposal = await submitted.json();
    const body = {
      revision: proposal.revision,
      baseWorkRevision: work.revision,
      decision: "APPROVE",
      reason: "Explicitly reviewed six synthetic facts",
      metadataReviewAcknowledged: true,
      publicationReviewAcknowledged: true,
    };
    const routeContext = { params: Promise.resolve({ id: proposal.id }) };
    const submittedState = await snapshot();
    expect(
      (
        await review(
          request(
            `admin/edit-suggestions/${proposal.id}/review`,
            moderator,
            body,
          ),
          routeContext,
        )
      ).status,
    ).toBe(403);
    expect(await snapshot()).toEqual(submittedState);
    expect(
      (
        await review(
          request(`admin/edit-suggestions/${proposal.id}/review`, admin, body),
          routeContext,
        )
      ).status,
    ).toBe(200);
    const current = (await adminGetWork(work.id, headers(admin))) as AdminWork;
    expect(current).toMatchObject({
      id: work.id,
      slug: work.slug,
      revision: work.revision + 1,
      ...patch,
    });
    const after = await snapshot();
    expect(after.descriptions).toEqual(before.descriptions);
    expect(after.titles.filter((t) => t.kind !== "PRIMARY")).toEqual(
      before.titles.filter((t) => t.kind !== "PRIMARY"),
    );
    expect(after.memberships).toEqual(before.memberships);
    expect(after.taxonomy).toEqual(before.taxonomy);
    expect(after.editions).toEqual(before.editions);
    expect(after.credits).toEqual(before.credits);
    expect(after.identifiers).toEqual(before.identifiers);
    expect(after.covers).toEqual(before.covers);
    expect(after.relations).toEqual(before.relations);
    expect(after.sources.count).toBe(before.sources.count + 1);
    expect(after.counts.audits).toBe(before.counts.audits + 1);
    expect(after.counts.proposals).toBe(before.counts.proposals + 1);
    expect(after.counts.events).toBe(before.counts.events + 2);
  });
});
