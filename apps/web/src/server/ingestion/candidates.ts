import "server-only";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  ingestionCandidates,
  workRequests,
  works,
  workTitles,
  workIdentifiers,
  workCreators,
  creators,
  editions,
} from "@taleatlas/database";
import {
  NormalizedCandidateSchema,
  IdentityMatchSchema,
  PROVIDER_IDENTITY_NAMESPACES,
  normalizeIdentityIdentifier,
  identityMatch,
  type NormalizedCandidate,
  type IdentityWork,
} from "../../features/ingestion/pipeline";
import { requestDetailsSchema } from "../../features/ingestion/contracts";
import { requireRole } from "../session";
import { getDatabase } from "../database";
import type { DbTx } from "./jobs";

export const adminIngestionPageSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(20).default(20),
  requestId: z.uuid().optional(),
});

/** Bounded retrieval only; matching never creates or merges a Work. */
export async function retrieveIdentityWorks(
  tx: DbTx,
  candidate: NormalizedCandidate,
): Promise<IdentityWork[]> {
  const titles = candidate.lookupTitles;
  const identifiers = [
    ...(candidate.identifiers?.value ?? []),
    ...(candidate.editions?.value.flatMap((e) => e.identifiers ?? []) ?? []),
  ].flatMap((i) => {
    const key = normalizeIdentityIdentifier(i);
    return key ? [key] : [];
  });
  const record = candidate.providerRecord;
  const namespace = record
    ? PROVIDER_IDENTITY_NAMESPACES[record.providerId]
    : undefined;
  const providerIds =
    record && namespace ? [{ namespace, value: record.sourceRecordId }] : [];
  const keys = [...identifiers, ...providerIds];
  const isbns = [
    ...new Set(
      identifiers
        .filter((i) => i.namespace === "isbn10" || i.namespace === "isbn13")
        .map((i) => i.value),
    ),
  ];
  if (!titles.length && !keys.length) return [];
  // searchText is the catalog's Unicode-normalized aggregate. This is bounded
  // retrieval, not a title identity decision: the pure matcher rejects extra hits.
  const searchTitles = titles.map(
    (t) =>
      sql`${works.searchText} like ${`%${t.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`}`,
  );
  const exactKeys = keys.length
    ? sql`exists (select 1 from ${workIdentifiers} where ${workIdentifiers.workId} = ${sql.raw('"works"."id"')} and ${or(...keys.map((k) => and(eq(workIdentifiers.namespace, k.namespace), eq(workIdentifiers.value, k.value))))})`
    : undefined;
  const exactEditions = isbns.length
    ? sql`exists (select 1 from ${editions} where ${editions.workId} = ${sql.raw('"works"."id"')} and ${inArray(editions.isbn, isbns)})`
    : undefined;
  const exactEvidence = or(exactKeys, exactEditions);
  const rows = await tx
    .select()
    .from(works)
    .where(
      or(
        ...searchTitles,
        titles.length
          ? sql`exists (select 1 from ${workTitles} where ${workTitles.workId} = ${sql.raw('"works"."id"')} and ${inArray(workTitles.normalized, titles)})`
          : undefined,
        exactEvidence,
      ),
    )
    .orderBy(
      sql`case when ${exactEvidence ?? sql`false`} then 0 else 1 end`,
      works.id,
    )
    .limit(20);
  if (!rows.length) return [];
  const ids = rows.map((w) => w.id);
  const aliases = await tx
    .select()
    .from(workTitles)
    .where(inArray(workTitles.workId, ids))
    .orderBy(workTitles.id)
    .limit(2000);
  const credits = await tx
    .select({
      workId: workCreators.workId,
      name: creators.name,
      role: workCreators.role,
    })
    .from(workCreators)
    .innerJoin(creators, eq(creators.id, workCreators.creatorId))
    .where(inArray(workCreators.workId, ids))
    .orderBy(workCreators.id)
    .limit(2000);
  const matchingKey = keys.length
    ? or(
        ...keys.map((k) =>
          and(
            eq(workIdentifiers.namespace, k.namespace),
            eq(workIdentifiers.value, k.value),
          ),
        ),
      )
    : undefined;
  const knownIds = await tx
    .select()
    .from(workIdentifiers)
    .where(inArray(workIdentifiers.workId, ids))
    .orderBy(
      sql`case when ${matchingKey ?? sql`false`} then 0 else 1 end`,
      workIdentifiers.id,
    )
    .limit(2000);
  const knownEditions = await tx
    .select({ workId: editions.workId, isbn: editions.isbn })
    .from(editions)
    .where(inArray(editions.workId, ids))
    .orderBy(
      sql`case when ${isbns.length ? inArray(editions.isbn, isbns) : sql`false`} then 0 else 1 end`,
      editions.id,
    )
    .limit(2000);
  return rows.map((w) => ({
    id: w.id,
    format: w.format,
    titles: [
      { title: w.primaryTitle },
      ...aliases
        .filter((t) => t.workId === w.id)
        .map((t) => ({ title: t.title })),
    ].slice(0, 100),
    creators: credits
      .filter((c) => c.workId === w.id)
      .map((c) => ({ name: c.name, role: c.role }))
      .slice(0, 100),
    identifiers: [
      ...knownEditions
        .filter((e) => e.workId === w.id && e.isbn)
        .map((e) => ({
          namespace: e.isbn!.length === 13 ? "isbn13" : "isbn10",
          value: e.isbn!,
        })),
      ...knownIds
        .filter((i) => i.workId === w.id)
        .map((i) => ({ namespace: i.namespace, value: i.value })),
    ]
      .filter((i) => i.namespace.length <= 200 && i.value.length <= 200)
      .sort(
        (a, b) =>
          Number(
            keys.some(
              (k) => k.namespace === b.namespace && k.value === b.value,
            ),
          ) -
          Number(
            keys.some(
              (k) => k.namespace === a.namespace && k.value === a.value,
            ),
          ),
      )
      .slice(0, 100),
    providerSourceIds: knownIds
      .filter((i) => i.workId === w.id)
      .flatMap((i) => {
        const providerId = (
          Object.keys(
            PROVIDER_IDENTITY_NAMESPACES,
          ) as (keyof typeof PROVIDER_IDENTITY_NAMESPACES)[]
        ).find((id) => PROVIDER_IDENTITY_NAMESPACES[id] === i.namespace);
        return providerId && i.value.length <= 200
          ? [{ providerId, sourceRecordId: i.value }]
          : [];
      })
      .slice(0, 100),
  }));
}

export async function persistCandidate(
  tx: DbTx,
  requestId: string,
  inputRevision: number,
  jobId: string,
  value: NormalizedCandidate,
) {
  const candidate = NormalizedCandidateSchema.parse(value);
  const matches = {
    items: identityMatch(candidate, await retrieveIdentityWorks(tx, candidate)),
  };
  if (Buffer.byteLength(JSON.stringify(matches), "utf8") > 32768)
    throw new Error("MATCH_SNAPSHOT_TOO_LARGE");
  await tx
    .insert(ingestionCandidates)
    .values({ requestId, inputRevision, jobId, candidate, matches })
    .onConflictDoNothing({
      target: [
        ingestionCandidates.requestId,
        ingestionCandidates.inputRevision,
      ],
    });
}

export async function adminIngestion(input: unknown, headers: Headers) {
  await requireRole(["admin"], headers);
  const value = adminIngestionPageSchema.parse(input);
  const rows = await getDatabase()
    .select({ request: workRequests, snapshot: ingestionCandidates })
    .from(workRequests)
    .leftJoin(
      ingestionCandidates,
      and(
        eq(ingestionCandidates.requestId, workRequests.id),
        eq(ingestionCandidates.inputRevision, workRequests.inputRevision),
      ),
    )
    .where(value.requestId ? eq(workRequests.id, value.requestId) : undefined)
    .orderBy(desc(workRequests.createdAt), workRequests.id)
    .limit(value.pageSize + 1)
    .offset((value.page - 1) * value.pageSize);
  return {
    items: rows.slice(0, value.pageSize).map(({ request: r, snapshot: s }) => ({
      request: {
        id: r.id,
        state: r.state,
        revision: r.revision,
        inputRevision: r.inputRevision,
        details: requestDetailsSchema.parse(r.details),
      },
      candidateId: s?.id ?? null,
      candidate: s ? NormalizedCandidateSchema.parse(s.candidate) : null,
      matches: z
        .array(IdentityMatchSchema)
        .max(20)
        .parse(s?.matches.items ?? []),
    })),
    page: value.page,
    hasMore: rows.length > value.pageSize,
  };
}
