import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import {
  createWork,
  updateWork,
} from "../../apps/web/src/server/catalog/service";
import { adminInput } from "../../apps/web/src/components/catalog/admin-input";
import {
  normalizeTitle,
  workInputSchema,
  type AdminWork,
  type WorkInput,
} from "../../apps/web/src/features/catalog/contracts";
import {
  canonicalMetadataProposalInput,
  submitMetadataProposalSchema,
  type SubmitMetadataProposal,
} from "../../apps/web/src/features/catalog/metadata-operations";
import { metadataSuggestionSchema } from "../../apps/web/src/features/catalog/metadata-suggestion-contracts";
import { POST as submit } from "../../apps/web/src/app/api/catalog/works/[slug]/metadata-suggestions/route";
import { POST as review } from "../../apps/web/src/app/api/admin/metadata-suggestions/[id]/review/route";

// Real signed Better Auth/SMTP/SQL coverage. Run ONLY against the parent-owned
// disposable database; this file never starts PostgreSQL or applies migrations.
const f = catalogAuthFixture();
const sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
type RawRow = Record<string, unknown>;
// Strip postgres.js RowList metadata, retaining every raw column and timestamp.
const safeRows = (rows: Iterable<object | undefined>): RawRow[] =>
  Array.from(rows, (row) => {
    if (!row) throw new Error("Missing SQL fixture row");
    return { ...row };
  });
