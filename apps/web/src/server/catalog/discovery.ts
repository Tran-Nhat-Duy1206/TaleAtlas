import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  works,
  catalogAuditEvents,
  catalogSources,
} from "@taleatlas/database/catalog";
import { catalogReleases } from "@taleatlas/database/releases";
import { getDatabase } from "../database";
import { requireRole } from "../session";
import { HttpError, limitCatalogMutation } from "../http";
import {
  discoveryQuerySchema,
  releaseQuerySchema,
  releaseInputSchema,
} from "../../features/catalog/discovery";
import { loadWorks } from "./repository";

// Publication history is distinct from draft creation time or book release date.
// Preserve the outer correlation: Drizzle strips Column qualifiers in a
// single-table SELECT expression, otherwise `id` binds to the inner audit row.
// This fixed SQL identifier contains no request input.
const firstPublication =
  sql<Date>`(select min(${catalogAuditEvents.timestamp}) from ${catalogAuditEvents} where ${catalogAuditEvents.workId} = ${sql.raw('"works"."id"')} and ${catalogAuditEvents.changes}->>'visibility' = 'PUBLISHED' and ${catalogAuditEvents.changes}->>'publicationReviewAcknowledged' = 'true')`.mapWith(
    catalogAuditEvents.timestamp,
  );
export async function recentlyAdded(input: unknown) {
  const query = discoveryQuerySchema.parse(input);
  return getDatabase().transaction(
    async (tx) => {
      const where = and(
        eq(works.visibility, "PUBLISHED"),
        sql`${firstPublication} is not null`,
      );
      const [count] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(works)
        .where(where);
      const rows = await tx
        .select({ id: works.id, addedAt: firstPublication })
        .from(works)
        .where(where)
        .orderBy(desc(firstPublication), desc(works.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      const publicWorks = await loadWorks(
        tx,
        rows.map((r) => r.id),
        query.locale,
        false,
      );
      return {
        items: rows.map((row, i) => ({
          work: publicWorks[i],
          addedAt: new Date(row.addedAt).toISOString(),
        })),
        total: count?.count ?? 0,
        page: query.page,
        pageSize: query.pageSize,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function verifiedReleases(input: unknown) {
  const query = releaseQuerySchema.parse(input);
  return getDatabase().transaction(
    async (tx) => {
      const where = and(
        eq(works.visibility, "PUBLISHED"),
        query.from ? gte(catalogReleases.releaseDate, query.from) : undefined,
        query.to ? lte(catalogReleases.releaseDate, query.to) : undefined,
      );
      const [count] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(catalogReleases)
        .innerJoin(works, eq(works.id, catalogReleases.workId))
        .where(where);
      const rows = await tx
        .select({
          id: catalogReleases.id,
          workId: catalogReleases.workId,
          releaseDate: catalogReleases.releaseDate,
          language: catalogReleases.language,
          label: catalogReleases.label,
          verifiedAt: catalogReleases.verifiedAt,
          source: {
            label: catalogSources.label,
            citation: catalogSources.citation,
            url: catalogSources.url,
          },
        })
        .from(catalogReleases)
        .innerJoin(works, eq(works.id, catalogReleases.workId))
        .innerJoin(
          catalogSources,
          eq(catalogSources.id, catalogReleases.sourceId),
        )
        .where(where)
        .orderBy(asc(catalogReleases.releaseDate), asc(catalogReleases.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      const ids = [...new Set(rows.map((r) => r.workId))];
      const publicWorks = await loadWorks(tx, ids, query.locale, false);
      const byId = new Map(publicWorks.map((w) => [w.id, w]));
      return {
        items: rows.map(({ workId, ...row }) => ({
          ...row,
          work: byId.get(workId)!,
          verifiedAt: row.verifiedAt.toISOString(),
        })),
        total: count?.count ?? 0,
        page: query.page,
        pageSize: query.pageSize,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function recordVerifiedRelease(input: unknown, headers: Headers) {
  const session = await requireRole(["admin"], headers);
  await limitCatalogMutation(session.user.id);
  const value = releaseInputSchema.parse(input);
  return getDatabase().transaction(async (tx) => {
    const [work] = await tx
      .select()
      .from(works)
      .where(eq(works.id, value.workId))
      .for("update");
    if (!work || work.visibility !== "PUBLISHED")
      throw new HttpError(404, "WORK_NOT_FOUND");
    if (work.revision !== value.workRevision)
      throw new HttpError(409, "REVISION_CONFLICT");
    const sourceId = randomUUID();
    await tx.insert(catalogSources).values({
      id: sourceId,
      ...value.source,
      consultedAt: value.source.consultedAt
        ? new Date(value.source.consultedAt)
        : null,
    });
    const [release] = await tx
      .insert(catalogReleases)
      .values({
        workId: work.id,
        releaseDate: value.releaseDate,
        language: value.language,
        label: value.label,
        sourceId,
        actorUserId: session.user.id,
        actorSnapshot: session.user.id,
        reviewedWorkRevision: work.revision,
      })
      .returning({
        id: catalogReleases.id,
        releaseDate: catalogReleases.releaseDate,
      });
    // The immutable release row carries the actor, reviewed revision and source.
    // Do not bump the bibliographic Work revision for an independent release fact.
    return release;
  });
}
