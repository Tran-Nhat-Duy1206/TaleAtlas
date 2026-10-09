import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import {
  workInputSchema,
  catalogQuerySchema,
  type AdminWork,
  type WorkInput,
} from "../../apps/web/src/features/catalog/contracts";
import {
  createWork,
  updateWork,
  setVisibility,
  getWorkBySlug,
  listWorks,
  adminGetWork,
} from "../../apps/web/src/server/catalog/service";
import { POST } from "../../apps/web/src/app/api/admin/catalog/works/route";
import { GET as adminGET } from "../../apps/web/src/app/api/admin/catalog/works/[id]/route";
import { GET as publicGET } from "../../apps/web/src/app/api/catalog/works/[slug]/route";

const f = catalogAuthFixture();
const sql = f.client;
let admin: Awaited<ReturnType<typeof f.account>>;
let reader: typeof admin;
let moderator: typeof admin;
const ownedWorks = new Set<string>();
const ownedCreators = new Set<string>();
const headers = (cookie: string) => new Headers({ Cookie: cookie });
const genreSlug = `synthetic-${f.runId}`;
function input(overrides: Record<string, unknown> = {}): WorkInput {
  return workInputSchema.parse({
    primaryTitle: `Synthetic catalog ${randomUUID()}`,
    primaryTitleLanguage: "en",
    format: "NOVEL",
    visibility: "PUBLISHED",
    publicationReviewAcknowledged: true,
    releaseStatus: "UNKNOWN",
    source: {
      label: f.sourceLabel,
      citation:
        "Entirely invented integration fixture; not real publisher or production catalog data.",
      url: "https://example.invalid/synthetic-fixtures",
      consultedAt: "2026-01-01T00:00:00.000Z",
    },
    ...overrides,
  });
}
async function create(value: WorkInput) {
  const work = (await createWork(value, headers(admin.cookie))) as AdminWork;
  ownedWorks.add(work.id);
  work.creators.forEach((c) => {
    if (c.id) ownedCreators.add(c.id);
  });
  return work;
}
async function audits(id: string) {
  return sql`select actor_user_id, actor_id_snapshot, operation, previous_revision, new_revision, changes from catalog_audit_events where work_id = ${id} order by new_revision`;
}
function request(
  body: string,
  cookie = admin.cookie,
  origin: string | null = f.origin,
  contentType: string | null = "application/json",
) {
  return new Request(`${f.origin}/api/admin/catalog/works`, {
    method: "POST",
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(origin ? { Origin: origin } : {}),
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body,
  });
}
beforeAll(async () => {
  await f.start();
  admin = await f.account("admin");
  reader = await f.account("user");
  moderator = await f.account("moderator");
});
afterAll(async () => {
  requireTestDatabase();
  // Discover successful writes even if a response assertion failed. Never delete baseline catalog/auth data.
  const rows =
    await sql`select w.id from works w join catalog_sources s on s.id = w.source_id where s.label = ${f.sourceLabel}`;
  rows.forEach((r) => ownedWorks.add(String(r.id)));
  for (const id of ownedWorks) {
    const credits =
      await sql`select creator_id from work_creators where work_id = ${id}`;
    credits.forEach((c) => ownedCreators.add(String(c.creator_id)));
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
  for (const id of ownedCreators)
    await sql`delete from creators where id = ${id} and not exists(select 1 from work_creators where creator_id = ${id})`;
  await sql`delete from genres where slug = ${genreSlug} and not exists(select 1 from work_genres where genre_slug = ${genreSlug})`;
  await sql`delete from catalog_sources where label = ${f.sourceLabel}`;
  await f.stop();
});

describe.sequential(
  "V1 real PostgreSQL catalog (UUID-synthetic, not production metadata)",
  () => {
    it("persists multilingual titles, original/aliases, same-language editions, roles, genres, metadata and UNKNOWN local-cover placeholder", async () => {
      const value = input({
        primaryTitle: `Synthetic ${f.runId}`,
        originalLanguage: "ja",
        country: "JP",
        publicationYear: 2025,
        publicationLabel: "Invented date label",
        titles: [
          { title: "Đường Đêm Synthetic", language: "vi", kind: "PRIMARY" },
          { title: "架空物語", language: "ja", kind: "ORIGINAL" },
          { title: `Đặng Alias ${f.runId}`, language: "vi", kind: "ALIAS" },
        ],
        descriptions: [
          { language: "en", text: "Invented descriptive metadata only" },
          { language: "vi", text: "Mô tả hư cấu" },
        ],
        editions: [
          {
            title: "Synthetic edition A",
            language: "en",
            publisher: "Invented publisher fixture",
          },
          { title: "Synthetic edition B", language: "en" },
          {},
        ],
        creators: [
          { name: "Synthetic equal name", role: "AUTHOR", displayOrder: 0 },
          {
            name: "Synthetic equal name",
            role: "ILLUSTRATOR",
            displayOrder: 1,
          },
          {
            name: "Synthetic translator",
            role: "TRANSLATOR",
            editionIndex: 1,
            displayOrder: 2,
          },
        ],
        genres: [
          {
            slug: genreSlug,
            nameEn: "Invented genre",
            nameVi: "Thể loại hư cấu",
          },
        ],
        cover: { rights: "UNKNOWN", assetPath: "/covers/synthetic.webp" },
      });
      const work = await create(value);
      expect(work.revision).toBe(1);
      const publicWork = await getWorkBySlug(work.slug, "vi");
      expect(publicWork).toMatchObject({
        id: work.id,
        displayTitle: "Đường Đêm Synthetic",
        originalLanguage: "ja",
        country: "JP",
        publicationYear: 2025,
        publicationLabel: "Invented date label",
        source: value.source,
        genres: value.genres,
        descriptions: value.descriptions,
        cover: { rights: "UNKNOWN" },
      });
      expect(publicWork.titles).toEqual(expect.arrayContaining(value.titles));
      expect(publicWork.editions).toHaveLength(3);
      expect(
        publicWork.editions.filter((e) => e.language === "en"),
      ).toHaveLength(2);
      expect(publicWork.creators.map((c) => c.role)).toEqual([
        "AUTHOR",
        "ILLUSTRATOR",
        "TRANSLATOR",
      ]);
      expect(publicWork.creators[0]!.id).not.toBe(publicWork.creators[1]!.id);
      expect(publicWork.creators[2]!.editionId).toBe(
        publicWork.editions.find((e) => e.title === "Synthetic edition B")!.id,
      );
      expect(publicWork.cover).not.toHaveProperty("assetPath");
      for (const key of [
        "visibility",
        "revision",
        "audit",
        "auditEvents",
        "actorUserId",
        "sourceId",
        "searchText",
        "searchVector",
      ])
        expect(publicWork).not.toHaveProperty(key);
      expect(publicWork).not.toHaveProperty("chapterCount");
      expect(publicWork).not.toHaveProperty("volumeCount");
      const persisted =
        await sql`select normalized from work_titles where work_id = ${work.id} and kind = 'ALIAS'`;
      expect(persisted[0]?.normalized).toBe(
        `dang alias ${f.runId.replaceAll("-", " ")}`,
      );
      for (const q of [
        `Đặng Alias ${f.runId}`,
        `đặng alias ${f.runId}`,
        `dang alias ${f.runId}`,
      ]) {
        const page = await listWorks(
          catalogQuerySchema.parse({ q, locale: "vi" }),
        );
        expect(page.items.map((w) => w.id)).toContain(work.id);
      }
      expect(await audits(work.id)).toMatchObject([
        {
          operation: "CREATE",
          previous_revision: null,
          new_revision: 1,
          actor_id_snapshot: admin.id,
        },
      ]);
    });

    it("round-trips absent optional metadata without fabricated counts and exposes only approved local covers", async () => {
      const minimal = await create(input());
      expect(await getWorkBySlug(minimal.slug)).toMatchObject({
        originalLanguage: null,
        country: null,
        publicationYear: null,
        publicationLabel: null,
        editions: [],
        creators: [],
        genres: [],
        cover: null,
      });
      const licensed = await create(
        input({
          cover: {
            rights: "PERMISSION",
            assetPath: "/covers/synthetic-permission.webp",
            credit: "Invented fixture artist",
            rightsStatement: "Synthetic fixture permission, not a real license",
            licenseUrl: "https://example.invalid/invented-permission",
          },
        }),
      );
      expect((await getWorkBySlug(licensed.slug)).cover).toEqual({
        rights: "PERMISSION",
        assetPath: "/covers/synthetic-permission.webp",
        credit: "Invented fixture artist",
        rightsStatement: "Synthetic fixture permission, not a real license",
        licenseUrl: "https://example.invalid/invented-permission",
      });
    });

    it("does not merge equal titles/authors, preserves UUID/slug on retitle, and hides from public detail/search", async () => {
      const title = `Equal synthetic ${randomUUID()}`;
      const a = await create(
        input({
          primaryTitle: title,
          creators: [
            { name: "Equal invented author", role: "AUTHOR", displayOrder: 0 },
          ],
        }),
      );
      const b = await create(
        input({
          primaryTitle: title,
          creators: [
            { name: "Equal invented author", role: "AUTHOR", displayOrder: 0 },
          ],
        }),
      );
      expect(a.id).not.toBe(b.id);
      expect(a.slug).not.toBe(b.slug);
      expect(a.creators[0]!.id).not.toBe(b.creators[0]!.id);
      const found = await listWorks(
        catalogQuerySchema.parse({ q: title, locale: "en" }),
      );
      expect(found.items.map((w) => w.id)).toEqual(
        expect.arrayContaining([a.id, b.id]),
      );
      const renamed = (await updateWork(
        a.id,
        { ...input({ primaryTitle: `Retitled ${randomUUID()}` }), revision: 1 },
        headers(admin.cookie),
      )) as AdminWork;
      expect(renamed).toMatchObject({ id: a.id, slug: a.slug, revision: 2 });
      await setVisibility(
        a.id,
        { revision: 2, visibility: "HIDDEN" },
        headers(admin.cookie),
      );
      await expect(getWorkBySlug(a.slug)).rejects.toMatchObject({
        status: 404,
      });
      expect(
        (
          await listWorks(
            catalogQuerySchema.parse({ q: renamed.primaryTitle, locale: "en" }),
          )
        ).items.map((w) => w.id),
      ).not.toContain(a.id);
      expect(await adminGetWork(a.id, headers(admin.cookie))).toMatchObject({
        visibility: "HIDDEN",
        revision: 3,
      });
      expect(
        (
          await publicGET(
            new Request(`${f.origin}/api/catalog/works/${a.slug}`),
            { params: Promise.resolve({ slug: a.slug }) },
          )
        ).status,
      ).toBe(404);
    });

    it("omits hidden relation targets from public projection but preserves them for authenticated admin detail", async () => {
      const hidden = await create(
        input({
          primaryTitle: `Hidden synthetic target ${randomUUID()}`,
          visibility: "HIDDEN",
        }),
      );
      const visible = await create(
        input({ primaryTitle: `Public synthetic target ${randomUUID()}` }),
      );
      const relationValue = input({
        relations: [
          { toWorkId: hidden.id, type: "SEQUEL_OF" },
          { toWorkId: visible.id, type: "ADAPTATION_OF" },
        ],
      });
      const linking = await create(relationValue);
      const publicWork = await getWorkBySlug(linking.slug);
      expect(publicWork.relations).toEqual([
        {
          toWorkId: visible.id,
          type: "ADAPTATION_OF",
          slug: visible.slug,
          displayTitle: visible.primaryTitle,
          displayTitleLanguage: visible.primaryTitleLanguage,
        },
      ]);
      expect(JSON.stringify(publicWork)).not.toContain(hidden.id);
      expect(JSON.stringify(publicWork)).not.toContain(hidden.slug);
      expect(JSON.stringify(publicWork)).not.toContain(hidden.primaryTitle);
      const response = await adminGET(
        new Request(`${f.origin}/api/admin/catalog/works/${linking.id}`, {
          headers: headers(admin.cookie),
        }),
        { params: Promise.resolve({ id: linking.id }) },
      );
      expect(response.status).toBe(200);
      const full = await response.json();
      expect(full).toMatchObject({
        id: linking.id,
        visibility: "PUBLISHED",
        revision: 1,
      });
      expect(full.relations).toHaveLength(2);
      expect(full.relations).toEqual(
        expect.arrayContaining([
          {
            toWorkId: hidden.id,
            type: "SEQUEL_OF",
            slug: hidden.slug,
            displayTitle: hidden.primaryTitle,
            displayTitleLanguage: hidden.primaryTitleLanguage,
          },
          {
            toWorkId: visible.id,
            type: "ADAPTATION_OF",
            slug: visible.slug,
            displayTitle: visible.primaryTitle,
            displayTitleLanguage: visible.primaryTitleLanguage,
          },
        ]),
      );
      for (const [cookie, status] of [
        ["", 401],
        [reader.cookie, 403],
        [moderator.cookie, 403],
      ] as const) {
        expect(
          (
            await adminGET(
              new Request(`${f.origin}/api/admin/catalog/works/${linking.id}`, {
                headers: headers(cookie),
              }),
              { params: Promise.resolve({ id: linking.id }) },
            )
          ).status,
        ).toBe(status);
      }
    });

    it("rejects invalid source/rights/strict inputs without creating sources, works or audit records", async () => {
      const before =
        await sql`select count(*)::int as n from catalog_sources where label = ${f.sourceLabel}`;
      const value = input();
      for (const invalid of [
        {
          ...value,
          source: { ...value.source, url: "http://localhost/private" },
        },
        {
          ...value,
          cover: { rights: "LICENSED", assetPath: "/covers/synthetic.webp" },
        },
        {
          ...value,
          cover: {
            rights: "UNKNOWN",
            assetPath: "https://example.invalid/remote.jpg",
          },
        },
        { ...value, unexpected: true },
      ]) {
        await expect(
          createWork(invalid, headers(admin.cookie)),
        ).rejects.toMatchObject({ status: 400 });
      }
      expect(
        await sql`select count(*)::int as n from catalog_sources where label = ${f.sourceLabel}`,
      ).toEqual(before);
    });

    it("rolls back the whole aggregate and audit on duplicate external identifier (create and update)", async () => {
      const identifier = {
        namespace: `synthetic-${f.runId}`,
        value: randomUUID(),
      };
      const original = await create(input({ identifiers: [identifier] }));
      const victimValue = input({
        primaryTitle: `Rollback victim ${randomUUID()}`,
      });
      const victim = await create(victimValue);
      const previous = await adminGetWork(victim.id, headers(admin.cookie));
      const history = await audits(victim.id);
      const sourcesBefore =
        await sql`select count(*)::int as n from catalog_sources where label = ${f.sourceLabel}`;
      await expect(
        createWork(input({ identifiers: [identifier] }), headers(admin.cookie)),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        updateWork(
          victim.id,
          {
            ...victimValue,
            primaryTitle: "Must roll back",
            identifiers: [identifier],
            revision: 1,
          },
          headers(admin.cookie),
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(await adminGetWork(victim.id, headers(admin.cookie))).toEqual(
        previous,
      );
      expect(await audits(victim.id)).toEqual(history);
      expect(
        await sql`select count(*)::int as n from catalog_sources where label = ${f.sourceLabel}`,
      ).toEqual(sourcesBefore);
      expect(
        await sql`select work_id from work_identifiers where namespace = ${identifier.namespace} and value = ${identifier.value}`,
      ).toMatchObject([{ work_id: original.id }]);
    });

    it("preserves distinct custom identifier namespaces instead of collapsing punctuation", async () => {
      const value = randomUUID();
      const firstNamespace = `custom-a-${f.runId}`;
      const secondNamespace = `customa${f.runId}`;
      const first = await create(
        input({ identifiers: [{ namespace: firstNamespace, value }] }),
      );
      const second = await create(
        input({ identifiers: [{ namespace: secondNamespace, value }] }),
      );
      expect(first.id).not.toBe(second.id);
      expect(
        await sql`select namespace from work_identifiers where value = ${value} order by namespace`,
      ).toEqual([
        { namespace: firstNamespace },
        { namespace: secondNamespace },
      ]);
    });

    it("retains earlier original titles and aliases in privileged history after edits", async () => {
      const original = input({
        titles: [
          { title: "実験物語", language: "ja", kind: "ORIGINAL" },
          { title: "Synthetic earlier alias", language: "en", kind: "ALIAS" },
        ],
      });
      const work = await create(original);
      const revised = input({
        primaryTitle: original.primaryTitle,
        titles: [{ title: "実験物語・改訂", language: "ja", kind: "ORIGINAL" }],
      });
      await updateWork(
        work.id,
        { ...revised, revision: 1 },
        headers(admin.cookie),
      );
      const history = await audits(work.id);
      expect(history).toHaveLength(2);
      expect(history[0]?.changes).toMatchObject({ titles: original.titles });
      expect(history[1]?.changes).toMatchObject({ titles: revised.titles });
      expect(history[0]?.actor_id_snapshot).toBe(admin.id);
    });

    it("paginates without duplicate works and applies format/genre filters and bounded queries", async () => {
      const marker = `paging-${randomUUID()}`;
      const entries: AdminWork[] = [];
      for (let i = 0; i < 5; i++)
        entries.push(
          await create(
            input({
              primaryTitle: `${marker} entry ${i}`,
              format: i < 2 ? "MANGA" : "NOVEL",
              titles: [
                {
                  title: `${marker} alias ${i}`,
                  language: "en",
                  kind: "ALIAS",
                },
                { title: `${marker} phụ ${i}`, language: "vi", kind: "ALIAS" },
              ],
              genres:
                i < 3
                  ? [
                      {
                        slug: genreSlug,
                        nameEn: "Invented genre",
                        nameVi: "Thể loại hư cấu",
                      },
                    ]
                  : [],
            }),
          ),
        );
      const pages = await Promise.all(
        [1, 2, 3].map((page) =>
          listWorks(catalogQuerySchema.parse({ q: marker, page, pageSize: 2 })),
        ),
      );
      expect(pages.map((p) => p.total)).toEqual([5, 5, 5]);
      expect(pages.map((p) => p.items.length)).toEqual([2, 2, 1]);
      const ids = pages.flatMap((p) => p.items.map((w) => w.id));
      expect(new Set(ids).size).toBe(5);
      expect(new Set(ids)).toEqual(new Set(entries.map((w) => w.id)));
      expect(
        (
          await listWorks(
            catalogQuerySchema.parse({ q: marker, format: "MANGA" }),
          )
        ).total,
      ).toBe(2);
      expect(
        (
          await listWorks(
            catalogQuerySchema.parse({ q: marker, genre: genreSlug }),
          )
        ).total,
      ).toBe(3);
      expect(
        (await listWorks(catalogQuerySchema.parse({ q: "%_" }))).total,
      ).toBe(0);
      await expect(listWorks({ pageSize: 51 })).rejects.toMatchObject({
        status: 400,
      });
      const indexes =
        await sql`select indexname from pg_indexes where tablename = 'works'`;
      expect(indexes.map((r) => r.indexname)).toEqual(
        expect.arrayContaining([
          "works_search_vector_idx",
          "works_search_trigram_idx",
        ]),
      );
    });

    it("serializes concurrent optimistic updates: one revision 2, one 409, exactly one new audit", async () => {
      const value = input();
      const work = await create(value);
      const results = await Promise.allSettled(
        ["A", "B"].map((suffix) =>
          updateWork(
            work.id,
            {
              ...value,
              primaryTitle: `${value.primaryTitle} ${suffix}`,
              revision: 1,
            },
            headers(admin.cookie),
          ),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toMatchObject([
        { reason: { status: 409 } },
      ]);
      expect(await adminGetWork(work.id, headers(admin.cookie))).toMatchObject({
        revision: 2,
        id: work.id,
        slug: work.slug,
      });
      expect((await audits(work.id)).map((a) => a.new_revision)).toEqual([
        1, 2,
      ]);
    });

    it("uses real authorization: anonymous 401, reader/moderator 403, immediate role downgrade", async () => {
      for (const [cookie, status] of [
        ["", 401],
        [reader.cookie, 403],
        [moderator.cookie, 403],
      ] as const) {
        await expect(
          createWork(input(), headers(cookie)),
        ).rejects.toMatchObject({ status });
        expect(
          (await POST(request(JSON.stringify(input()), cookie))).status,
        ).toBe(status);
      }
      requireTestDatabase();
      await sql`update users set role = 'user' where id = ${admin.id} and email = ${admin.email}`;
      try {
        await expect(
          createWork(input(), headers(admin.cookie)),
        ).rejects.toMatchObject({ status: 403 });
        expect((await POST(request(JSON.stringify(input())))).status).toBe(403);
      } finally {
        requireTestDatabase();
        await sql`update users set role = 'admin' where id = ${admin.id} and email = ${admin.email}`;
      }
    });

    it("invokes actual mutation handler with signed cookie: exact Origin, JSON, streaming size and strict schema", async () => {
      const payload = JSON.stringify(input());
      for (const origin of [
        null,
        "https://forged.example.invalid",
        `${f.origin}.attacker.invalid`,
      ])
        expect(
          (await POST(request(payload, admin.cookie, origin))).status,
        ).toBe(403);
      expect(
        (await POST(request(payload, admin.cookie, f.origin, "text/plain")))
          .status,
      ).toBe(415);
      expect((await POST(request(" ".repeat(65537)))).status).toBe(413);
      expect(
        (
          await POST(
            request(JSON.stringify({ ...input(), extra: "forbidden" })),
          )
        ).status,
      ).toBe(400);
      expect((await POST(request("{"))).status).toBe(400);
      const valid = await POST(request(payload));
      expect(valid.status).toBe(200);
      const work = (await valid.json()) as AdminWork;
      ownedWorks.add(work.id);
      expect(await getWorkBySlug(work.slug)).toMatchObject({ id: work.id });
    });

    it("enforces PostgreSQL enum/check/FK/uniqueness constraints, not only Zod", async () => {
      const work = await create(input());
      const [row] =
        await sql`select source_id from works where id = ${work.id}`;
      const sourceId = String(row!.source_id);
      await expect(
        sql`update works set format = 'NOT_A_FORMAT' where id = ${work.id}`,
      ).rejects.toMatchObject({ code: "22P02" });
      await expect(
        sql`update works set revision = 0 where id = ${work.id}`,
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        sql`update works set publication_year = -1 where id = ${work.id}`,
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        sql`update works set source_id = ${randomUUID()} where id = ${work.id}`,
      ).rejects.toMatchObject({ code: "23503" });
      await expect(
        sql`insert into work_titles (work_id, title, language, kind, normalized, source_id) values (${work.id}, 'Synthetic duplicate', 'en', 'PRIMARY', 'synthetic duplicate', ${sourceId})`,
      ).rejects.toMatchObject({ code: "23505" });
      await expect(
        sql`insert into work_covers (work_id, rights, source_id) values (${work.id}, 'LICENSED', ${sourceId})`,
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        sql`insert into work_covers (work_id, asset_path, rights, rights_statement, source_id) values (${work.id}, '/covers/synthetic.webp', 'PERMISSION', 'Synthetic permission evidence', ${sourceId})`,
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        sql`insert into work_creators (work_id, creator_id, role, source_id) values (${work.id}, ${randomUUID()}, 'AUTHOR', ${sourceId})`,
      ).rejects.toMatchObject({ code: "23503" });
      const identified = await create(
        input({
          identifiers: [
            { namespace: `sql-synthetic-${f.runId}`, value: f.runId },
          ],
        }),
      );
      await expect(
        sql`insert into work_identifiers (work_id, namespace, value, source_id) values (${work.id}, ${`sql-synthetic-${f.runId}`}, ${f.runId}, ${sourceId})`,
      ).rejects.toMatchObject({ code: "23505" });
      expect(identified.id).not.toBe(work.id);
      await expect(
        sql`insert into catalog_audit_events (work_id, actor_id_snapshot, operation, previous_revision, new_revision, changes) values (${work.id}, ${admin.id}, 'UPDATE', 1, 2, '{"privatePassword":"forbidden"}'::jsonb)`,
      ).rejects.toMatchObject({ code: "23514" });
      expect(await adminGetWork(work.id, headers(admin.cookie))).toMatchObject({
        revision: 1,
        format: "NOVEL",
      });
      expect(await audits(work.id)).toHaveLength(1);
    });

    it("retains immutable actor snapshots and audit history after deleting only its own authenticated actor", async () => {
      const actor = await f.account("admin");
      const work = (await createWork(
        input(),
        headers(actor.cookie),
      )) as AdminWork;
      ownedWorks.add(work.id);
      const before = await audits(work.id);
      expect(before[0]).toMatchObject({
        actor_user_id: actor.id,
        actor_id_snapshot: actor.id,
      });
      requireTestDatabase();
      await sql`delete from users where id = ${actor.id} and email = ${actor.email}`;
      const after = await audits(work.id);
      expect(after).toEqual(
        before.map((event) => ({ ...event, actor_user_id: null })),
      );
      expect(
        await sql`select id from sessions where user_id = ${actor.id}`,
      ).toHaveLength(0);
      expect(await getWorkBySlug(work.slug)).toMatchObject({ id: work.id });
    });
  },
);
