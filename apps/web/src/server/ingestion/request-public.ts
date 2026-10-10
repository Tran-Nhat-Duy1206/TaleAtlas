import "server-only";
import { z } from "zod";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import {
  workRequests,
  workRequestSupporters,
} from "@taleatlas/database/ingestion";
import { works } from "@taleatlas/database/catalog";
import { getDatabase } from "../database";
import { requireSession, requireRole } from "../session";
import { HttpError, limitCatalogMutation } from "../http";
import {
  getRequest,
  getRequestInTransaction,
  lockRequest,
  appendRequestEvent,
  type RequestTransaction,
} from "./requests";
import {
  normalizeRequestTitle,
  requestPageSchema,
} from "../../features/ingestion/contracts";
import {
  ACTIVE_REQUEST_STATES,
  supportRequestSchema,
  reviewRequestSummarySchema,
  searchRequestSummarySchema,
  type RequestSummary,
} from "../../features/ingestion/support";
export type { RequestSummary } from "../../features/ingestion/support";
export type VisibleStoryRequest =
  | {
      kind: "OWNED";
      request: Awaited<ReturnType<typeof getRequest>>;
      supporterCount: number;
      work: { slug: string } | null;
    }
  | { kind: "FOLLOWED"; request: RequestSummary };
const reviewed = sql<boolean>`${workRequests.publicSummaryVerifiedAt} IS NOT NULL AND ${workRequests.state} NOT IN ('CANCELLED', 'REJECTED')`;
function selection(userId: string) {
  // Keep the outer request ID qualified: single-table Drizzle SELECT projections
  // strip interpolated column qualifiers, which would bind inner supporters.id.
  return {
    id: workRequests.id,
    title: sql<
      string | null
    >`CASE WHEN ${reviewed} THEN ${workRequests.publicTitle} ELSE NULL END`,
    format: sql<
      RequestSummary["format"]
    >`CASE WHEN ${reviewed} THEN ${workRequests.publicFormat} ELSE NULL END`,
    state: workRequests.state,
    revision: workRequests.revision,
    supporterCount: sql<number>`(SELECT count(*)::int FROM ${workRequestSupporters} WHERE ${workRequestSupporters.requestId} = ${sql.raw('"work_requests"."id"')})`,
    following: sql<boolean>`EXISTS (SELECT 1 FROM ${workRequestSupporters} WHERE ${workRequestSupporters.requestId} = ${sql.raw('"work_requests"."id"')} AND ${workRequestSupporters.userId} = ${userId})`,
    slug: sql<
      string | null
    >`(SELECT ${works.slug} FROM ${works} WHERE ${works.id} = ${workRequests.resultingWorkId} AND ${works.visibility} = 'PUBLISHED')`,
  };
}
function summary(
  row: Awaited<ReturnType<typeof selectSummary>>,
): RequestSummary {
  if (!row) throw new HttpError(404, "REQUEST_NOT_FOUND");
  const { slug, ...safe } = row;
  return { ...safe, work: slug ? { slug } : null };
}
async function selectSummary(
  tx: RequestTransaction,
  id: string,
  userId: string,
) {
  const [row] = await tx
    .select(selection(userId))
    .from(workRequests)
    .where(eq(workRequests.id, id));
  return row;
}
export async function visibleStoryRequest(
  requestId: string,
  headers: Headers,
): Promise<VisibleStoryRequest> {
  const session = await requireSession(headers);
  const id = z.uuid().parse(requestId);
  return getDatabase().transaction(
    async (tx) => {
      const [ownership] = await tx
        .select({ owner: workRequests.ownerUserId })
        .from(workRequests)
        .where(eq(workRequests.id, id));
      const safe = summary(await selectSummary(tx, id, session.user.id));
      if (ownership?.owner === session.user.id)
        return {
          kind: "OWNED",
          request: await getRequestInTransaction(tx, id, session.user.id),
          supporterCount: safe.supporterCount,
          work: safe.work,
        };
      if (!safe.following) throw new HttpError(404, "REQUEST_NOT_FOUND");
      return { kind: "FOLLOWED", request: safe };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
async function listSummaries(
  userId: string,
  page: number,
  pageSize: number,
  where: SQL,
) {
  return getDatabase().transaction(
    async (tx) => {
      const [count] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(workRequests)
        .where(where);
      const rows = await tx
        .select(selection(userId))
        .from(workRequests)
        .where(where)
        .orderBy(desc(workRequests.createdAt), desc(workRequests.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      return {
        items: rows.map(summary),
        total: count?.total ?? 0,
        page,
        pageSize,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function myFollowedStoryRequests(
  input: unknown,
  headers: Headers,
) {
  const session = await requireSession(headers);
  const value = requestPageSchema.parse(input);
  return listSummaries(
    session.user.id,
    value.page,
    value.pageSize,
    sql`EXISTS (SELECT 1 FROM ${workRequestSupporters} WHERE ${workRequestSupporters.requestId} = ${sql.raw('"work_requests"."id"')} AND ${workRequestSupporters.userId} = ${session.user.id})`,
  );
}
export async function findRequestSummaries(input: unknown, headers: Headers) {
  const session = await requireSession(headers);
  const value = searchRequestSummarySchema.parse(input);
  const key = normalizeRequestTitle(value.q);
  if (!key) throw new HttpError(400, "VALIDATION_ERROR");
  return listSummaries(
    session.user.id,
    value.page,
    value.pageSize,
    and(reviewed, sql`strpos(${workRequests.publicSearchText}, ${key}) > 0`)!,
  );
}
export async function supportStoryRequest(
  requestId: string,
  input: unknown,
  headers: Headers,
) {
  const session = await requireSession(headers);
  await limitCatalogMutation(session.user.id);
  supportRequestSchema.parse(input);
  const id = z.uuid().parse(requestId);
  return getDatabase().transaction(async (tx) => {
    const row = await lockRequest(tx, id);
    if (row.ownerUserId === session.user.id)
      throw new HttpError(409, "OWNER_CANNOT_SUPPORT");
    if (
      !ACTIVE_REQUEST_STATES.includes(row.state) ||
      !row.publicSummaryVerifiedAt ||
      !row.publicSearchText
    )
      throw new HttpError(404, "REQUEST_NOT_FOUND");
    await tx
      .insert(workRequestSupporters)
      .values({ requestId: id, userId: session.user.id })
      .onConflictDoNothing({
        target: [workRequestSupporters.userId, workRequestSupporters.requestId],
      });
    return summary(await selectSummary(tx, id, session.user.id));
  });
}
export async function unsupportStoryRequest(
  requestId: string,
  headers: Headers,
) {
  const session = await requireSession(headers);
  await limitCatalogMutation(session.user.id);
  const id = z.uuid().parse(requestId);
  // Blind, owner-scoped and idempotent: never expose another request's existence,
  // state or reviewed metadata through an unfollow response.
  await getDatabase()
    .delete(workRequestSupporters)
    .where(
      and(
        eq(workRequestSupporters.requestId, id),
        eq(workRequestSupporters.userId, session.user.id),
      ),
    );
  return { following: false as const };
}
export async function reviewRequestSummary(
  requestId: string,
  input: unknown,
  headers: Headers,
) {
  const session = await requireRole(["admin"], headers);
  await limitCatalogMutation(session.user.id);
  const value = reviewRequestSummarySchema.parse(input);
  const id = z.uuid().parse(requestId);
  const key = [value.title, ...value.alternativeTitles]
    .map(normalizeRequestTitle)
    .join("\n");
  if (key.length > 9000) throw new HttpError(400, "VALIDATION_ERROR");
  return getDatabase().transaction(async (tx) => {
    const previous = await lockRequest(tx, id);
    if (previous.revision !== value.revision)
      throw new HttpError(409, "REVISION_CONFLICT");
    if (!ACTIVE_REQUEST_STATES.includes(previous.state))
      throw new HttpError(409, "SUMMARY_UNAVAILABLE");
    const [row] = await tx
      .update(workRequests)
      .set({
        publicTitle: value.title,
        publicFormat: value.format,
        publicSummaryVerifiedAt: sql`now()`,
        publicSearchText: key,
        revision: previous.revision + 1,
        updatedAt: sql`now()`,
      })
      .where(eq(workRequests.id, id))
      .returning();
    await appendRequestEvent(
      tx,
      row,
      session.user.id,
      "SUMMARY_REVIEWED",
      previous.state,
      {
        reason: value.reason,
        citation: value.sourceUrl,
        requestIdentity: id,
        equivalenceReviewAcknowledged: true,
        humanReviewed: true,
        alternativeTitles: value.alternativeTitles,
        title: value.title,
        format: value.format,
      },
    );
    return summary(await selectSummary(tx, id, session.user.id));
  });
}
