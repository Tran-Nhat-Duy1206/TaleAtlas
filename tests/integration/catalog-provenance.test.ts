import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { works } from "../../packages/database/src/catalog-schema";
import { adminInput } from "../../apps/web/src/components/catalog/admin-input";
import * as database from "../../apps/web/src/server/database";
import { randomUUID } from "node:crypto";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import {
  workInputSchema,
  catalogQuerySchema,
  type WorkInput,
  type AdminWork,
} from "../../apps/web/src/features/catalog/contracts";
import {
  createWork,
  updateWork,
  setVisibility,
  getWorkBySlug,
  listWorks,
  adminGetWork,
} from "../../apps/web/src/server/catalog/service";
import { loadWork } from "../../apps/web/src/server/catalog/repository";
import { getDatabase } from "../../apps/web/src/server/database";
import { POST } from "../../apps/web/src/app/api/admin/catalog/works/route";
import { PATCH } from "../../apps/web/src/app/api/admin/catalog/works/[id]/route";
import { POST as visibilityPOST } from "../../apps/web/src/app/api/admin/catalog/works/[id]/visibility/route";

const f = catalogAuthFixture();
const sql = f.client;
let admin: Awaited<ReturnType<typeof f.account>>;
const owned = new Set<string>();
const creatorIds = new Set<string>();
const genre = `synthetic-${f.runId}`;
const headers = () => new Headers({ Cookie: admin.cookie });
function input(overrides: Record<string, unknown> = {}): WorkInput {
  return workInputSchema.parse({
    primaryTitle: `Synthetic final review ${randomUUID()}`,
    primaryTitleLanguage: "en",
    format: "NOVEL",
    visibility: "PUBLISHED",
    publicationReviewAcknowledged: true,
    releaseStatus: "UNKNOWN",
    source: {
      label: f.sourceLabel,
      citation:
        "Source A: entirely invented review fixture, not real metadata.",
    },
    ...overrides,
  });
}
async function create(value: WorkInput) {
  const work = (await createWork(value, headers())) as AdminWork;
  owned.add(work.id);
  work.creators.forEach((c) => c.id && creatorIds.add(c.id));
  return work;
}
async function source(id: string) {
  const [row] = await sql`select source_id from works where id = ${id}`;
  return String(row!.source_id);
}
async function snapshot(id: string) {
  return {
    titles:
      await sql`select * from work_titles where work_id = ${id} order by id`,
    descriptions:
      await sql`select * from work_descriptions where work_id = ${id} order by language`,
    editions:
      await sql`select * from editions where work_id = ${id} order by id`,
    creators:
      await sql`select * from work_creators where work_id = ${id} order by id`,
    genres:
      await sql`select * from work_genres where work_id = ${id} order by genre_slug`,
    cover: await sql`select * from work_covers where work_id = ${id}`,
    identifiers:
      await sql`select * from work_identifiers where work_id = ${id} order by id`,
    relations:
      await sql`select * from work_relations where from_work_id = ${id} order by to_work_id,type`,
  };
}
async function evidence(id: string) {
  const rows =
    await sql`select distinct on (field_path) field_path, value, source_id, revision from catalog_field_evidence where work_id = ${id} order by field_path,revision desc`;
  return new Map(rows.map((r) => [String(r.field_path), r]));
}
function command(body: unknown, path: string, method: string) {
  return new Request(`${f.origin}${path}`, {
    method,
    headers: {
      Cookie: admin.cookie,
      Origin: f.origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
beforeAll(async () => {
  await f.start();
  admin = await f.account("admin");
});
afterAll(async () => {
  requireTestDatabase();
  const rows =
    await sql`select id from works where source_id in (select id from catalog_sources where label = ${f.sourceLabel})`;
  rows.forEach((r) => owned.add(String(r.id)));
  for (const id of owned) {
    const credits =
      await sql`select creator_id from work_creators where work_id = ${id}`;
    credits.forEach((r) => creatorIds.add(String(r.creator_id)));
    await sql`delete from catalog_field_evidence where work_id = ${id}`;
    await sql`delete from catalog_audit_events where work_id = ${id}`;
    await sql`delete from work_relations where from_work_id = ${id} or to_work_id = ${id}`;
    await sql`delete from work_creators where work_id = ${id}`;
    await sql`delete from work_titles where work_id = ${id}`;
    await sql`delete from work_descriptions where work_id = ${id}`;
    await sql`delete from work_genres where work_id = ${id}`;
    await sql`delete from work_covers where work_id = ${id}`;
    await sql`delete from work_identifiers where work_id = ${id}`;
    await sql`delete from editions where work_id = ${id}`;
    await sql`delete from works where id = ${id}`;
  }
  for (const id of creatorIds)
    await sql`delete from creators where id = ${id} and not exists(select 1 from work_creators where creator_id = ${id})`;
  await sql`delete from genres where slug = ${genre} and not exists(select 1 from work_genres where genre_slug = ${genre})`;
  await sql`delete from catalog_sources where label = ${f.sourceLabel}`;
  await f.stop();
});

describe.sequential(
  "final V1 review: real PostgreSQL provenance and publication",
  () => {
    it("preserves unchanged rows and scalar evidence through independent source A/B/C amendments", async () => {
      const target = await create(input());
      const value = input({
        originalLanguage: "ja",
        titles: [
          { title: "Đặng Bí Danh Synthetic", language: "vi", kind: "ALIAS" },
          { title: "Nhan đề chuẩn Synthetic", language: "vi", kind: "PRIMARY" },
          { title: "架空原題", language: "ja", kind: "ORIGINAL" },
        ],
        descriptions: [
          { language: "en", text: "Invented A" },
          { language: "vi", text: "Mô tả A" },
        ],
        editions: [
          {
            title: "Invented edition",
            language: "vi",
            publisher: "Publisher A",
          },
        ],
        creators: [
          {
            name: "Invented translator",
            role: "TRANSLATOR",
            editionIndex: 0,
            displayOrder: 0,
          },
        ],
        genres: [
          {
            slug: genre,
            nameEn: "Invented review genre",
            nameVi: "Thể loại thử nghiệm",
          },
        ],
        cover: {
          assetPath: "/covers/synthetic.webp",
          rights: "LICENSED",
          credit: "Credit A",
          rightsStatement: "Invented fixture permission only",
        },
        identifiers: [{ namespace: `review-${f.runId}`, value: randomUUID() }],
        relations: [{ toWorkId: target.id, type: "ADAPTATION_OF" }],
      });
      const work = await create(value);
      const a = await source(work.id);
      const before = await snapshot(work.id);
      const base = {
        ...value,
        editions: work.editions,
        creators: work.creators,
      };
      const second = (await updateWork(
        work.id,
        {
          ...base,
          revision: 1,
          source: {
            ...value.source,
            citation: "Source B: only the English description was revised.",
          },
          descriptions: [
            { language: "en", text: "Invented B" },
            value.descriptions[1],
          ],
        },
        headers(),
      )) as AdminWork;
      expect(second).toMatchObject({
        id: work.id,
        slug: work.slug,
        revision: 2,
      });
      const b = await source(work.id);
      expect(b).not.toBe(a);
      const afterB = await snapshot(work.id);
      for (const key of [
        "titles",
        "editions",
        "creators",
        "genres",
        "cover",
        "identifiers",
        "relations",
      ] as const)
        expect(afterB[key]).toEqual(before[key]);
      expect(afterB.descriptions).toMatchObject([
        { language: "en", text: "Invented B", source_id: b },
        { language: "vi", source_id: a },
      ]);
      const thirdInput = {
        ...base,
        primaryTitle: `${value.primaryTitle} amended`,
        revision: 2,
        source: {
          ...value.source,
          citation:
            "Source C: canonical title, publisher and cover credit amended.",
        },
        descriptions: second.descriptions,
        editions: second.editions.map((e) => ({
          ...e,
          publisher: "Publisher C",
        })),
        cover: { ...value.cover!, credit: "Credit C" },
      };
      const third = (await updateWork(
        work.id,
        thirdInput,
        headers(),
      )) as AdminWork;
      const c = await source(work.id);
      expect(third).toMatchObject({
        id: work.id,
        slug: work.slug,
        revision: 3,
      });
      expect(third.editions[0]!.id).toBe(work.editions[0]!.id);
      const afterC = await snapshot(work.id);
      for (const key of [
        "descriptions",
        "creators",
        "genres",
        "identifiers",
        "relations",
      ] as const)
        expect(afterC[key]).toEqual(afterB[key]);
      expect(afterC.editions[0]).toMatchObject({
        id: work.editions[0]!.id,
        publisher: "Publisher C",
        source_id: c,
      });
      expect(afterC.titles.filter((t) => t.language !== "en")).toEqual(
        before.titles.filter((t) => t.language !== "en"),
      );
      const current = await evidence(work.id);
      expect(current.get("work.primaryTitle")).toMatchObject({
        source_id: c,
        revision: 3,
        value: third.primaryTitle,
      });
      expect(current.get("work.originalLanguage")).toMatchObject({
        source_id: a,
        revision: 1,
        value: "ja",
      });
      expect(
        current.get(`edition.${work.editions[0]!.id}.publisher`),
      ).toMatchObject({ source_id: c, revision: 3 });
      expect(
        current.get(`edition.${work.editions[0]!.id}.title`),
      ).toMatchObject({ source_id: a, revision: 1 });
      expect(current.get("cover.credit")).toMatchObject({
        source_id: c,
        revision: 3,
      });
      expect(current.get("cover.rightsStatement")).toMatchObject({
        source_id: a,
        revision: 1,
      });
      const history =
        await sql`select * from catalog_audit_events where work_id = ${work.id} order by new_revision`;
      expect(history.map((r) => r.new_revision)).toEqual([1, 2, 3]);
      history.forEach((r) =>
        expect(r).toMatchObject({
          actor_id_snapshot: admin.id,
          changes: { publicationReviewAcknowledged: true },
        }),
      );
      await updateWork(
        work.id,
        {
          ...thirdInput,
          revision: 3,
          editions: [],
          creators: [],
          cover: undefined,
          source: {
            ...value.source,
            citation: "Source D: explicit edition and cover removals.",
          },
        },
        headers(),
      );
      const d = await source(work.id);
      const removed = await evidence(work.id);
      expect(
        removed.get(`edition.${work.editions[0]!.id}.exists`),
      ).toMatchObject({ value: null, source_id: d, revision: 4 });
      expect(removed.get("cover.exists")).toMatchObject({
        value: null,
        source_id: d,
        revision: 4,
      });
      expect(
        await sql`select value,source_id from catalog_field_evidence where work_id = ${work.id} and field_path = ${`edition.${work.editions[0]!.id}.publisher`} and revision = 3`,
      ).toMatchObject([{ value: "Publisher C", source_id: c }]);
    });

    it("uses one deterministic title policy for cards, detail and relations, without losing accent-insensitive aliases", async () => {
      for (const reverse of [false, true]) {
        const entries = [
          {
            title: `Đặng Alias ${randomUUID()}`,
            language: "vi",
            kind: "ALIAS",
          },
          { title: "Localized Primary", language: "vi", kind: "PRIMARY" },
          { title: "原作題", language: "ja", kind: "ORIGINAL" },
        ];
        const value = input({
          originalLanguage: "ja",
          titles: reverse ? entries.reverse() : entries,
        });
        const target = await create(value);
        const linked = await create(
          input({
            relations: [{ toWorkId: target.id, type: "ADAPTATION_OF" }],
          }),
        );
        for (const [locale, title, language] of [
          ["vi", "Localized Primary", "vi"],
          ["en", target.primaryTitle, "en"],
        ] as const) {
          const detail = await getWorkBySlug(target.slug, locale);
          const card = (
            await listWorks(
              catalogQuerySchema.parse({ q: target.primaryTitle, locale }),
            )
          ).items.find((w) => w.id === target.id)!;
          const relation = (await getWorkBySlug(linked.slug, locale))
            .relations[0]!;
          for (const row of [detail, card, relation])
            expect(row).toMatchObject({
              displayTitle: title,
              displayTitleLanguage: language,
            });
        }
        const alias = value.titles.find((t) => t.kind === "ALIAS")!.title;
        const q = alias.replace("Đặng", "dang");
        expect(
          (
            await listWorks(catalogQuerySchema.parse({ q, locale: "vi" }))
          ).items.map((w) => w.id),
        ).toContain(target.id);
        await setVisibility(
          target.id,
          { revision: 1, visibility: "HIDDEN" },
          headers(),
        );
        expect((await getWorkBySlug(linked.slug, "vi")).relations).toEqual([]);
      }
      for (const original of [true, false]) {
        const fallback = await create(
          input({
            originalLanguage: "ja",
            titles: [
              {
                title: "Alias must not become display title",
                language: "vi",
                kind: "ALIAS",
              },
              ...(original
                ? [{ title: "原作題", language: "ja", kind: "ORIGINAL" }]
                : []),
            ],
          }),
        );
        const linked = await create(
          input({
            relations: [{ toWorkId: fallback.id, type: "ADAPTATION_OF" }],
          }),
        );
        const expected = {
          displayTitle: original ? "原作題" : fallback.primaryTitle,
          displayTitleLanguage: original ? "ja" : "en",
        };
        expect(await getWorkBySlug(fallback.slug, "vi")).toMatchObject(
          expected,
        );
        expect(
          (
            await listWorks(
              catalogQuerySchema.parse({
                q: fallback.primaryTitle,
                locale: "vi",
              }),
            )
          ).items.find((w) => w.id === fallback.id),
        ).toMatchObject(expected);
        expect(
          (await getWorkBySlug(linked.slug, "vi")).relations[0],
        ).toMatchObject(expected);
      }
    });

    it("never reads a newly private related title after a concurrent hide/edit between result delivery and projection", async () => {
      const targetValue = input({
        titles: [
          { title: "Public localized title", language: "vi", kind: "PRIMARY" },
        ],
      });
      const target = await create(targetValue);
      const linked = await create(
        input({ relations: [{ toWorkId: target.id, type: "ADAPTATION_OF" }] }),
      );
      const db = getDatabase();
      let interleaved = false;
      // Instrument result delivery only: every statement executes against real
      // PostgreSQL and no rows are fabricated. The concurrent writer commits
      // immediately after the relation statement, before public projection.
      const wrap = (builder: object): object =>
        new Proxy(builder, {
          get(object, key) {
            const member = Reflect.get(object, key, object);
            if (typeof member !== "function") return member;
            if (key === "then")
              return (
                resolve?: (rows: unknown) => unknown,
                reject?: (error: unknown) => unknown,
              ) =>
                Promise.resolve(
                  Reflect.apply(member, object, [
                    async (rows: unknown) => {
                      if (!interleaved) {
                        interleaved = true;
                        await updateWork(
                          target.id,
                          {
                            ...targetValue,
                            revision: 1,
                            visibility: "HIDDEN",
                            publicationReviewAcknowledged: false,
                            titles: [
                              {
                                title: "NEW PRIVATE TITLE MUST NOT LEAK",
                                language: "vi",
                                kind: "PRIMARY",
                              },
                            ],
                          },
                          headers(),
                        );
                      }
                      return rows;
                    },
                  ]),
                ).then(resolve, reject);
            return (...args: unknown[]) => {
              const next = Reflect.apply(member, object, args);
              return next &&
                typeof next === "object" &&
                typeof Reflect.get(next, "then") === "function"
                ? wrap(next)
                : next;
            };
          },
        });
      const gated = new Proxy(db, {
        get(object, key) {
          const member = Reflect.get(object, key, object);
          if (typeof member !== "function") return member;
          if (key !== "select") return member.bind(object);
          return (selection?: Record<string, unknown>) => {
            const builder = Reflect.apply(
              member,
              object,
              selection ? [selection] : [],
            );
            return selection && "toWorkId" in selection
              ? wrap(builder)
              : builder;
          };
        },
      });
      const publicWork = await loadWork(gated, linked.id, "vi");
      expect(interleaved).toBe(true);
      expect(publicWork!.relations).toMatchObject([
        { toWorkId: target.id, displayTitle: "Public localized title" },
      ]);
      expect(JSON.stringify(publicWork)).not.toContain(
        "NEW PRIVATE TITLE MUST NOT LEAK",
      );
      expect((await getWorkBySlug(linked.slug, "vi")).relations).toEqual([]);
      await expect(getWorkBySlug(target.slug, "vi")).rejects.toMatchObject({
        status: 404,
      });
    });

    it.each(["detail", "search"] as const)(
      "keeps public %s metadata in one snapshot during a committed hidden/private edit",
      async (mode) => {
        const value = input({
          titles: [
            {
              title: "Old public localized title",
              language: "vi",
              kind: "PRIMARY",
            },
          ],
          descriptions: [{ language: "vi", text: "Old public description" }],
        });
        const work = await create(value);
        const query = catalogQuerySchema.parse({
          q: work.primaryTitle,
          locale: "vi",
        });
        // Fuzzy search legitimately includes other entities. Force equal-title
        // distractor coverage instead of relying on random UUID similarity.
        if (mode === "search")
          await create(
            input({
              primaryTitle: value.primaryTitle,
              titles: [
                {
                  title: "Other public entity",
                  language: "vi",
                  kind: "PRIMARY",
                },
              ],
            }),
          );
        const beforePage = await listWorks(query);
        expect(beforePage.total).toBeGreaterThanOrEqual(
          mode === "search" ? 2 : 1,
        );
        expect(beforePage.items.map((item) => item.id)).toContain(work.id);
        const db = getDatabase();
        let interleaved = false;
        const transactionConfigs: unknown[] = [];
        const spy = vi.spyOn(database, "getDatabase");
        // Gate delivery of the actual full Work row, after PUBLISHED qualification
        // and before child queries. Both the reader and concurrent authenticated
        // writer execute real PostgreSQL; only result delivery is instrumented.
        const wrapBuilder = (builder: object, workRows = false): object =>
          new Proxy(builder, {
            get(object, key) {
              const member = Reflect.get(object, key, object);
              if (typeof member !== "function") return member;
              if (key === "then")
                return (
                  resolve?: (rows: unknown) => unknown,
                  reject?: (error: unknown) => unknown,
                ) =>
                  Promise.resolve(
                    Reflect.apply(member, object, [
                      async (rows: unknown) => {
                        if (workRows && !interleaved) {
                          interleaved = true;
                          expect(rows).toEqual(
                            expect.arrayContaining([
                              expect.objectContaining({
                                id: work.id,
                                visibility: "PUBLISHED",
                              }),
                            ]),
                          );
                          // Writers retain their original DB/transaction path, with
                          // real auth, and cannot recurse into reader instrumentation.
                          spy.mockReturnValue(db);
                          try {
                            await updateWork(
                              work.id,
                              {
                                ...value,
                                revision: 1,
                                visibility: "HIDDEN",
                                publicationReviewAcknowledged: false,
                                titles: [
                                  {
                                    title: "NEW PRIVATE LOCALIZED TITLE",
                                    language: "vi",
                                    kind: "PRIMARY",
                                  },
                                ],
                                descriptions: [
                                  {
                                    language: "vi",
                                    text: "NEW PRIVATE DESCRIPTION",
                                  },
                                ],
                              },
                              headers(),
                            );
                          } finally {
                            spy.mockReturnValue(gated);
                          }
                        }
                        return rows;
                      },
                    ]),
                  ).then(resolve, reject);
              return (...args: unknown[]) => {
                const next = Reflect.apply(member, object, args);
                return next && typeof next === "object"
                  ? wrapBuilder(
                      next,
                      workRows || (key === "from" && args[0] === works),
                    )
                  : next;
              };
            },
          });
        const wrapExecutor = <T extends object>(executor: T): T =>
          new Proxy(executor, {
            get(object, key) {
              const member = Reflect.get(object, key, object);
              if (typeof member !== "function") return member;
              if (key === "transaction")
                return (
                  callback: (tx: object) => unknown,
                  config?: unknown,
                ) => {
                  transactionConfigs.push(config);
                  return Reflect.apply(member, object, [
                    (tx: object) => callback(wrapExecutor(tx)),
                    config,
                  ]);
                };
              if (key === "select")
                return (...args: unknown[]) => {
                  const builder = Reflect.apply(member, object, args);
                  // Only the full Work load is gated, not locator/count/ID reads.
                  return args.length === 0 ? wrapBuilder(builder) : builder;
                };
              return member.bind(object);
            },
          });
        const gated = wrapExecutor(db);
        spy.mockReturnValue(gated);
        try {
          const result =
            mode === "detail"
              ? await getWorkBySlug(work.slug, "vi")
              : await listWorks(query);
          expect(interleaved).toBe(true);
          expect(transactionConfigs).toEqual([
            { isolationLevel: "repeatable read", accessMode: "read only" },
          ]);
          const projected =
            "items" in result
              ? result.items.find((item) => item.id === work.id)
              : result;
          expect(projected).toMatchObject({
            id: work.id,
            displayTitle: "Old public localized title",
            descriptions: [{ language: "vi", text: "Old public description" }],
          });
          if ("items" in result) {
            expect(result.total).toBe(beforePage.total);
            expect(result.items.map((item) => item.id)).toEqual(
              beforePage.items.map((item) => item.id),
            );
          }
          expect(JSON.stringify(result)).not.toContain("NEW PRIVATE");
        } finally {
          spy.mockRestore();
        }
        await expect(getWorkBySlug(work.slug, "vi")).rejects.toMatchObject({
          status: 404,
        });
        const afterPage = await listWorks(query);
        expect(afterPage.total).toBe(beforePage.total - 1);
        expect(afterPage.items.map((item) => item.id)).not.toContain(work.id);
        // Confirm the interleaved update really committed its private children.
        expect(await adminGetWork(work.id, headers())).toMatchObject({
          visibility: "HIDDEN",
          revision: 2,
          titles: expect.arrayContaining([
            {
              title: "NEW PRIVATE LOCALIZED TITLE",
              language: "vi",
              kind: "PRIMARY",
            },
          ]),
          descriptions: [{ language: "vi", text: "NEW PRIVATE DESCRIPTION" }],
        });
      },
    );

    it("preserves unchanged UNKNOWN cover attribution through the real admin DTO/editor round-trip", async () => {
      const value = input({
        cover: { rights: "UNKNOWN", assetPath: "/covers/synthetic.webp" },
      });
      const work = await create(value);
      const a = await source(work.id);
      const dto = (await adminGetWork(work.id, headers())) as AdminWork;
      expect(dto.cover).toMatchObject({
        rights: "UNKNOWN",
        assetPath: "/covers/synthetic.webp",
      });
      const revised = {
        ...adminInput(dto),
        publicationReviewAcknowledged: true,
        revision: 1,
        publicationLabel: "Only this field changed",
        source: { ...value.source, citation: "Source B editorial update" },
      };
      await updateWork(work.id, revised, headers());
      expect(
        await sql`select asset_path,source_id from work_covers where work_id = ${work.id}`,
      ).toMatchObject([{ asset_path: "/covers/synthetic.webp", source_id: a }]);
      expect((await evidence(work.id)).get("cover.assetPath")).toMatchObject({
        source_id: a,
        revision: 1,
        value: "/covers/synthetic.webp",
      });
      expect((await getWorkBySlug(work.slug)).cover).toEqual({
        rights: "UNKNOWN",
      });
    });

    it("bootstraps only currently available legacy attribution and protects evidence on rollback and concurrent edits", async () => {
      const value = input({ editions: [{ title: "Legacy edition" }] });
      const work = await create(value);
      const a = await source(work.id);
      // Synthetic simulation of rows created before the new forward migration.
      await sql`delete from catalog_field_evidence where work_id = ${work.id}`;
      const updated = (await updateWork(
        work.id,
        {
          ...value,
          editions: work.editions,
          revision: 1,
          publicationLabel: "Revised B",
          source: { ...value.source, citation: "Source B" },
        },
        headers(),
      )) as AdminWork;
      const b = await source(work.id);
      const claims = await evidence(work.id);
      expect(claims.get("work.primaryTitle")).toMatchObject({
        source_id: a,
        revision: 1,
      });
      expect(claims.get("work.publicationLabel")).toMatchObject({
        source_id: b,
        revision: 2,
        value: "Revised B",
      });
      expect(claims.get(`edition.${work.editions[0]!.id}.title`)).toMatchObject(
        { source_id: a, revision: 1 },
      );
      const oldEvidence =
        await sql`select * from catalog_field_evidence where work_id = ${work.id} order by field_path,revision`;
      const oldSourceCount =
        await sql`select count(*)::int as n from catalog_sources where label = ${f.sourceLabel}`;
      await expect(
        updateWork(
          work.id,
          { ...value, editions: [{ id: randomUUID() }], revision: 2 },
          headers(),
        ),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        updateWork(
          work.id,
          { ...value, editions: updated.editions, revision: 1 },
          headers(),
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        await sql`select * from catalog_field_evidence where work_id = ${work.id} order by field_path,revision`,
      ).toEqual(oldEvidence);
      expect(
        await sql`select count(*)::int as n from catalog_sources where label = ${f.sourceLabel}`,
      ).toEqual(oldSourceCount);
      const results = await Promise.allSettled(
        ["C", "D"].map((suffix) =>
          updateWork(
            work.id,
            {
              ...value,
              editions: updated.editions,
              revision: 2,
              primaryTitle: `${value.primaryTitle} ${suffix}`,
              source: { ...value.source, citation: `Source ${suffix}` },
            },
            headers(),
          ),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toMatchObject([
        { reason: { status: 409 } },
      ]);
      expect(
        await sql`select revision from catalog_field_evidence where work_id = ${work.id} and field_path = 'work.primaryTitle' and revision = 3`,
      ).toEqual([{ revision: 3 }]);
      expect(
        await sql`select new_revision from catalog_audit_events where work_id = ${work.id} order by new_revision`,
      ).toEqual([
        { new_revision: 1 },
        { new_revision: 2 },
        { new_revision: 3 },
      ]);
    });

    it("requires and atomically audits explicit publication acknowledgment on all real administrator mutation routes", async () => {
      const value = input();
      const { publicationReviewAcknowledged: _ack, ...unacknowledged } = value;
      const count =
        await sql`select count(*)::int as n from catalog_sources where label = ${f.sourceLabel}`;
      for (const ack of [undefined, false]) {
        const response = await POST(
          command(
            { ...unacknowledged, publicationReviewAcknowledged: ack },
            "/api/admin/catalog/works",
            "POST",
          ),
        );
        expect(response.status).toBe(400);
      }
      expect(
        await sql`select count(*)::int as n from catalog_sources where label = ${f.sourceLabel}`,
      ).toEqual(count);
      const response = await POST(
        command(value, "/api/admin/catalog/works", "POST"),
      );
      expect(response.status).toBe(200);
      const work = (await response.json()) as AdminWork;
      owned.add(work.id);
      const context = { params: Promise.resolve({ id: work.id }) };
      for (const ack of [undefined, false]) {
        expect(
          (
            await PATCH(
              command(
                {
                  ...unacknowledged,
                  revision: 1,
                  publicationReviewAcknowledged: ack,
                },
                `/api/admin/catalog/works/${work.id}`,
                "PATCH",
              ),
              context,
            )
          ).status,
        ).toBe(400);
      }
      expect(await adminGetWork(work.id, headers())).toMatchObject({
        revision: 1,
      });
      expect(
        (
          await PATCH(
            command(
              { ...value, revision: 1 },
              `/api/admin/catalog/works/${work.id}`,
              "PATCH",
            ),
            context,
          )
        ).status,
      ).toBe(200);
      await setVisibility(
        work.id,
        { revision: 2, visibility: "HIDDEN" },
        headers(),
      );
      for (const ack of [undefined, false]) {
        expect(
          (
            await visibilityPOST(
              command(
                {
                  revision: 3,
                  visibility: "PUBLISHED",
                  publicationReviewAcknowledged: ack,
                },
                `/api/admin/catalog/works/${work.id}/visibility`,
                "POST",
              ),
              context,
            )
          ).status,
        ).toBe(400);
      }
      expect(await adminGetWork(work.id, headers())).toMatchObject({
        revision: 3,
        visibility: "HIDDEN",
      });
      expect(
        (
          await visibilityPOST(
            command(
              {
                revision: 3,
                visibility: "PUBLISHED",
                publicationReviewAcknowledged: true,
              },
              `/api/admin/catalog/works/${work.id}/visibility`,
              "POST",
            ),
            context,
          )
        ).status,
      ).toBe(200);
      const audits =
        await sql`select * from catalog_audit_events where work_id = ${work.id} order by new_revision`;
      expect(audits).toHaveLength(4);
      for (const index of [0, 1, 3])
        expect(audits[index]).toMatchObject({
          actor_user_id: admin.id,
          actor_id_snapshot: admin.id,
          changes: {
            publicationReviewAcknowledged: true,
            visibility: "PUBLISHED",
          },
        });
      expect(audits[2]!.changes).not.toHaveProperty(
        "publicationReviewAcknowledged",
      );
      expect(
        await sql`select count(*)::int as n from catalog_audit_events where work_id = ${work.id}`,
      ).toEqual([{ n: 4 }]);
    });
  },
);
