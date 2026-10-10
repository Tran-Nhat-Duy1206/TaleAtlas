import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  works,
  catalogSources,
  workTitles,
  workDescriptions,
  editions,
  creators,
  workCreators,
  genres,
  workGenres,
  workCovers,
  workIdentifiers,
  workRelations,
  catalogAuditEvents,
} from "@taleatlas/database/catalog";
import { getDatabase } from "../database";
import {
  normalizeTitle,
  type WorkInput,
  type ParsedCatalogQuery,
} from "../../features/catalog/contracts";
import { CatalogError } from "./errors";
import { projectWork, selectDisplayTitle } from "./projection";
import {
  retainAssertion,
  addFieldAssertions,
  recordFieldAssertions,
  workEvidenceFields,
  editionEvidenceFields,
  coverEvidenceFields,
  type FieldAssertions,
} from "./provenance";
import type {
  CatalogPage,
  AggregateWork,
  AdminWork,
} from "../../features/catalog/contracts";
type DB = ReturnType<typeof getDatabase>;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Executor = DB | Tx;
export async function loadWork(
  db: Executor,
  id: string,
  locale: string,
  admin = false,
) {
  return (await loadWorks(db, [id], locale, admin))[0];
}
export async function loadWorks(
  db: Executor,
  ids: string[],
  locale: string,
  admin = false,
) {
  if (!ids.length) return [];
  const workRows = await db
    .select()
    .from(works)
    .where(
      and(
        inArray(works.id, ids),
        admin ? undefined : eq(works.visibility, "PUBLISHED"),
      ),
    );
  if (workRows.length !== ids.length) throw new CatalogError(404, "NOT_FOUND");
  const [
    sources,
    titles,
    descriptions,
    editionRows,
    creatorRows,
    genreRows,
    covers,
    identifiers,
    relations,
  ] = await Promise.all([
    db
      .select()
      .from(catalogSources)
      .where(
        inArray(
          catalogSources.id,
          workRows.map((w) => w.sourceId),
        ),
      ),
    db.select().from(workTitles).where(inArray(workTitles.workId, ids)),
    db
      .select()
      .from(workDescriptions)
      .where(inArray(workDescriptions.workId, ids)),
    db.select().from(editions).where(inArray(editions.workId, ids)),
    db
      .select({
        workId: workCreators.workId,
        id: creators.id,
        name: creators.name,
        role: workCreators.role,
        editionId: workCreators.editionId,
        displayOrder: workCreators.displayOrder,
      })
      .from(workCreators)
      .innerJoin(creators, eq(creators.id, workCreators.creatorId))
      .where(inArray(workCreators.workId, ids))
      .orderBy(workCreators.displayOrder, workCreators.id),
    db
      .select({
        workId: workGenres.workId,
        slug: genres.slug,
        nameEn: genres.nameEn,
        nameVi: genres.nameVi,
      })
      .from(workGenres)
      .innerJoin(genres, eq(genres.slug, workGenres.genreSlug))
      .where(inArray(workGenres.workId, ids)),
    db.select().from(workCovers).where(inArray(workCovers.workId, ids)),
    db
      .select()
      .from(workIdentifiers)
      .where(inArray(workIdentifiers.workId, ids)),
    db
      .select({
        workId: workRelations.fromWorkId,
        toWorkId: workRelations.toWorkId,
        type: workRelations.type,
        slug: works.slug,
        primaryTitle: works.primaryTitle,
        primaryTitleLanguage: works.primaryTitleLanguage,
        originalLanguage: works.originalLanguage,
        // Same-statement visibility and title snapshot: a concurrent private
        // edit cannot enter a second unqualified title read after this filter.
        titles: sql<
          WorkInput["titles"]
        >`coalesce((select jsonb_agg(jsonb_build_object(
          'title', ${workTitles.title}, 'language', ${workTitles.language}, 'kind', ${workTitles.kind}
        )) from ${workTitles} where ${workTitles.workId} = ${works.id}), '[]'::jsonb)`,
      })
      .from(workRelations)
      .innerJoin(works, eq(works.id, workRelations.toWorkId))
      .where(
        and(
          inArray(workRelations.fromWorkId, ids),
          admin ? undefined : eq(works.visibility, "PUBLISHED"),
        ),
      ),
  ]);
  // Reuse the exact card/detail policy over the visibility-qualified statement
  // snapshot, without multiplying relation rows or loading private targets later.
  const localizedRelations = relations.map((r) => ({
    ...r,
    ...selectDisplayTitle(r, locale),
  }));
  return ids.map((id) => {
    const work = workRows.find((w) => w.id === id)!;
    const source = sources.find((s) => s.id === work.sourceId);
    if (!source) throw new CatalogError(503, "UNAVAILABLE");
    const children = <T extends { workId: string }>(rows: T[]) =>
      rows.filter((r) => r.workId === id);
    return projectWork(
      {
        work,
        source,
        titles: children(titles),
        descriptions: children(descriptions),
        editions: children(editionRows),
        creators: children(creatorRows),
        genres: children(genreRows),
        cover: covers.find((c) => c.workId === id) ?? null,
        identifiers: children(identifiers),
        relations: children(localizedRelations),
      },
      locale,
      admin,
    );
  });
}
export async function findWorkBySlug(slug: string, locale: string) {
  return getDatabase().transaction(
    async (tx) => {
      const [w] = await tx
        .select({ id: works.id })
        .from(works)
        .where(and(eq(works.slug, slug), eq(works.visibility, "PUBLISHED")));
      if (!w) throw new CatalogError(404, "NOT_FOUND");
      return loadWork(tx, w.id, locale);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function searchWorks(
  query: ParsedCatalogQuery,
  admin: boolean,
): Promise<CatalogPage<AggregateWork | AdminWork>> {
  const normalized = normalizeTitle(query.q);
  if (query.q && !normalized)
    return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
  const db = getDatabase();
  if (admin) return searchWorksWithExecutor(db, query, admin, normalized);
  // Visibility qualification and every child read share one public snapshot.
  return db.transaction(
    (tx) => searchWorksWithExecutor(tx, query, admin, normalized),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
async function searchWorksWithExecutor(
  db: Executor,
  query: ParsedCatalogQuery,
  admin: boolean,
  normalized: string,
): Promise<CatalogPage<AggregateWork | AdminWork>> {
  const escaped = normalized.replace(/[\\%_]/g, "\\$&");
  const exact = sql`exists(select 1 from ${workTitles} where ${workTitles.workId}=${works.id} and ${workTitles.normalized}=${normalized})`;
  const fts = sql`${works.searchVector} @@ plainto_tsquery('simple', ${normalized})`;
  const fuzzy =
    normalized.length < 3
      ? sql`(${works.searchText} ilike ${escaped + "%"} escape '\\' or exists(select 1 from ${workTitles} where ${workTitles.workId}=${works.id} and ${workTitles.normalized} ilike ${escaped + "%"} escape '\\'))`
      : sql`(${works.searchText} ilike ${"%" + escaped + "%"} escape '\\' or ${works.searchText} % ${normalized})`;
  const where = and(
    admin ? undefined : eq(works.visibility, "PUBLISHED"),
    query.format ? eq(works.format, query.format) : undefined,
    query.genre
      ? sql`exists(select 1 from ${workGenres} where ${workGenres.workId}=${works.id} and ${workGenres.genreSlug}=${query.genre})`
      : undefined,
    normalized ? sql`(${exact} or ${fts} or ${fuzzy})` : undefined,
  );
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(works)
    .where(where);
  const rows = await db
    .select({ id: works.id })
    .from(works)
    .where(where)
    .orderBy(
      normalized
        ? sql`case when ${exact} then 3 when ${fts} then 2 else 1 end desc`
        : sql`${works.id}`,
      works.id,
    )
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
  const items = await loadWorks(
    db,
    rows.map((w) => w.id),
    query.locale,
    admin,
  );
  return {
    items,
    total: total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}
function identifier(namespace: string, value: string) {
  // Contracts canonicalize only known provider aliases; custom namespaces stay distinct.
  const n = namespace;
  return {
    namespace: n,
    value:
      n === "openlibrary" || n === "wikidata"
        ? value.toUpperCase()
        : n === "mangadex"
          ? value.toLowerCase()
          : value,
  };
}
async function replaceChildren(
  tx: Tx,
  id: string,
  input: WorkInput,
  sourceId: string,
  revision: number,
  previousWork?: typeof works.$inferSelect,
) {
  const [
    existing,
    priorTitles,
    priorDescriptions,
    priorGenres,
    priorCovers,
    priorIdentifiers,
    priorRelations,
    priorCredits,
  ] = await Promise.all([
    tx.select().from(editions).where(eq(editions.workId, id)),
    tx
      .select()
      .from(workTitles)
      .where(eq(workTitles.workId, id))
      .orderBy(workTitles.id),
    tx.select().from(workDescriptions).where(eq(workDescriptions.workId, id)),
    tx.select().from(workGenres).where(eq(workGenres.workId, id)),
    tx.select().from(workCovers).where(eq(workCovers.workId, id)),
    tx.select().from(workIdentifiers).where(eq(workIdentifiers.workId, id)),
    tx.select().from(workRelations).where(eq(workRelations.fromWorkId, id)),
    tx
      .select({
        id: workCreators.id,
        creatorId: workCreators.creatorId,
        name: creators.name,
        role: workCreators.role,
        editionId: workCreators.editionId,
        sourceId: workCreators.sourceId,
      })
      .from(workCreators)
      .innerJoin(creators, eq(creators.id, workCreators.creatorId))
      .where(eq(workCreators.workId, id))
      .orderBy(workCreators.id),
  ]);
  const previousEvidence: FieldAssertions = new Map();
  const nextEvidence: FieldAssertions = new Map();
  if (previousWork)
    addFieldAssertions(
      previousEvidence,
      "work",
      previousWork,
      workEvidenceFields,
      previousWork.sourceId,
    );
  addFieldAssertions(nextEvidence, "work", input, workEvidenceFields, sourceId);
  for (const e of existing)
    addFieldAssertions(
      previousEvidence,
      `edition.${e.id}`,
      e,
      editionEvidenceFields,
      e.sourceId,
    );
  for (const c of priorCovers)
    addFieldAssertions(
      previousEvidence,
      "cover",
      c,
      coverEvidenceFields,
      c.sourceId,
    );
  const allowed = new Set(existing.map((e) => e.id));
  if (input.editions.some((e) => e.id && !allowed.has(e.id)))
    throw new CatalogError(400, "INVALID_EDITION");
  // Detach edition credits before removing editions; all mutations remain in one transaction.
  await tx.delete(workCreators).where(eq(workCreators.workId, id));
  for (const table of [
    workTitles,
    workDescriptions,
    workGenres,
    workCovers,
    workIdentifiers,
  ])
    await tx.delete(table).where(eq(table.workId, id));
  await tx.delete(workRelations).where(eq(workRelations.fromWorkId, id));
  const ids = input.editions.map((e) => e.id ?? randomUUID());
  const removed = existing.filter((e) => !ids.includes(e.id)).map((e) => e.id);
  if (removed.length)
    await tx.delete(editions).where(inArray(editions.id, removed));
  for (const [index, e] of input.editions.entries()) {
    const row = {
      id: ids[index],
      workId: id,
      sourceId,
      title: e.title ?? null,
      language: e.language ?? null,
      publisher: e.publisher ?? null,
      format: e.format ?? null,
      publicationYear: e.publicationYear ?? null,
      publicationLabel: e.publicationLabel ?? null,
      isbn: e.isbn?.replace(/[ -]/g, "").toUpperCase() ?? null,
    };
    const old = e.id ? existing.find((r) => r.id === e.id) : undefined;
    if (old && editionEvidenceFields.every((key) => old[key] === row[key]))
      row.sourceId = old.sourceId;
    addFieldAssertions(
      nextEvidence,
      `edition.${row.id}`,
      row,
      editionEvidenceFields,
      sourceId,
    );
    if (e.id) await tx.update(editions).set(row).where(eq(editions.id, e.id));
    else await tx.insert(editions).values(row);
  }
  const titles = [
    {
      title: input.primaryTitle,
      language: input.primaryTitleLanguage,
      kind: "PRIMARY" as const,
    },
    ...input.titles.filter(
      (t) =>
        !(
          t.title === input.primaryTitle &&
          t.language === input.primaryTitleLanguage &&
          t.kind === "PRIMARY"
        ),
    ),
  ];
  await tx.insert(workTitles).values(
    titles.map((t) => {
      const old = retainAssertion(priorTitles, t);
      return {
        ...t,
        ...(old ? { id: old.id } : {}),
        workId: id,
        normalized: normalizeTitle(t.title),
        sourceId: old?.sourceId ?? sourceId,
      };
    }),
  );
  if (input.descriptions.length)
    await tx.insert(workDescriptions).values(
      input.descriptions.map((d) => ({
        ...d,
        workId: id,
        sourceId: retainAssertion(priorDescriptions, d)?.sourceId ?? sourceId,
      })),
    );
  for (const c of input.creators) {
    const editionId =
      c.editionIndex !== undefined
        ? ids[c.editionIndex]
        : (c.editionId ?? null);
    const oldCredit = retainAssertion(priorCredits, {
      name: c.name,
      role: c.role,
      editionId,
      ...(c.id ? { creatorId: c.id } : {}),
    });
    // Reuse only this work's exact prior credit; equal names never merge across works.
    let creatorId = c.id ?? oldCredit?.creatorId;
    if (creatorId) {
      const [row] = await tx
        .select()
        .from(creators)
        .where(eq(creators.id, creatorId));
      if (!row || row.name !== c.name)
        throw new CatalogError(400, "INVALID_CREATOR");
    } else {
      creatorId = randomUUID();
      await tx.insert(creators).values({ id: creatorId, name: c.name });
    }
    await tx.insert(workCreators).values({
      ...(oldCredit ? { id: oldCredit.id } : {}),
      workId: id,
      creatorId,
      role: c.role,
      editionId,
      displayOrder: c.displayOrder,
      sourceId: oldCredit?.sourceId ?? sourceId,
    });
  }
  for (const g of input.genres) {
    await tx.insert(genres).values(g).onConflictDoNothing();
    const [row] = await tx.select().from(genres).where(eq(genres.slug, g.slug));
    if (!row || row.nameEn !== g.nameEn || row.nameVi !== g.nameVi)
      throw new CatalogError(409, "GENRE_CONFLICT");
    await tx.insert(workGenres).values({
      workId: id,
      genreSlug: g.slug,
      sourceId:
        retainAssertion(priorGenres, { genreSlug: g.slug })?.sourceId ??
        sourceId,
    });
  }
  if (input.cover) {
    const coverValues = Object.fromEntries(
      coverEvidenceFields.map((key) => [key, input.cover![key] ?? null]),
    );
    const old = retainAssertion(priorCovers, coverValues);
    await tx.insert(workCovers).values({
      ...input.cover,
      workId: id,
      sourceId: old?.sourceId ?? sourceId,
    });
    addFieldAssertions(
      nextEvidence,
      "cover",
      coverValues,
      coverEvidenceFields,
      sourceId,
    );
  }
  if (input.identifiers.length)
    await tx.insert(workIdentifiers).values(
      input.identifiers.map((i) => {
        const value = identifier(i.namespace, i.value);
        const old = retainAssertion(priorIdentifiers, value);
        return {
          ...value,
          ...(old ? { id: old.id } : {}),
          workId: id,
          sourceId: old?.sourceId ?? sourceId,
        };
      }),
    );
  for (const r of input.relations) {
    if (r.toWorkId === id) throw new CatalogError(400, "INVALID_RELATION");
    const [target] = await tx
      .select({ id: works.id })
      .from(works)
      .where(eq(works.id, r.toWorkId));
    if (!target) throw new CatalogError(400, "INVALID_RELATION");
    await tx.insert(workRelations).values({
      ...r,
      fromWorkId: id,
      sourceId: retainAssertion(priorRelations, r)?.sourceId ?? sourceId,
    });
  }
  const searchText = normalizeTitle(
    [
      input.primaryTitle,
      ...input.titles.map((t) => t.title),
      ...input.descriptions.map((d) => d.text),
      ...input.creators.map((c) => c.name),
      ...input.genres.flatMap((g) => [g.nameEn, g.nameVi]),
    ].join(" "),
  );
  await tx.update(works).set({ searchText }).where(eq(works.id, id));
  await recordFieldAssertions(
    tx,
    id,
    revision,
    previousEvidence,
    nextEvidence,
    sourceId,
  );
}
function fields(input: WorkInput) {
  return {
    primaryTitle: input.primaryTitle,
    primaryTitleLanguage: input.primaryTitleLanguage,
    format: input.format,
    visibility: input.visibility,
    releaseStatus: input.releaseStatus,
    originalLanguage: input.originalLanguage ?? null,
    country: input.country ?? null,
    publicationYear: input.publicationYear ?? null,
    publicationLabel: input.publicationLabel ?? null,
  };
}
export async function saveWork(
  input: WorkInput,
  actor: string,
  id?: string,
  revision?: number,
) {
  if (
    input.visibility === "PUBLISHED" &&
    input.publicationReviewAcknowledged !== true
  )
    throw new CatalogError(400, "VALIDATION_ERROR");
  return getDatabase().transaction((tx) =>
    saveWorkInTransaction(tx, input, actor, id, revision),
  );
}
export async function saveWorkInTransaction(
  tx: Tx,
  input: WorkInput,
  actor: string,
  id?: string,
  revision?: number,
) {
  if (
    input.visibility === "PUBLISHED" &&
    input.publicationReviewAcknowledged !== true
  )
    throw new CatalogError(400, "VALIDATION_ERROR");
  let previousVisibility: WorkInput["visibility"] | undefined;
  let previousRevision: number | null = null;
  let previousWork: typeof works.$inferSelect | undefined;
  if (id) {
    const [current] = await tx
      .select()
      .from(works)
      .where(eq(works.id, id))
      .for("update");
    if (!current) throw new CatalogError(404, "NOT_FOUND");
    if (current.revision !== revision) throw new CatalogError(409, "CONFLICT");
    previousRevision = current.revision;
    previousVisibility = current.visibility;
    previousWork = current;
  }
  const workId = id ?? randomUUID();
  const sourceId = randomUUID();
  await tx.insert(catalogSources).values({
    ...input.source,
    consultedAt: input.source.consultedAt
      ? new Date(input.source.consultedAt)
      : null,
    id: sourceId,
  });
  const newRevision = (previousRevision ?? 0) + 1;
  if (id)
    await tx
      .update(works)
      .set({
        ...fields(input),
        sourceId,
        revision: newRevision,
        updatedAt: new Date(),
      })
      .where(eq(works.id, id));
  else {
    const base =
      normalizeTitle(input.primaryTitle)
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 100)
        .replace(/^-|-$/g, "") || "work";
    await tx.insert(works).values({
      ...fields(input),
      id: workId,
      slug: `${base}-${workId}`,
      sourceId,
      revision: newRevision,
      searchText: normalizeTitle(input.primaryTitle) || "work",
    });
  }
  await replaceChildren(tx, workId, input, sourceId, newRevision, previousWork);
  await tx.insert(catalogAuditEvents).values({
    workId,
    actorUserId: actor,
    actorIdSnapshot: actor,
    operation: !id
      ? "CREATE"
      : input.visibility === "HIDDEN" && previousVisibility !== "HIDDEN"
        ? "HIDE"
        : previousVisibility === "HIDDEN" && input.visibility !== "HIDDEN"
          ? "RESTORE"
          : "UPDATE",
    previousRevision,
    newRevision,
    changes: {
      ...fields(input),
      sourceId,
      ...(input.visibility === "PUBLISHED"
        ? { publicationReviewAcknowledged: true }
        : {}),
      // Retain the asserted metadata, not only counts: later edits must not erase
      // earlier original titles/aliases/credits from the privileged history.
      titles: input.titles,
      descriptions: input.descriptions,
      editions: input.editions,
      creators: input.creators,
      genres: input.genres,
      cover: input.cover ?? null,
      identifiers: input.identifiers,
      relations: input.relations,
    },
  });
  return loadWork(tx, workId, "en", true);
}
export async function changeVisibility(
  id: string,
  revision: number,
  visibility: WorkInput["visibility"],
  actor: string,
  publicationReviewAcknowledged?: boolean,
) {
  if (visibility === "PUBLISHED" && publicationReviewAcknowledged !== true)
    throw new CatalogError(400, "VALIDATION_ERROR");
  return getDatabase().transaction(async (tx) => {
    const [w] = await tx
      .select()
      .from(works)
      .where(eq(works.id, id))
      .for("update");
    if (!w) throw new CatalogError(404, "NOT_FOUND");
    if (w.revision !== revision) throw new CatalogError(409, "CONFLICT");
    await tx
      .update(works)
      .set({ visibility, revision: revision + 1, updatedAt: new Date() })
      .where(eq(works.id, id));
    await tx.insert(catalogAuditEvents).values({
      workId: id,
      actorUserId: actor,
      actorIdSnapshot: actor,
      operation:
        visibility === "HIDDEN"
          ? "HIDE"
          : w.visibility === "HIDDEN"
            ? "RESTORE"
            : "UPDATE",
      previousRevision: revision,
      newRevision: revision + 1,
      changes: {
        visibility,
        ...(visibility === "PUBLISHED"
          ? { publicationReviewAcknowledged: true }
          : {}),
      },
    });
    return loadWork(tx, id, "en", true);
  });
}
