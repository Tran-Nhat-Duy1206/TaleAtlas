import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { works } from "../../packages/database/src/catalog-schema";
import * as database from "../../apps/web/src/server/database";
import {
  catalogQuerySchema,
  workInputSchema,
  type AdminWork,
  type CatalogQuery,
  type PublicGenreOptions,
  type WorkInput,
} from "../../apps/web/src/features/catalog/contracts";
import {
  adminGetWork,
  createWork,
  getPublicCatalogPage,
  listWorks,
  updateWork,
} from "../../apps/web/src/server/catalog/service";
import { GET as publicGET } from "../../apps/web/src/app/api/catalog/works/route";
import { POST as submitSuggestion } from "../../apps/web/src/app/api/catalog/works/[slug]/suggestions/route";
import { POST as addLibraryEntry } from "../../apps/web/src/app/api/library/route";
import { PATCH as patchPersonal } from "../../apps/web/src/app/api/library/[id]/personal/route";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";

const f = catalogAuthFixture();
const sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
let admin: Actor;
let owner: Actor;
const ownedWorks = new Set<string>();
const ownedGenres = new Set<string>();
const headers = () => new Headers({ Cookie: admin.cookie });
const token = () => randomUUID().replaceAll("-", "");

function genre(label: string): WorkInput["genres"][number] {
  const slug = `v5c-${label}-${randomUUID()}`;
  ownedGenres.add(slug);
  return {
    slug,
    nameEn: `Invented ${label}`,
    nameVi: `Thể loại thử nghiệm ${label}`,
  };
}
function input(overrides: Record<string, unknown> = {}): WorkInput {
  return workInputSchema.parse({
    primaryTitle: `Synthetic discovery ${randomUUID()}`,
    primaryTitleLanguage: "en",
    format: "NOVEL",
    visibility: "PUBLISHED",
    publicationReviewAcknowledged: true,
    releaseStatus: "UNKNOWN",
    source: {
      label: f.sourceLabel,
      citation:
        "Entirely invented UUID-owned discovery fixture, not live catalog metadata.",
    },
    ...overrides,
  });
}
async function create(value: WorkInput) {
  const work = (await createWork(value, headers())) as AdminWork;
  ownedWorks.add(work.id);
  return work;
}
async function discovery(query: CatalogQuery = {}) {
  return getPublicCatalogPage(catalogQuerySchema.parse(query));
}
function command(path: string, method: string, body: unknown) {
  return new Request(`${f.origin}/api/${path}`, {
    method,
    headers: {
      Cookie: owner.cookie,
      Origin: f.origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
async function publicPage(query: CatalogQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  const response = await publicGET(
    new Request(`${f.origin}/api/catalog/works?${params}`),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return (await response.json()) as Awaited<ReturnType<typeof listWorks>>;
}
// Other sequential suites may leave legitimate fixtures in the retained DB.
// Compare with real membership facts, never assume the entire taxonomy fits 200.
async function expectedOptions(): Promise<PublicGenreOptions> {
  const rows = await sql`
    select g.slug, g.name_en as "nameEn", g.name_vi as "nameVi"
    from genres g
    where exists (
      select 1 from work_genres wg join works w on w.id = wg.work_id
      where wg.genre_slug = g.slug and w.visibility = 'PUBLISHED'
    )
    order by g.slug limit 201`;
  return rows.length > 200
    ? { items: [], overflow: true }
    : {
        items: rows.map((row) => ({
          slug: String(row.slug),
          nameEn: String(row.nameEn),
          nameVi: String(row.nameVi),
        })),
        overflow: false,
      };
}

beforeAll(async () => {
  await f.start();
  admin = await f.account("admin");
  owner = await f.account("user");
});
afterAll(async () => {
  requireTestDatabase();
  // Recover even successful writes whose response assertion failed; only our
  // UUID-labelled sources and explicitly owned rows are eligible for teardown.
  const rows = await sql`
    select w.id from works w join catalog_sources s on s.id = w.source_id
    where s.label = ${f.sourceLabel}`;
  rows.forEach((row) => ownedWorks.add(String(row.id)));
  const ids = [...ownedWorks];
  if (ids.length) {
    const credits = await sql`
      select creator_id from work_creators where work_id = any(${ids}::uuid[])`;
    await sql`delete from library_entries where work_id = any(${ids}::uuid[]) and user_id = ${owner.id}`;
    await sql`delete from edit_suggestion_events where suggestion_id in (select id from edit_suggestions where work_id = any(${ids}::uuid[]))`;
    await sql`delete from edit_suggestions where work_id = any(${ids}::uuid[])`;
    await sql`delete from catalog_field_evidence where work_id = any(${ids}::uuid[])`;
    await sql`delete from catalog_audit_events where work_id = any(${ids}::uuid[])`;
    await sql`delete from work_relations where from_work_id = any(${ids}::uuid[]) or to_work_id = any(${ids}::uuid[])`;
    await sql`delete from work_creators where work_id = any(${ids}::uuid[])`;
    await sql`delete from work_titles where work_id = any(${ids}::uuid[])`;
    await sql`delete from work_descriptions where work_id = any(${ids}::uuid[])`;
    await sql`delete from work_genres where work_id = any(${ids}::uuid[])`;
    await sql`delete from work_covers where work_id = any(${ids}::uuid[])`;
    await sql`delete from work_identifiers where work_id = any(${ids}::uuid[])`;
    await sql`delete from editions where work_id = any(${ids}::uuid[])`;
    await sql`delete from works where id = any(${ids}::uuid[])`;
    const creatorIds = [
      ...new Set(credits.map((row) => String(row.creator_id))),
    ];
    if (creatorIds.length)
      await sql`delete from creators where id = any(${creatorIds}::uuid[]) and not exists(select 1 from work_creators where creator_id = creators.id)`;
  }
  const slugs = [...ownedGenres];
  if (slugs.length)
    await sql`delete from genres where slug = any(${slugs}::text[]) and not exists(select 1 from work_genres where genre_slug = genres.slug)`;
  await sql`delete from catalog_sources where label = ${f.sourceLabel}`;
  await f.stop();
});

describe.sequential("V5C real PostgreSQL public discovery filters", () => {
  it("AND-composes q/format/genre/originalLanguage/releaseStatus in both items and totals", async () => {
    const q = token();
    const selected = genre("composition");
    const second = genre("composition-extra");
    const base = input({
      primaryTitle: q,
      format: "NOVEL",
      originalLanguage: "ja",
      releaseStatus: "ONGOING",
      genres: [selected, second],
      titles: [
        { title: `${q} alias`, language: "en", kind: "ALIAS" },
        { title: `${q} bí danh`, language: "vi", kind: "ALIAS" },
      ],
    });
    const matches = [];
    for (let i = 0; i < 3; i++) matches.push(await create(base));
    for (const excluded of [
      { primaryTitle: token(), titles: [] },
      { format: "MANGA" },
      { genres: [second] },
      { originalLanguage: "ja-JP" },
      { releaseStatus: "UNKNOWN" },
      { visibility: "HIDDEN" },
    ])
      await create(input({ ...base, ...excluded }));
    const query = {
      q,
      format: "NOVEL",
      genre: selected.slug,
      originalLanguage: "ja",
      releaseStatus: "ONGOING",
      pageSize: 2,
    } as const;
    const first = await discovery(query);
    const secondPage = await discovery({ ...query, page: 2 });
    const beyond = await discovery({ ...query, page: 3 });
    expect([
      first.result.total,
      secondPage.result.total,
      beyond.result.total,
    ]).toEqual([3, 3, 3]);
    expect([
      first.result.items.length,
      secondPage.result.items.length,
      beyond.result.items.length,
    ]).toEqual([2, 1, 0]);
    const ids = [...first.result.items, ...secondPage.result.items].map(
      (w) => w.id,
    );
    expect(ids).toEqual(matches.map((w) => w.id).sort());
    expect(new Set(ids).size).toBe(3);
    expect(first.result).toMatchObject({ page: 1, pageSize: 2 });
    expect(secondPage.result).toMatchObject({ page: 2, pageSize: 2 });
    expect(await publicPage(query)).toEqual(first.result);
  });

  it("preserves exact > FTS > substring ranking and fixed-data paging without genre/title/creator join duplicates", async () => {
    const q = token();
    const selected = genre("ranking");
    const extra = genre("ranking-extra");
    const base = {
      genres: [selected, extra],
      originalLanguage: "ja",
      releaseStatus: "ONGOING",
      creators: [
        { name: "Invented first author", role: "AUTHOR", displayOrder: 0 },
        { name: "Invented second author", role: "AUTHOR", displayOrder: 1 },
      ],
      descriptions: [
        { language: "en", text: "Invented English metadata" },
        { language: "vi", text: "Mô tả thử nghiệm" },
      ],
    };
    const exact: AdminWork[] = [];
    const fts: AdminWork[] = [];
    for (let i = 0; i < 2; i++) {
      exact.push(
        await create(
          input({
            ...base,
            primaryTitle: `Invented exact-alias work ${i}`,
            titles: [
              { title: q, language: "en", kind: "ALIAS" },
              { title: q, language: "vi", kind: "ALIAS" },
            ],
          }),
        ),
      );
      fts.push(
        await create(
          input({ ...base, primaryTitle: `${q} invented extra ${i}` }),
        ),
      );
    }
    const substring = await create(
      input({ ...base, primaryTitle: `prefix${q}suffix` }),
    );
    const query = {
      q,
      genre: selected.slug,
      format: "NOVEL",
      originalLanguage: "ja",
      releaseStatus: "ONGOING",
    } as const;
    const expectedIds = [
      ...exact.map((w) => w.id).sort(),
      ...fts.map((w) => w.id).sort(),
      substring.id,
    ];
    const full = await discovery(query);
    expect(full.result.total).toBe(5);
    expect(full.result.items.map((w) => w.id)).toEqual(expectedIds);
    expect(await listWorks(catalogQuerySchema.parse(query))).toEqual(
      full.result,
    );
    const pages = [];
    for (const page of [1, 2, 3]) {
      const result = await discovery({ ...query, page, pageSize: 2 });
      expect(result.result.total).toBe(5);
      expect(result.result.page).toBe(page);
      pages.push(result.result);
    }
    expect(pages.map((page) => page.items.length)).toEqual([2, 2, 1]);
    expect(pages.flatMap((page) => page.items.map((w) => w.id))).toEqual(
      expectedIds,
    );
    expect(new Set(expectedIds).size).toBe(5);
    expect(
      (await discovery({ ...query, page: 2, pageSize: 2 })).result,
    ).toEqual(pages[1]);
    for (const work of full.result.items) {
      expect(work.genres).toHaveLength(2);
      expect(work.creators).toHaveLength(2);
    }
  });

  it("distinguishes SQL NULL, und, ja, JA and ja-JP exactly, and UNKNOWN from an omitted release filter", async () => {
    const selected = genre("language-status");
    const entries: AdminWork[] = [];
    const tags = [undefined, "und", "ja", "JA", "ja-JP"] as const;
    const statuses = [
      "UNKNOWN",
      "UNKNOWN",
      "ONGOING",
      "UNKNOWN",
      "COMPLETED",
    ] as const;
    for (const [index, tag] of tags.entries()) {
      const work = await create(
        input({
          genres: [selected],
          originalLanguage: tag === "JA" ? "ja" : tag,
          releaseStatus: statuses[index],
        }),
      );
      // The DB/read contract permits recorded tags beyond the narrower write
      // schema. Simulate an owned legacy uppercase tag without changing writes.
      if (tag === "JA") {
        requireTestDatabase();
        await sql`update works set original_language = 'JA' where id = ${work.id}`;
      }
      entries.push(work);
    }
    const query = { genre: selected.slug };
    const omitted = await discovery(query);
    expect(omitted.result.total).toBe(5);
    expect(
      omitted.result.items.find((w) => w.id === entries[0]!.id)
        ?.originalLanguage,
    ).toBeNull();
    for (const [index, tag] of tags.entries()) {
      if (!tag) continue;
      const page = await discovery({ ...query, originalLanguage: tag });
      expect(page.result.total).toBe(1);
      expect(page.result.items.map((w) => w.id)).toEqual([entries[index]!.id]);
      expect(page.result.items[0]!.originalLanguage).toBe(tag);
      expect(await publicPage({ ...query, originalLanguage: tag })).toEqual(
        page.result,
      );
    }
    const unknown = await discovery({ ...query, releaseStatus: "UNKNOWN" });
    expect(unknown.result.total).toBe(3);
    expect(new Set(unknown.result.items.map((w) => w.id))).toEqual(
      new Set([entries[0]!.id, entries[1]!.id, entries[3]!.id]),
    );
    for (const filters of [
      { originalLanguage: "ja-jp" },
      { originalLanguage: "zz-QZ" },
      { originalLanguage: "ja", releaseStatus: "UNKNOWN" },
      { genre: `v5c-absent-${randomUUID()}` },
    ] as const) {
      const page = await discovery({ ...query, ...filters });
      expect(page.result).toMatchObject({ items: [], total: 0 });
      expect(await publicPage({ ...query, ...filters })).toEqual(page.result);
    }
    expect(await publicPage({ ...query, releaseStatus: "UNKNOWN" })).toEqual(
      unknown.result,
    );
  });

  it("rejects unknown keys, duplicate scalar parameters and malformed filters through the real anonymous GET", async () => {
    const duplicateValues = {
      q: token(),
      page: "1",
      pageSize: "2",
      format: "NOVEL",
      genre: `v5c-${f.runId}`,
      originalLanguage: "ja",
      releaseStatus: "UNKNOWN",
      locale: "en",
    };
    const invalid = [
      "visibility=PUBLISHED",
      "unknown=value",
      "original_language=ja",
      "release_status=UNKNOWN",
      "originalLanguage=",
      "originalLanguage=ja_JP",
      "originalLanguage=ja--JP",
      `originalLanguage=${"a".repeat(64)}`,
      "originalLanguage=%20ja%20",
      "releaseStatus=unknown",
      "releaseStatus=NOT_A_STATUS",
      "releaseStatus=",
      "genre=Not%20a%20slug",
      "format=not-a-format",
      "locale=ja",
      "page=0",
      "page=1.5",
      "pageSize=51",
      "page=10002&pageSize=1",
      `q=${"x".repeat(201)}`,
      "q=first&%71=second",
      "originalLanguage=ja&originalLanguage=JA",
      "releaseStatus=UNKNOWN&releaseStatus=ONGOING",
      ...Object.entries(duplicateValues).map(
        ([key, value]) => `${key}=${value}&${key}=${value}`,
      ),
    ];
    for (const query of invalid) {
      const response = await publicGET(
        new Request(`${f.origin}/api/catalog/works?${query}`),
      );
      expect(response.status, query).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "VALIDATION_ERROR" });
    }
  });

  it("derives sorted unique options from published membership, independently of q, filters, locale and out-of-range pages", async () => {
    const shared = genre("options-shared");
    const other = genre("options-other");
    const hiddenOnly = genre("options-hidden");
    const draftOnly = genre("options-draft");
    const orphan = genre("options-orphan");
    const value = input({ genres: [shared], primaryTitle: token() });
    await create(value);
    await create(
      input({
        genres: [shared, other],
        format: "MANGA",
        originalLanguage: "vi",
        releaseStatus: "COMPLETED",
      }),
    );
    await create(input({ genres: [hiddenOnly, shared], visibility: "HIDDEN" }));
    await create(input({ genres: [draftOnly], visibility: "DRAFT" }));
    requireTestDatabase();
    await sql`insert into genres (slug, name_en, name_vi) values (${orphan.slug}, ${orphan.nameEn}, ${orphan.nameVi})`;
    const expected = await expectedOptions();
    for (const query of [
      { q: value.primaryTitle, genre: shared.slug, pageSize: 1 },
      { q: token(), page: 99, pageSize: 1 },
      { q: "%_", page: 2 },
      {
        genre: hiddenOnly.slug,
        format: "NOVEL",
        originalLanguage: "ja",
        releaseStatus: "UNKNOWN",
        locale: "vi",
      },
    ] as CatalogQuery[]) {
      const page = await discovery(query);
      expect(page.genreOptions).toEqual(expected);
      const slugs = page.genreOptions.items.map((g) => g.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const absent of [hiddenOnly, draftOnly, orphan])
        expect(slugs).not.toContain(absent.slug);
      for (const option of page.genreOptions.items)
        expect(Object.keys(option).sort()).toEqual([
          "nameEn",
          "nameVi",
          "slug",
        ]);
      if (!expected.overflow) {
        expect(page.genreOptions.items).toEqual(
          expect.arrayContaining([shared, other]),
        );
      }
    }
  });

  it("keeps an unapproved correction and a real private library note out of search, filters and genre options", async () => {
    const selected = genre("privacy");
    const value = input({
      genres: [selected],
      originalLanguage: "ja",
      releaseStatus: "ONGOING",
    });
    const work = await create(value);
    const proposalMarker = token();
    const noteMarker = token();
    const before = await discovery({ genre: selected.slug });
    const suggested = await submitSuggestion(
      command(`catalog/works/${work.id}/suggestions`, "POST", {
        submitKey: randomUUID(),
        baseWorkRevision: 1,
        patch: {
          primaryTitle: proposalMarker,
          originalLanguage: "zz",
          releaseStatus: "COMPLETED",
        },
        citation: { label: f.sourceLabel, citation: proposalMarker },
      }),
      { params: Promise.resolve({ slug: work.id }) },
    );
    expect(suggested.status).toBe(200);
    const added = await addLibraryEntry(
      command("library", "POST", {
        workId: work.id,
        mutationKey: randomUUID(),
      }),
    );
    expect(added.status).toBe(200);
    const entry = (await added.json()) as { id: string; revision: number };
    const noted = await patchPersonal(
      command(`library/${entry.id}/personal`, "PATCH", {
        revision: entry.revision,
        mutationKey: randomUUID(),
        patch: { notes: noteMarker },
      }),
      { params: Promise.resolve({ id: entry.id }) },
    );
    expect(noted.status).toBe(200);
    expect(await noted.json()).toMatchObject({ notes: noteMarker });
    const after = await discovery({ genre: selected.slug });
    expect(after).toEqual(before);
    for (const q of [proposalMarker, noteMarker]) {
      const page = await discovery({ q, genre: selected.slug });
      expect(page.result).toMatchObject({ items: [], total: 0 });
      expect(page.genreOptions).toEqual(before.genreOptions);
      expect(await publicPage({ q, genre: selected.slug })).toEqual(
        page.result,
      );
      expect(JSON.stringify(after)).not.toContain(q);
    }
    expect(
      (
        await discovery({
          genre: selected.slug,
          originalLanguage: "zz",
          releaseStatus: "COMPLETED",
        })
      ).result.total,
    ).toBe(0);
    expect(await adminGetWork(work.id, headers())).toMatchObject({
      revision: 1,
      originalLanguage: "ja",
      releaseStatus: "ONGOING",
    });
    expect(
      await sql`select state from edit_suggestions where work_id = ${work.id}`,
    ).toMatchObject([{ state: "SUBMITTED" }]);
  });

  it("preserves the existing related-work projection while excluding hidden targets from the combined discovery service", async () => {
    const selected = genre("relations");
    const hidden = await create(
      input({
        visibility: "HIDDEN",
        primaryTitle: `Private target ${token()}`,
      }),
    );
    const visible = await create(
      input({
        titles: [
          { title: "Nhan đề công khai", language: "vi", kind: "PRIMARY" },
        ],
      }),
    );
    const linking = await create(
      input({
        genres: [selected],
        relations: [
          { toWorkId: hidden.id, type: "SEQUEL_OF" },
          { toWorkId: visible.id, type: "ADAPTATION_OF" },
        ],
      }),
    );
    const page = await discovery({ genre: selected.slug, locale: "vi" });
    expect(page.result.total).toBe(1);
    expect(page.result.items[0]).toMatchObject({
      id: linking.id,
      relations: [
        {
          toWorkId: visible.id,
          type: "ADAPTATION_OF",
          slug: visible.slug,
          displayTitle: "Nhan đề công khai",
          displayTitleLanguage: "vi",
        },
      ],
    });
    expect(page.result.items[0]!.relations).toHaveLength(1);
    for (const marker of [hidden.id, hidden.slug, hidden.primaryTitle])
      expect(JSON.stringify(page)).not.toContain(marker);
    expect((await adminGetWork(linking.id, headers()))!.relations).toHaveLength(
      2,
    );
    for (const key of [
      "visibility",
      "revision",
      "audit",
      "sourceId",
      "searchText",
      "searchVector",
    ])
      expect(page.result.items[0]).not.toHaveProperty(key);
  });

  it("keeps options/count/body in one read-only repeatable-read snapshot when a qualified Work is concurrently hidden and privately edited", async () => {
    const q = token();
    const selected = genre("snapshot");
    const oldOnly = genre("snapshot-old");
    const privateOnly = genre("snapshot-private");
    const privateMarker = `NEW PRIVATE ${token()}`;
    privateOnly.nameEn = privateMarker;
    const value = input({
      primaryTitle: q,
      originalLanguage: "ja",
      releaseStatus: "ONGOING",
      genres: [selected, oldOnly],
      titles: [
        {
          title: "Old public localized title",
          language: "vi",
          kind: "PRIMARY",
        },
      ],
      descriptions: [{ language: "vi", text: "Old public description" }],
    });
    const target = await create(value);
    const survivor = await create(
      input({
        ...value,
        genres: [selected],
        relations: [{ toWorkId: target.id, type: "ADAPTATION_OF" }],
      }),
    );
    const query = catalogQuerySchema.parse({
      q,
      genre: selected.slug,
      format: "NOVEL",
      originalLanguage: "ja",
      releaseStatus: "ONGOING",
      locale: "vi",
    });
    const before = await discovery(query);
    expect(before.result.total).toBe(2);
    expect(before.genreOptions).toEqual(await expectedOptions());
    const db = database.getDatabase();
    const transactionConfigs: unknown[] = [];
    let interleaved = false;
    const spy = vi.spyOn(database, "getDatabase");
    // Result-delivery gating only, as in catalog-provenance: no query or row is
    // mocked. Commit the real authenticated writer after IDs have qualified,
    // before full Work/child/genre-option statements execute on the reader.
    const wrapBuilder = (builder: object, fromWorks = false): object =>
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
                    if (fromWorks && !interleaved) {
                      interleaved = true;
                      expect(rows).toEqual(
                        expect.arrayContaining([
                          { id: target.id },
                          { id: survivor.id },
                        ]),
                      );
                      spy.mockReturnValue(db);
                      try {
                        await updateWork(
                          target.id,
                          {
                            ...value,
                            revision: 1,
                            visibility: "HIDDEN",
                            publicationReviewAcknowledged: false,
                            format: "MANGA",
                            originalLanguage: "en",
                            releaseStatus: "COMPLETED",
                            genres: [privateOnly],
                            titles: [
                              {
                                title: privateMarker,
                                language: "vi",
                                kind: "PRIMARY",
                              },
                            ],
                            descriptions: [
                              { language: "vi", text: privateMarker },
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
                  fromWorks || (key === "from" && args[0] === works),
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
            return (callback: (tx: object) => unknown, config?: unknown) => {
              transactionConfigs.push(config);
              return Reflect.apply(member, object, [
                (tx: object) => callback(wrapExecutor(tx)),
                config,
              ]);
            };
          if (key === "select")
            return (selection?: Record<string, unknown>) => {
              const builder = Reflect.apply(
                member,
                object,
                selection ? [selection] : [],
              );
              return selection &&
                Object.keys(selection).length === 1 &&
                "id" in selection
                ? wrapBuilder(builder)
                : builder;
            };
          return member.bind(object);
        },
      });
    const gated = wrapExecutor(db);
    spy.mockReturnValue(gated);
    try {
      const page = await discovery(query);
      expect(interleaved).toBe(true);
      expect(transactionConfigs).toEqual([
        { isolationLevel: "repeatable read", accessMode: "read only" },
      ]);
      expect(page).toEqual(before);
      expect(page.result.items.find((w) => w.id === target.id)).toMatchObject({
        displayTitle: "Old public localized title",
        originalLanguage: "ja",
        releaseStatus: "ONGOING",
        genres: [selected, oldOnly],
        descriptions: [{ language: "vi", text: "Old public description" }],
      });
      expect(JSON.stringify(page)).not.toContain(privateMarker);
      expect(page.genreOptions.items.map((g) => g.slug)).not.toContain(
        privateOnly.slug,
      );
    } finally {
      spy.mockRestore();
    }
    const next = await discovery(query);
    expect(next.result.total).toBe(1);
    expect(next.result.items.map((w) => w.id)).toEqual([survivor.id]);
    expect(next.result.items[0]!.relations).toEqual([]);
    expect(next.genreOptions).toEqual(await expectedOptions());
    expect(next.genreOptions.items.map((g) => g.slug)).not.toContain(
      oldOnly.slug,
    );
    expect(next.genreOptions.items.map((g) => g.slug)).not.toContain(
      privateOnly.slug,
    );
    expect(JSON.stringify(next)).not.toContain(privateMarker);
    expect(await adminGetWork(target.id, headers())).toMatchObject({
      revision: 2,
      visibility: "HIDDEN",
      format: "MANGA",
      originalLanguage: "en",
      releaseStatus: "COMPLETED",
      genres: [privateOnly],
      descriptions: [{ language: "vi", text: privateMarker }],
    });
  });

  it("simulates the 201-option bound with published memberships across owned Works (at most ten each), never a live taxonomy overflow", async () => {
    const seed = await create(input({ primaryTitle: token() }));
    const extraIds = Array.from({ length: 20 }, () => randomUUID());
    extraIds.forEach((id) => ownedWorks.add(id));
    const ids = [seed.id, ...extraIds];
    const slugs = Array.from(
      { length: 201 },
      (_, index) => `v5c-bound-${f.runId}-${index}`,
    );
    slugs.forEach((slug) => ownedGenres.add(slug));
    requireTestDatabase();
    // Bulk fixture setup is intentionally SQL, not 201 mutations or a raised
    // service bound. All rows are synthetic and share our UUID-owned source.
    await sql`
      insert into works (id, slug, primary_title, primary_title_language, format, visibility, release_status, source_id, search_text)
      select new_id, 'v5c-bound-' || new_id::text, w.primary_title, 'en', 'NOVEL', 'PUBLISHED', 'UNKNOWN', w.source_id, w.search_text
      from unnest(${extraIds}::uuid[]) as owned(new_id) cross join works w where w.id = ${seed.id}`;
    await sql`
      insert into genres (slug, name_en, name_vi)
      select slug, 'Invented bound genre', 'Thể loại giới hạn thử nghiệm'
      from unnest(${slugs}::text[]) as owned(slug)`;
    await sql`
      insert into work_genres (work_id, genre_slug, source_id)
      select (${ids}::uuid[])[((ordinality - 1) / 10 + 1)::int], owned.slug, w.source_id
      from unnest(${slugs}::text[]) with ordinality as owned(slug, ordinality)
      cross join works w where w.id = ${seed.id}`;
    const membership = await sql`
      select work_id, count(*)::int as n from work_genres
      where work_id = any(${ids}::uuid[]) group by work_id`;
    expect(membership).toHaveLength(21);
    expect(membership.reduce((sum, row) => sum + Number(row.n), 0)).toBe(201);
    expect(membership.every((row) => Number(row.n) <= 10)).toBe(true);
    const query = { genre: slugs[200]!, pageSize: 1 };
    const page = await discovery(query);
    expect(page.result.total).toBe(1);
    expect(page.result.items.map((w) => w.id)).toEqual([ids[20]]);
    expect(page.genreOptions).toEqual({ items: [], overflow: true });
    const emptyPage = await discovery({ ...query, page: 2, q: token() });
    expect(emptyPage.result).toMatchObject({ items: [], total: 0 });
    expect(emptyPage.genreOptions).toEqual({ items: [], overflow: true });
    expect(await publicPage(query)).toEqual(page.result);
  });
});