let admin: Actor, owner: Actor;
const owned = new Set<string>();
const baseGenre = `preserve-base-${f.runId}`;
const addedGenre = `preserve-added-${f.runId}`;
const genreDefinitions = [
  {
    slug: baseGenre,
    nameEn: "Synthetic baseline genre",
    nameVi: "Thể loại gốc tổng hợp",
  },
  {
    slug: addedGenre,
    nameEn: "Synthetic additional genre",
    nameVi: "Thể loại bổ sung tổng hợp",
  },
];
const headers = () => new Headers({ cookie: admin.cookie, origin: f.origin });
function request(path: string, actor: Actor, body: unknown) {
  return new Request(`${f.origin}/api/${path}`, {
    method: "POST",
    headers: {
      cookie: actor.cookie,
      origin: f.origin,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
function input(extra: Record<string, unknown> = {}): WorkInput {
  return workInputSchema.parse({
    primaryTitle: `Preservation synthetic ${randomUUID()}`,
    primaryTitleLanguage: "en",
    format: "NOVEL",
    visibility: "PUBLISHED",
    publicationReviewAcknowledged: true,
    releaseStatus: "COMPLETED",
    originalLanguage: "ja",
    country: "JP",
    publicationYear: 2001,
    publicationLabel: "Synthetic publication label",
    source: {
      label: f.sourceLabel,
      citation:
        "Synthetic V1 seed; not a real bibliographic or rights assertion",
    },
    titles: [
      {
        title: "Protected synthetic original",
        language: "ja",
        kind: "ORIGINAL",
      },
      { title: "Untouched English alias", language: "en", kind: "ALIAS" },
      { title: "Untouched Vietnamese alias", language: "vi", kind: "ALIAS" },
    ],
    descriptions: [
      { language: "en", text: "Untouched English sibling summary" },
      { language: "vi-VN", text: "Untouched exact-language sibling summary" },
    ],
    editions: [
      {
        title: "Synthetic existing edition",
        language: "vi",
        publisher: "Synthetic publisher A",
        format: "paper",
        publicationYear: 2002,
        publicationLabel: "Synthetic edition label",
        isbn: "9781234567890",
      },
    ],
    creators: [
      {
        name: `Existing synthetic creator ${f.runId}`,
        role: "AUTHOR",
        editionIndex: 0,
        displayOrder: 0,
      },
    ],
    genres: [genreDefinitions[0]],
    // Same schema-valid synthetic path used by existing catalog SQL tests. The
    // checkout has no public/covers assets; physical asset delivery is NOT proven.
    cover: {
      assetPath: "/covers/synthetic.webp",
      rights: "LICENSED",
      credit: "Synthetic fixture credit A",
      rightsStatement:
        "Synthetic test-only rights declaration, not an actual license",
      licenseUrl: "https://example.com/synthetic-license",
    },
    identifiers: [{ namespace: `preserve-${f.runId}`, value: randomUUID() }],
    ...extra,
  });
}
async function create(value: WorkInput) {
  const work = (await createWork(value, headers())) as AdminWork;
  owned.add(work.id);
  return work;
}
async function amend(
  work: AdminWork,
  citation: string,
  change: (value: WorkInput) => void,
) {
  const value = workInputSchema.parse({
    ...adminInput(work),
    publicationReviewAcknowledged: true,
    source: { label: f.sourceLabel, citation },
  });
  change(value);
  return (await updateWork(
    work.id,
    { ...value, revision: work.revision },
    headers(),
  )) as AdminWork;
}
async function facts(workId: string) {
  return {
    works: safeRows(await sql`select * from works where id=${workId}`),
    titles: safeRows(
      await sql`select * from work_titles where work_id=${workId} order by id`,
    ),
    descriptions: safeRows(
      await sql`select * from work_descriptions where work_id=${workId} order by language`,
    ),
    editions: safeRows(
      await sql`select * from editions where work_id=${workId} order by id`,
    ),
    credits: safeRows(
      await sql`select * from work_creators where work_id=${workId} order by id`,
    ),
    creators: safeRows(
      await sql`select * from creators where id in (select creator_id from work_creators where work_id=${workId}) order by id`,
    ),
    memberships: safeRows(
      await sql`select * from work_genres where work_id=${workId} order by genre_slug`,
    ),
    taxonomy: safeRows(
      await sql`select g.* from genres g inner join work_genres m on m.genre_slug=g.slug where m.work_id=${workId} order by g.slug`,
    ),
    cover: safeRows(
      await sql`select * from work_covers where work_id=${workId}`,
    ),
    identifiers: safeRows(
      await sql`select * from work_identifiers where work_id=${workId} order by id`,
    ),
    relations: safeRows(
      await sql`select * from work_relations where from_work_id=${workId} or to_work_id=${workId} order by from_work_id,to_work_id,type`,
    ),
    scalarEvidence: safeRows(
      await sql`select * from catalog_field_evidence where work_id=${workId} order by id`,
    ),
  };
}
async function history(workId: string) {
  return {
    audits: safeRows(
      await sql`select * from catalog_audit_events where work_id=${workId} order by id`,
    ),
    proposals: safeRows(
      await sql`select * from metadata_edit_suggestions where work_id=${workId} order by id`,
    ),
    events: safeRows(
      await sql`select e.* from metadata_edit_events e inner join metadata_edit_suggestions s on s.id=e.suggestion_id where s.work_id=${workId} order by e.suggestion_id,e.revision`,
    ),
    richEvidence: safeRows(
      await sql`select * from catalog_metadata_evidence where work_id=${workId} order by id`,
    ),
  };
}
async function sources() {
  return safeRows(
    await sql`select * from catalog_sources where label=${f.sourceLabel} order by id`,
  );
}
async function taxonomy() {
  return safeRows(
    await sql`select * from genres where slug=${baseGenre} or slug=${addedGenre} order by slug`,
  );
}
const rights = {
  basis: "ORIGINAL_SUMMARY" as const,
  originalityAcknowledged: true as const,
  statement: "I independently wrote this synthetic summary",
};
function proposal(
  workId: string,
  revision: number,
  operation: SubmitMetadataProposal["operation"],
): SubmitMetadataProposal {
  return submitMetadataProposalSchema.parse({
    version: 1,
    workId,
    baseWorkRevision: revision,
    submitKey: randomUUID(),
    citation: {
      label: f.sourceLabel,
      citation: `Synthetic V5B approval source ${randomUUID()}`,
    },
    operation,
  });
}
async function approve(value: SubmitMetadataProposal) {
  const result = await submit(
    request(`catalog/works/${value.workId}/metadata-suggestions`, owner, value),
    { params: Promise.resolve({ slug: value.workId }) },
  );
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("no-store");
  const suggestion = metadataSuggestionSchema.parse(await result.json());
  expect(suggestion.proposal).toEqual(value);
  return {
    suggestion,
    async review() {
      const result = await review(
        request(`admin/metadata-suggestions/${suggestion.id}/review`, admin, {
          version: 1,
          suggestionId: suggestion.id,
          revision: 1,
          baseWorkRevision: value.baseWorkRevision,
          decision: "APPROVE",
          reason:
            "Reviewed the complete synthetic assertion and all rights declarations",
          metadataReviewAcknowledged: true,
          publicationReviewAcknowledged: true,
          rightsReviewAcknowledged: true,
        }),
        { params: Promise.resolve({ id: suggestion.id }) },
      );
      expect(result.status).toBe(200);
      expect(result.headers.get("cache-control")).toBe("no-store");
      const approved = metadataSuggestionSchema.parse(await result.json());
      expect(approved.state).toBe("APPROVED");
      expect(approved.appliedWorkRevision).toBe(value.baseWorkRevision + 1);
      return approved;
    },
  };
}
function unchangedScalars(row: RawRow) {
  return Object.fromEntries(
    Object.entries(row).filter(
      ([key]) =>
        ![
          "revision",
          "source_id",
          "search_text",
          "search_vector",
          "updated_at",
        ].includes(key),
    ),
  );
}
function completeSearch(value: Awaited<ReturnType<typeof facts>>) {
  const names = new Map(
    value.creators.map((c) => [String(c.id), String(c.name)]),
  );
  return normalizeTitle(
    [
      String(value.works[0].primary_title),
      // Legacy search already indexes Work.primary_title: exclude only its
      // exact canonical PRIMARY row, not translated PRIMARY, ALIAS or ORIGINAL.
      ...value.titles
        .filter(
          (t) =>
            !(
              t.kind === "PRIMARY" &&
              t.language === value.works[0].primary_title_language &&
              t.title === value.works[0].primary_title
            ),
        )
        .map((t) => String(t.title)),
      ...value.descriptions.map((d) => String(d.text)),
      ...value.credits.map((c) => names.get(String(c.creator_id))!),
      ...value.taxonomy.flatMap((g) => [String(g.name_en), String(g.name_vi)]),
    ].join(" "),
  );
}
beforeAll(async () => {
  await f.start();
  admin = await f.account("admin");
  owner = await f.account("user");
});
afterAll(async () => {
  requireTestDatabase();
  try {
    // Never disable immutable guards or delete retained audit/evidence/sources.
    // Hide only this fixture's UUIDs and label; parent disposes the whole cluster.
    for (const id of owned) {
      const hidden =
        await sql`update works set visibility='HIDDEN' where id=${id} and source_id in(select id from catalog_sources where label=${f.sourceLabel}) returning id`;
      expect(hidden).toHaveLength(1);
    }
  } finally {
    await f.stop();
  }
});

describe.sequential(
  "V5B complete SQL sibling preservation and aggregate search budget",
  () => {
    it("preserves every unrelated nonempty row, field assertion and old source through all eight selective operations", async () => {
      const neighbor = await create(input({ genres: genreDefinitions }));
      expect(neighbor.creators[0].id).toBeTruthy();
      let work = await create(
        input({
          creators: [
            {
              id: neighbor.creators[0].id,
              name: neighbor.creators[0].name,
              role: "AUTHOR",
              editionIndex: 0,
              displayOrder: 0,
            },
          ],
          relations: [{ toWorkId: neighbor.id, type: "ADAPTATION_OF" }],
        }),
      );
      await amend(
        neighbor,
        "Independent neighbor reverse-relation source",
        (v) => {
          v.relations = [{ toWorkId: work.id, type: "SHARED_UNIVERSE" }];
        },
      );
      // Independently attributed live sibling sources are created by actual V1
      // signed-admin amendments, not blanket FK reassignment in a synthetic mock.
      work = await amend(work, "Independent edition publisher source", (v) => {
        v.editions[0].publisher = "Independent publisher B";
      });
      work = await amend(
        work,
        "Independent existing-creator credit source",
        (v) => {
          v.creators[0].role = "TRANSLATOR";
        },
      );
      work = await amend(work, "Independent cover credit source", (v) => {
        v.cover!.credit = "Independent synthetic cover credit";
      });
      work = await amend(
        work,
        "Independent identifier assertion source",
        (v) => {
          v.identifiers[0].value = randomUUID();
        },
      );
      work = await amend(work, "Independent relation assertion source", (v) => {
        v.relations[0].type = "SEQUEL_OF";
      });
      work = await amend(
        work,
        "Independent untouched title and description source",
        (v) => {
          v.titles.find((t) => t.language === "vi")!.title =
            "Independent unchanged Vietnamese alias";
          v.descriptions.find((d) => d.language === "vi-VN")!.text =
            "Independent untouched exact-language summary";
        },
      );
      const baseline = await facts(work.id),
        neighborBefore = await facts(neighbor.id),
        neighborHistory = await history(neighbor.id);
      for (const key of [
        "editions",
        "credits",
        "creators",
        "cover",
        "identifiers",
        "relations",
        "scalarEvidence",
      ] as const) {
        expect(baseline[key].length, key).toBeGreaterThan(0);
        expect(neighborBefore[key].length, `neighbor ${key}`).toBeGreaterThan(
          0,
        );
      }
      expect(baseline.credits[0].creator_id).toBe(
        neighborBefore.credits[0].creator_id,
      );
      const attributed = [
        ...baseline.titles,
        ...baseline.descriptions,
        ...baseline.editions,
        ...baseline.credits,
        ...baseline.cover,
        ...baseline.identifiers,
        ...baseline.relations,
        ...baseline.memberships,
      ];
      expect(
        new Set(attributed.map((r) => r.source_id)).size,
      ).toBeGreaterThanOrEqual(7);
      const oldSources = await sources(),
        oldIds = new Set(oldSources.map((s) => String(s.id))),
        definitions = await taxonomy();
      expect(definitions).toHaveLength(2);
      let addedTitleId = "";
      const operations: (() => SubmitMetadataProposal["operation"])[] = [
        () => ({
          type: "TITLE_ADD",
          value: {
            title: "New selective French alias",
            language: "fr",
            kind: "ALIAS",
          },
        }),
        () => ({
          type: "TITLE_REPLACE",
          titleId: addedTitleId,
          title: "Corrected selective French alias",
        }),
        () => ({
          type: "TITLE_REMOVE",
          titleId: addedTitleId,
          reason: "Remove only the newly added French alias",
        }),
        () => ({
          type: "DESCRIPTION_ADD",
          language: "de-DE",
          text: "New independently written German summary",
          rights,
        }),
        () => ({
          type: "DESCRIPTION_REPLACE",
          language: "de-DE",
          text: "Revised independently written German summary",
          rights,
        }),
        () => ({
          type: "DESCRIPTION_REMOVE",
          language: "de-DE",
          reason: "Remove only the exact newly added language key",
        }),
        () => ({ type: "GENRE_ADD_MEMBERSHIP", slug: addedGenre }),
        () => ({
          type: "GENRE_REMOVE_MEMBERSHIP",
          slug: addedGenre,
          reason: "Remove membership only, retain curated taxonomy",
        }),
      ];
      for (const [index, operation] of operations.entries()) {
        const before = await facts(work.id),
          beforeHistory = await history(work.id),
          beforeSources = await sources();
        const op = operation(),
          value = proposal(work.id, Number(before.works[0].revision), op);
        const pending = await approve(value);
        // Submission itself must never alter any catalog assertion or publish source.
        expect(await facts(work.id)).toEqual(before);
        expect(await sources()).toEqual(beforeSources);
        expect((await history(work.id)).audits).toEqual(beforeHistory.audits);
        await pending.review();
        const after = await facts(work.id),
          afterHistory = await history(work.id),
          afterSources = await sources();
        const decisionSource = String(after.works[0].source_id);
        expect(afterSources).toHaveLength(beforeSources.length + 1);
        expect(afterSources.filter((s) => oldIds.has(String(s.id)))).toEqual(
          oldSources,
        );
        expect(afterSources.find((s) => s.id === decisionSource)).toMatchObject(
          { label: f.sourceLabel, citation: value.citation.citation },
        );
        expect(after.works[0].revision).toBe(
          Number(before.works[0].revision) + 1,
        );
        expect(unchangedScalars(after.works[0])).toEqual(
          unchangedScalars(baseline.works[0]),
        );
        for (const key of [
          "editions",
          "credits",
          "creators",
          "cover",
          "identifiers",
          "relations",
          "scalarEvidence",
        ] as const)
          expect(after[key], `${op.type}: unchanged ${key}`).toEqual(
            baseline[key],
          );
        expect(
          await facts(neighbor.id),
          `${op.type}: complete neighbor`,
        ).toEqual(neighborBefore);
        expect(await history(neighbor.id)).toEqual(neighborHistory);
        expect(
          await taxonomy(),
          `${op.type}: no taxonomy rename/create`,
        ).toEqual(definitions);
        // Every original title/language/membership assertion retains its raw source
        // and identity, while the temporary selected rows have exact selective diffs.
        expect(
          after.titles.filter((r) =>
            baseline.titles.some((b) => b.id === r.id),
          ),
        ).toEqual(baseline.titles);
        expect(
          after.descriptions.filter((r) => r.language !== "de-DE"),
        ).toEqual(baseline.descriptions);
        expect(
          after.memberships.filter((r) => r.genre_slug !== addedGenre),
        ).toEqual(baseline.memberships);
        if (op.type === "TITLE_ADD") {
          const row = after.titles.find((t) => t.title === op.value.title)!;
          expect(row).toBeTruthy();
          addedTitleId = String(row.id);
          expect(row).toEqual({
            id: addedTitleId,
            work_id: work.id,
            title: op.value.title,
            language: "fr",
            kind: "ALIAS",
            normalized: normalizeTitle(op.value.title),
            source_id: decisionSource,
          });
          expect(after.titles.filter((r) => r.id !== addedTitleId)).toEqual(
            before.titles,
          );
          expect(after.titles).toHaveLength(before.titles.length + 1);
        } else if (op.type === "TITLE_REPLACE") {
          const previous = before.titles.find((r) => r.id === addedTitleId)!;
          expect(after.titles.find((r) => r.id === addedTitleId)).toEqual({
            ...previous,
            title: op.title,
            normalized: normalizeTitle(op.title),
            source_id: decisionSource,
          });
          expect(after.titles.filter((r) => r.id !== addedTitleId)).toEqual(
            before.titles.filter((r) => r.id !== addedTitleId),
          );
          expect(after.titles).toHaveLength(before.titles.length);
        } else if (op.type === "TITLE_REMOVE")
          expect(after.titles).toEqual(
            before.titles.filter((r) => r.id !== addedTitleId),
          );
        else expect(after.titles).toEqual(before.titles);
        if (
          op.type === "DESCRIPTION_ADD" ||
          op.type === "DESCRIPTION_REPLACE"
        ) {
          expect(
            after.descriptions.find((r) => r.language === "de-DE"),
          ).toEqual({
            work_id: work.id,
            language: "de-DE",
            text: op.text,
            source_id: decisionSource,
          });
          expect(after.descriptions).toHaveLength(
            before.descriptions.length +
              (op.type === "DESCRIPTION_ADD" ? 1 : 0),
          );
          if (op.type === "DESCRIPTION_REPLACE")
            expect(
              before.descriptions.find((r) => r.language === "de-DE")?.work_id,
            ).toBe(work.id);
        } else if (op.type === "DESCRIPTION_REMOVE")
          expect(after.descriptions).toEqual(
            before.descriptions.filter((r) => r.language !== "de-DE"),
          );
        else expect(after.descriptions).toEqual(before.descriptions);
        if (op.type === "GENRE_ADD_MEMBERSHIP") {
          expect(
            after.memberships.find((r) => r.genre_slug === addedGenre),
          ).toEqual({
            work_id: work.id,
            genre_slug: addedGenre,
            source_id: decisionSource,
          });
          expect(after.memberships).toHaveLength(before.memberships.length + 1);
        } else if (op.type === "GENRE_REMOVE_MEMBERSHIP")
          expect(after.memberships).toEqual(
            before.memberships.filter((r) => r.genre_slug !== addedGenre),
          );
        else expect(after.memberships).toEqual(before.memberships);
        const expected = completeSearch(after),
          actual = String(after.works[0].search_text);
        expect(actual).toBe(normalizeTitle(actual));
        expect(actual.length).toBeLessThanOrEqual(100000);
        // Complete normalized token multiset avoids imposing an undocumented SQL
        // genre-row ordering, while rejecting omission/duplication of any sibling.
        expect(actual.split(" ").sort()).toEqual(expected.split(" ").sort());
        expect(
          (
            await sql`select search_vector=to_tsvector('simple'::regconfig,search_text) as valid from works where id=${work.id}`
          )[0]?.valid,
        ).toBe(true);
        expect(afterHistory.proposals).toHaveLength(index + 1);
        expect(afterHistory.events).toHaveLength((index + 1) * 2);
        expect(afterHistory.richEvidence).toHaveLength(index + 1);
        expect(afterHistory.audits).toHaveLength(
          beforeHistory.audits.length + 1,
        );
        for (const key of ["proposals", "events", "richEvidence"] as const) {
          const priorIds = new Set(beforeHistory[key].map((r) => String(r.id)));
          expect(
            afterHistory[key].filter((r) => priorIds.has(String(r.id))),
            `${op.type}: prior ${key}`,
          ).toEqual(beforeHistory[key]);
        }
        const beforeAuditIds = new Set(
          beforeHistory.audits.map((r) => String(r.id)),
        );
        expect(
          afterHistory.audits.filter((r) => beforeAuditIds.has(String(r.id))),
        ).toEqual(beforeHistory.audits);
        expect(
          afterHistory.richEvidence.find(
            (r) => r.suggestion_id === pending.suggestion.id,
          ),
        ).toMatchObject({
          work_id: work.id,
          work_revision: Number(before.works[0].revision) + 1,
          operation_type: op.type,
          decision_source_id: decisionSource,
        });
        expect(
          afterHistory.audits.find((r) => !beforeAuditIds.has(String(r.id))),
        ).toMatchObject({
          operation: "UPDATE",
          actor_id_snapshot: "metadata-review",
          changes: { sourceId: decisionSource },
        });
      }
      expect((await facts(work.id)).titles).toEqual(baseline.titles);
      expect((await facts(work.id)).descriptions).toEqual(
        baseline.descriptions,
      );
      expect((await facts(work.id)).memberships).toEqual(baseline.memberships);
      // No quota reset/deletion/clock manipulation is used by either test.
      for (const actor of [admin, owner]) {
        const [bucket] =
          await sql`select count from rate_limits where key=${`catalog.write:${actor.id}`}`;
        expect(Number(bucket?.count)).toBeGreaterThan(0);
        expect(Number(bucket?.count)).toBeLessThanOrEqual(9);
      }
    });

    it("rejects an individually valid 20K proposal when the complete normalized document would exceed 100000, before any catalog/proposal/event writes", async () => {
      const work = await create(
        input({
          descriptions: ["en", "vi", "ja", "fr"].map((language) => ({
            language,
            text: `Initial ${language} fixture summary`,
          })),
        }),
      );
      const ascii = (letter: string) =>
        `${`${letter} `.repeat(9999)}${letter}${letter}`;
      const texts = ["a", "b", "c", "d"].map(ascii);
      texts.forEach((text) => expect(text).toHaveLength(20000));
      requireTestDatabase();
      // V1's legacy whole-input 60K budget cannot seed an 80K aggregate. These
      // isolated fixture-only SQL writes build a structurally valid existing row
      // set, without altering any production writer or weakening its frozen cap.
      const seeded = await facts(work.id);
      const replacements = new Map(
        ["en", "vi", "ja", "fr"].map((language, index) => [
          language,
          texts[index],
        ]),
      );
      const search = completeSearch({
        ...seeded,
        descriptions: seeded.descriptions.map((row) => ({
          ...row,
          text: replacements.get(String(row.language))!,
        })),
      });
      expect(search.length).toBeGreaterThan(80000);
      expect(search.length).toBeLessThan(100000);
      await sql.begin(async (tx) => {
        for (const [index, language] of ["en", "vi", "ja", "fr"].entries())
          await tx`update work_descriptions set text=${texts[index]} where work_id=${work.id} and language=${language}`;
        await tx`update works set search_text=${search} where id=${work.id}`;
      });
      const expanded = await facts(work.id);
      expect(
        expanded.descriptions.map((row) => String(row.text).length),
      ).toEqual([20000, 20000, 20000, 20000]);
      expect(expanded.works[0].search_text).toBe(completeSearch(expanded));
      const value = proposal(work.id, work.revision, {
        type: "DESCRIPTION_ADD",
        language: "de",
        text: ascii("e"),
        rights,
      });
      expect(submitMetadataProposalSchema.parse(value)).toEqual(value);
      expect(
        Buffer.byteLength(canonicalMetadataProposalInput(value), "utf8"),
      ).toBeLessThan(60000);
      expect(
        normalizeTitle(
          `${search} ${value.operation.type === "DESCRIPTION_ADD" ? value.operation.text : ""}`,
        ).length,
      ).toBeGreaterThan(100000);
      const before = {
        facts: await facts(work.id),
        history: await history(work.id),
        sources: await sources(),
        taxonomy: await taxonomy(),
      };
      const response = await submit(
        request(`catalog/works/${work.id}/metadata-suggestions`, owner, value),
        { params: Promise.resolve({ slug: work.id }) },
      );
      expect(response.status).toBe(409);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "LIMIT_EXCEEDED" });
      expect({
        facts: await facts(work.id),
        history: await history(work.id),
        sources: await sources(),
        taxonomy: await taxonomy(),
      }).toEqual(before);
      expect(
        (
          await sql`select count(*)::int as count from work_descriptions where work_id=${work.id}`
        )[0]?.count,
      ).toBe(4);
      expect(
        (
          await sql`select count(*)::int as count from metadata_edit_suggestions where work_id=${work.id}`
        )[0]?.count,
      ).toBe(0);
      expect(
        (
          await sql`select count(*)::int as count from metadata_edit_events e inner join metadata_edit_suggestions s on s.id=e.suggestion_id where s.work_id=${work.id}`
        )[0]?.count,
      ).toBe(0);
      expect(
        (
          await sql`select revision,search_text from works where id=${work.id}`
        )[0],
      ).toMatchObject({ revision: work.revision, search_text: search });
      const [bucket] =
        await sql`select count from rate_limits where key=${`catalog.write:${owner.id}`}`;
      expect(Number(bucket?.count)).toBeGreaterThan(0);
      expect(Number(bucket?.count)).toBeLessThanOrEqual(9);
    });

    it("counts the canonical PRIMARY once at the full search boundary", async () => {
      const primary = "P".repeat(500);
      const work = await create(
        input({
          primaryTitle: primary,
          titles: [{ title: "x", language: "en", kind: "ALIAS" }],
          descriptions: [],
          creators: [],
          genres: [],
        }),
      );
      const seeded = await facts(work.id);
      const canonical = seeded.titles.find(
        (row) =>
          row.kind === "PRIMARY" &&
          row.language === "en" &&
          row.title === primary,
      )!;
      expect(canonical).toBeTruthy();
      expect(seeded.creators).toHaveLength(0);
      expect(seeded.memberships).toHaveLength(0);
      // Reach the boundary through real V1 creation and five V5B approvals:
      // no raw SQL seed, oversized legacy create input or quota manipulation.
      const ascii = (letter: string, length: number) => {
        const pairs = Math.floor((length - 1) / 2);
        return `${`${letter} `.repeat(pairs)}${letter.repeat(length - pairs * 2)}`;
      };
      const lengths = [20000, 20000, 20000, 20000, 18991];
      let revision = work.revision;
      for (const [index, language] of [
        "en",
        "vi",
        "ja",
        "fr",
        "de",
      ].entries()) {
        const text = ascii(String.fromCharCode(97 + index), lengths[index]);
        expect(text).toHaveLength(lengths[index]);
        const intent = proposal(work.id, revision, {
          type: "DESCRIPTION_ADD",
          language,
          text,
          rights,
        });
        expect(
          Buffer.byteLength(canonicalMetadataProposalInput(intent), "utf8"),
        ).toBeLessThan(60000);
        const pending = await approve(intent);
        await pending.review();
        revision++;
      }
      const before = await facts(work.id);
      const logical = (
        value: Awaited<ReturnType<typeof facts>>,
        addedTitle?: string,
      ) =>
        normalizeTitle(
          [
            primary,
            ...value.titles
              .filter(
                (row) =>
                  !(
                    row.kind === "PRIMARY" &&
                    row.language === "en" &&
                    row.title === primary
                  ),
              )
              .map((row) => String(row.title)),
            ...(addedTitle ? [addedTitle] : []),
            ...value.descriptions.map((row) => String(row.text)),
          ].join(" "),
        );
      expect(logical(before)).toHaveLength(99498);
      expect(String(before.works[0].search_text).length).toBeLessThanOrEqual(
        100000,
      );
      expect(before.titles).toEqual(seeded.titles);
      // The old adapter double-counts PRIMARY, stores 99999 at this point,
      // and falsely denies this legitimate +2-character alias as 100001.
      // Do not assert the corrected stored baseline before exercising that bug.
      const pending = await approve(
        proposal(work.id, revision, {
          type: "TITLE_ADD",
          value: { title: "y", language: "en", kind: "ALIAS" },
        }),
      );
      await pending.review();
      const after = await facts(work.id);
      // The new assertion is appended to the locked existing-title sequence;
      // its freshly generated UUID must not make the expectation order-random.
      const expected = logical(before, "y");
      expect(logical(after)).toHaveLength(99500);
      expect(expected).toHaveLength(99500);
      expect(after.works[0].search_text).toBe(expected);
      expect(
        String(after.works[0].search_text)
          .split(" ")
          .filter((token) => token === normalizeTitle(primary)),
      ).toHaveLength(1);
      expect(after.works[0].revision).toBe(revision + 1);
      expect(after.titles.find((row) => row.id === canonical.id)).toEqual(
        canonical,
      );
      const previousTitleIds = new Set(
        before.titles.map((row) => String(row.id)),
      );
      expect(
        after.titles.filter((row) => previousTitleIds.has(String(row.id))),
      ).toEqual(before.titles);
      expect(after.titles).toHaveLength(before.titles.length + 1);
      for (const key of [
        "descriptions",
        "editions",
        "credits",
        "creators",
        "memberships",
        "taxonomy",
        "cover",
        "identifiers",
        "relations",
        "scalarEvidence",
      ] as const)
        expect(after[key], `canonical-once: unchanged ${key}`).toEqual(
          before[key],
        );
      expect(unchangedScalars(after.works[0])).toEqual(
        unchangedScalars(before.works[0]),
      );
    });
  },
);
