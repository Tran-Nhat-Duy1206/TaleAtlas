import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { user, session as sessions } from "@taleatlas/database/schema";
import { works } from "@taleatlas/database/catalog";
import {
  communityContents,
  communityContentEvents,
  communityReports,
  communityModerationActions,
  communityMutationReceipts,
} from "@taleatlas/database/community";
import {
  COMMUNITY_LIMITS as L,
  type CommunityContentKind,
  type CommunityCommandKind,
} from "@taleatlas/database/community-types";
import { getDatabase, getDatabaseConnection } from "../database";
import {
  requireSession,
  AuthorizationError,
  AuthenticationUnavailableError,
} from "../session";
import { getAuthEnv } from "../env";
import { HttpError, limitCatalogMutation, requireTrustedOrigin } from "../http";
import { logServerError } from "../logger";
import { requireCommunityEnabled } from "./gate";
import {
  canonicalCommunityCommand,
  communityUuidSchema,
  communityThreadCreateSchema,
  communityReplyCreateSchema,
  communityReviewCreateSchema,
  communityEditSchema,
  communityDeleteSchema,
  communityReportSchema,
  communityModerationSchema,
  communityRevealSchema,
  communityQuerySchema,
  communityOwnedQuerySchema,
  communityOwnedDetailQuerySchema,
  type CommunityCommand,
} from "../../features/community/contracts";
import {
  projectCommunityContent,
  projectCommunityReveal,
  CommunityRevealConflict,
  type CommunityOwnedDTO,
} from "../../features/community/projection";

import { validatedCommunityResponse } from "../../features/community/http-contracts";
import {
  reviewOwnedSchema,
  reviewOwnedContextQuerySchema,
  reviewListResponseSchema,
  reviewStatisticsFromAggregate,
  type ReviewOwnedDTO,
} from "../../features/community/review-http-contracts";

type Tx = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];
type Content = typeof communityContents.$inferSelect;
type Principal = Awaited<ReturnType<typeof requireSession>>;
type Input = unknown | (() => Promise<unknown>);
type Bucket = "post" | "report" | "safety";
const moderatorRoles = ["moderator", "admin"] as const;
const scope = (c: Content) => ({
  contentId: c.id,
  workId: c.workId,
  targetKind: c.kind,
});
const missing = () => new HttpError(404, "COMMUNITY_NOT_FOUND");
async function safe<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof HttpError ||
      error instanceof z.ZodError ||
      error instanceof AuthorizationError ||
      error instanceof AuthenticationUnavailableError
    )
      throw error;
    if (error instanceof CommunityRevealConflict)
      throw new HttpError(409, "STALE_REVISION");
    const code =
      (error as { cause?: { code?: string }; code?: string })?.cause?.code ??
      (error as { code?: string })?.code;
    if (["23505", "40001", "40P01"].includes(code ?? ""))
      throw new HttpError(409, "CONFLICT");
    logServerError("community.service", error);
    throw new HttpError(503, "SERVICE_UNAVAILABLE");
  }
}
async function verified(
  headers: Headers,
  moderation = false,
): Promise<Principal> {
  requireCommunityEnabled();
  const principal = await requireSession(headers);
  if (!principal.user.emailVerified) throw new AuthorizationError(403);
  if (
    moderation &&
    !moderatorRoles.some((role) => role === principal.user.role)
  )
    throw new AuthorizationError(403);
  return principal;
}
// Additional atomic DB-clock buckets never replace/reset the frozen shared30/min.
async function narrowBudget(
  principal: Principal,
  bucket: Bucket,
  moderation: boolean,
) {
  await actorBudget(
    principal,
    `community.${bucket}:${principal.user.id}`,
    bucket === "post" ? 5 : bucket === "report" ? 3 : 10,
    moderation,
  );
}
async function actorBudget(
  principal: Principal,
  key: string,
  ceiling: number,
  moderation = false,
) {
  // Serialize identity-bearing keys with root users deletion; a stale session cannot recreate them.
  const count = await getDatabase().transaction(async (tx) => {
    await lockPrincipal(tx, principal, moderation);
    const rows = await tx.execute(sql`
      with budget_clock as materialized (select (extract(epoch from clock_timestamp()) * 1000)::bigint as at)
      insert into rate_limits (id, key, count, last_request)
      select ${crypto.randomUUID()}, ${key}, 1, at from budget_clock where true
      on conflict (key) do update set
        count = case when rate_limits.last_request < (select at from budget_clock) - 60000 then 1 else rate_limits.count + 1 end,
        last_request = case when rate_limits.last_request < (select at from budget_clock) - 60000 then (select at from budget_clock) else rate_limits.last_request end
      returning count`);
    const value = Number(rows[0]?.count);
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error("Invalid actor budget result");
    return value;
  });
  // Rejection must not roll back the charged attempt or weaken additional buckets.
  if (count > ceiling) throw new HttpError(429, "RATE_LIMITED");
}
async function rateBudget(key: string, ceiling: number) {
  const rows = await getDatabaseConnection().client<{ count: number }[]>`
    insert into rate_limits (id, key, count, last_request)
    values (${crypto.randomUUID()}, ${key}, 1, (extract(epoch from now()) * 1000)::bigint)
    on conflict (key) do update set
      count = case when rate_limits.last_request < (extract(epoch from now()) * 1000)::bigint - 60000 then 1 else rate_limits.count + 1 end,
      last_request = case when rate_limits.last_request < (extract(epoch from now()) * 1000)::bigint - 60000 then (extract(epoch from now()) * 1000)::bigint else rate_limits.last_request end
    returning count`;
  if (!rows[0] || rows[0].count > ceiling)
    throw new HttpError(429, "RATE_LIMITED");
}
async function publicReadBudget(headers: Headers, reveal = false) {
  // Like Better Auth, this requires proxy overwrite/direct-origin isolation in hosting.
  const supplied =
    process.env.VERCEL === "1"
      ? headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
      : headers.get("x-real-ip");
  const ip =
    supplied && supplied.length <= 45 && isIP(supplied)
      ? supplied.toLowerCase()
      : "unknown";
  const subject = createHash("sha256")
    .update(getAuthEnv().BETTER_AUTH_SECRET)
    .update("\0community-read\0")
    .update(ip)
    .digest("hex");
  await rateBudget(
    `community.${reveal ? "reveal" : "read"}:${subject}`,
    reveal ? 20 : 60,
  );
}
async function command<T>(
  headers: Headers,
  schema: z.ZodType<T>,
  input: Input,
  bucket: Bucket,
  moderation = false,
) {
  const principal = await verified(headers, moderation);
  await limitCatalogMutation(principal.user.id);
  await narrowBudget(principal, bucket, moderation);
  // Direct service calls cannot skip Origin even when the route uses a lazy parser.
  requireTrustedOrigin(new Request(getAuthEnv().APP_ORIGIN, { headers }));
  return {
    principal,
    value: schema.parse(typeof input === "function" ? await input() : input),
  };
}
async function lockPrincipal(tx: Tx, principal: Principal, moderation = false) {
  // NO KEY UPDATE also serializes quotas/role changes without blocking unrelated FK key-share checks.
  const [actor] = await tx
    .select({ id: user.id, role: user.role, verified: user.emailVerified })
    .from(user)
    .where(eq(user.id, principal.user.id))
    .for("no key update");
  if (
    !actor ||
    !actor.verified ||
    (moderation && !moderatorRoles.some((role) => role === actor.role))
  )
    throw new AuthorizationError(403);
  const [current] = await tx
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.id, principal.session.id),
        eq(sessions.userId, actor.id),
        sql`${sessions.expiresAt} > clock_timestamp()`,
      ),
    )
    .for("share");
  if (!current) throw new AuthorizationError(401);
  return actor.id;
}
async function published(tx: Tx, id: string, lock = false) {
  const query = tx
    .select({ id: works.id })
    .from(works)
    .where(and(eq(works.id, id), eq(works.visibility, "PUBLISHED")));
  const [work] = await (lock ? query.for("update") : query);
  if (!work) throw missing();
}
async function clock(tx: Tx) {
  const rows = await tx.execute(sql`select clock_timestamp()::text as value`);
  if (typeof rows[0]?.value !== "string")
    throw new HttpError(503, "SERVICE_UNAVAILABLE");
  return new Date(rows[0].value);
}
async function target(tx: Tx, id: string, workId: string, lock = false) {
  const query = tx
    .select()
    .from(communityContents)
    .where(
      and(eq(communityContents.id, id), eq(communityContents.workId, workId)),
    );
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw missing();
  return row;
}
async function qualifyPublic(tx: Tx, row: Content) {
  if (row.kind === "THREAD" && row.moderationState === "HIDDEN")
    throw missing();
  if (
    row.kind === "REVIEW" &&
    (row.authorState !== "ACTIVE" || row.moderationState !== "VISIBLE")
  )
    throw missing();
  if (row.kind === "REPLY") {
    const thread = await target(tx, row.threadId!, row.workId);
    if (thread.kind !== "THREAD" || thread.moderationState !== "VISIBLE")
      throw missing();
    let parentId = row.parentId;
    for (let depth = 0; parentId !== null && depth < L.replyMaxDepth; depth++) {
      const parent = await target(tx, parentId, row.workId);
      if (
        parent.kind !== "REPLY" ||
        parent.threadId !== row.threadId ||
        parent.moderationState !== "VISIBLE"
      )
        throw missing();
      parentId = parent.parentId;
    }
    if (parentId !== null) throw missing();
  }
}
async function projection(tx: Tx, row: Content) {
  const [author] =
    row.authorId &&
    row.authorState === "ACTIVE" &&
    row.moderationState === "VISIBLE"
      ? await tx
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, row.authorId))
      : [];
  return projectCommunityContent(row, author?.name ?? null);
}
function fence(
  row: Content,
  kind: CommunityContentKind,
  expectedRevision: number,
) {
  if (row.kind !== kind) throw missing();
  if (row.revision !== expectedRevision)
    throw new HttpError(409, "STALE_REVISION");
}
function editable(row: Content) {
  if (row.authorState !== "ACTIVE" || row.moderationState !== "VISIBLE")
    throw new HttpError(409, "CONTENT_UNAVAILABLE");
}
function eventRoom(row: Content, withdrawal = false) {
  if (row.eventCount >= L.maxEvents + (withdrawal ? 1 : 0))
    throw new HttpError(409, "HISTORY_LIMIT_REACHED");
}
function hash(
  actorId: string,
  workId: string,
  targetId: string | null,
  value: CommunityCommand,
) {
  return createHash("sha256")
    .update(
      canonicalCommunityCommand({ actorId, workId, targetId, command: value }),
      "utf8",
    )
    .digest("hex");
}
async function receiptRoom(
  tx: Tx,
  actorId: string,
  reservedWithdrawal = false,
) {
  const condition = reservedWithdrawal
    ? eq(communityMutationReceipts.actorId, actorId)
    : and(
        eq(communityMutationReceipts.actorId, actorId),
        or(
          ne(communityMutationReceipts.command, "WITHDRAW"),
          eq(communityMutationReceipts.outcome, "NOOP"),
        ),
      );
  const [row] = await tx
    .select({ count: count() })
    .from(communityMutationReceipts)
    .where(condition);
  if (row.count >= (reservedWithdrawal ? L.maxReceipts : L.maxOrdinaryReceipts))
    throw new HttpError(409, "RECEIPT_LIMIT_REACHED");
}
async function replay(
  tx: Tx,
  actorId: string,
  key: string,
  requestHash: string,
) {
  const [receipt] = await tx
    .select()
    .from(communityMutationReceipts)
    .where(
      and(
        eq(communityMutationReceipts.actorId, actorId),
        eq(communityMutationReceipts.mutationKey, key),
      ),
    );
  if (receipt && receipt.requestHash !== requestHash)
    throw new HttpError(409, "IDEMPOTENCY_CONFLICT");
  return receipt;
}
async function result(
  tx: Tx,
  row: Content,
  replayed = false,
  reportId: string | null = null,
  reporterId?: string,
) {
  const [report] = reportId
    ? await tx
        .select({
          id: communityReports.id,
          state: communityReports.state,
          revision: communityReports.revision,
        })
        .from(communityReports)
        .where(
          and(
            eq(communityReports.id, reportId),
            reporterId
              ? eq(communityReports.reporterId, reporterId)
              : undefined,
          ),
        )
    : [];
  return {
    content: await projection(tx, row),
    replayed,
    report: report ?? null,
  };
}
async function event(
  tx: Tx,
  before: Content,
  after: Content,
  actorId: string,
  kind: CommunityCommandKind,
  at: Date,
) {
  await tx.insert(communityContentEvents).values({
    ...scope(after),
    actorId,
    contentRevision: after.revision,
    command: kind,
    beforeAuthorState: before.authorState,
    afterAuthorState: after.authorState,
    beforeModerationState: before.moderationState,
    afterModerationState: after.moderationState,
    createdAt: at,
  });
}
async function receipt(
  tx: Tx,
  row: Content,
  actorId: string,
  value: CommunityCommand,
  requestHash: string,
  outcome: "APPLIED" | "NOOP",
  at: Date,
  reportId: string | null = null,
  reportRevision: number | null = null,
) {
  await tx.insert(communityMutationReceipts).values({
    ...scope(row),
    actorId,
    mutationKey: value.input.mutationKey,
    requestHash,
    command: value.kind,
    outcome,
    contentRevision: row.revision,
    reportId,
    reportRevision,
    createdAt: at,
  });
}
async function update(
  tx: Tx,
  row: Content,
  patch: Partial<typeof communityContents.$inferInsert>,
) {
  const [next] = await tx
    .update(communityContents)
    .set(patch)
    .where(eq(communityContents.id, row.id))
    .returning();
  return next;
}
async function ownerRoom(
  tx: Tx,
  actorId: string,
  workId: string,
  kind: CommunityContentKind,
  threadId?: string,
) {
  const [owned] = await tx
    .select({ count: count() })
    .from(communityContents)
    .where(eq(communityContents.authorId, actorId));
  if (owned.count >= L.maxOwnedContents)
    throw new HttpError(409, "CONTENT_LIMIT_REACHED");
  const [rows] = await tx
    .select({ count: count() })
    .from(communityContents)
    .where(
      and(
        eq(communityContents.workId, workId),
        eq(communityContents.kind, kind),
        threadId ? eq(communityContents.threadId, threadId) : undefined,
      ),
    );
  const maximum =
    kind === "THREAD"
      ? L.maxThreadsPerWork
      : kind === "REVIEW"
        ? L.maxReviewsPerWork
        : L.maxRepliesPerThread;
  if (rows.count >= maximum) throw new HttpError(409, "CONTENT_LIMIT_REACHED");
}
async function createContent(
  workInput: string,
  input: Input,
  headers: Headers,
  kind: "CREATE_THREAD" | "CREATE_REPLY" | "CREATE_REVIEW",
) {
  return safe(async () => {
    // Select schema via trusted server method, never body role/kind/owner.
    const schema =
      kind === "CREATE_THREAD"
        ? communityThreadCreateSchema
        : kind === "CREATE_REPLY"
          ? communityReplyCreateSchema
          : communityReviewCreateSchema;
    const { principal, value } = await command(
      headers,
      schema as z.ZodType<
        | z.infer<typeof communityThreadCreateSchema>
        | z.infer<typeof communityReplyCreateSchema>
        | z.infer<typeof communityReviewCreateSchema>
      >,
      input,
      "post",
    );
    const workId = communityUuidSchema.parse(workInput);
    const valueCommand = { kind, input: value } as CommunityCommand;
    const requestHash = hash(principal.user.id, workId, null, valueCommand);
    return getDatabase().transaction(async (tx) => {
      const actorId = await lockPrincipal(tx, principal);
      await published(tx, workId, true);
      const previous = await replay(
        tx,
        actorId,
        value.mutationKey,
        requestHash,
      );
      if (previous) {
        const current = await target(tx, previous.contentId, workId);
        await qualifyPublic(tx, current);
        return result(tx, current, true);
      }
      await receiptRoom(tx, actorId);
      const contentKind =
        kind === "CREATE_THREAD"
          ? "THREAD"
          : kind === "CREATE_REPLY"
            ? "REPLY"
            : "REVIEW";
      const reply = "threadId" in value ? value : null;
      await ownerRoom(tx, actorId, workId, contentKind, reply?.threadId);
      let parent: Content | null = null;
      let thread: Content | null = null;
      if (reply) {
        thread = await target(tx, reply.threadId, workId, true);
        if (thread.kind !== "THREAD") throw missing();
        editable(thread);
        if (reply.parentId) {
          parent = await target(tx, reply.parentId, workId, true);
          if (
            parent.kind !== "REPLY" ||
            parent.threadId !== reply.threadId ||
            parent.depth !== reply.depth - 1
          )
            throw missing();
          editable(parent);
          await qualifyPublic(tx, parent);
        }
      }
      const at = await clock(tx);
      const [row] = await tx
        .insert(communityContents)
        .values({
          workId,
          kind: contentKind,
          authorId: actorId,
          title: "title" in value ? value.title : "",
          titleSpoiler: "titleSpoiler" in value ? value.titleSpoiler : false,
          body: value.body,
          bodySpoiler: value.bodySpoiler,
          spoilerContext: value.spoilerContext,
          ratingHalfStars: "rating" in value ? value.rating : null,
          threadId: reply?.threadId ?? null,
          threadKind: reply ? "THREAD" : null,
          parentId: parent?.id ?? null,
          parentKind: parent ? "REPLY" : null,
          parentDepth: parent?.depth ?? null,
          depth: reply?.depth ?? null,
          eventCount: 1,
          createdAt: at,
          updatedAt: at,
          lastActivityAt: at,
        })
        .returning();
      await event(tx, row, row, actorId, kind, at);
      await receipt(tx, row, actorId, valueCommand, requestHash, "APPLIED", at);
      if (thread) await update(tx, thread, { lastActivityAt: at });
      return result(tx, row);
    });
  });
}
export const createCommunityThread = (
  workId: string,
  input: Input,
  headers: Headers,
) => createContent(workId, input, headers, "CREATE_THREAD");
export const createCommunityReply = (
  workId: string,
  input: Input,
  headers: Headers,
) => createContent(workId, input, headers, "CREATE_REPLY");
export const createCommunityReview = (
  workId: string,
  input: Input,
  headers: Headers,
) => createContent(workId, input, headers, "CREATE_REVIEW");

export async function editCommunityContent(
  workInput: string,
  targetInput: string,
  input: Input,
  headers: Headers,
) {
  return safe(async () => {
    const { principal, value } = await command(
      headers,
      communityEditSchema,
      input,
      "post",
    );
    const workId = communityUuidSchema.parse(workInput),
      targetId = communityUuidSchema.parse(targetInput);
    const valueCommand: CommunityCommand = { kind: "EDIT", input: value };
    const requestHash = hash(principal.user.id, workId, targetId, valueCommand);
    return getDatabase().transaction(async (tx) => {
      const actorId = await lockPrincipal(tx, principal);
      await published(tx, workId, true);
      const row = await target(tx, targetId, workId, true);
      if (row.authorId !== actorId) throw missing();
      const previous = await replay(
        tx,
        actorId,
        value.mutationKey,
        requestHash,
      );
      if (previous) {
        await qualifyPublic(tx, row);
        return result(tx, row, true);
      }
      await qualifyPublic(tx, row);
      fence(row, value.contentKind, value.expectedRevision);
      editable(row);
      await receiptRoom(tx, actorId);
      const patch = {
        title: "title" in value ? value.title : "",
        titleSpoiler: "titleSpoiler" in value ? value.titleSpoiler : false,
        body: value.body,
        bodySpoiler: value.bodySpoiler,
        spoilerContext: value.spoilerContext,
        ratingHalfStars: "rating" in value ? value.rating : null,
      };
      const changed = Object.entries(patch).some(
        ([key, value]) => row[key as keyof Content] !== value,
      );
      const at = await clock(tx);
      if (!changed) {
        await receipt(tx, row, actorId, valueCommand, requestHash, "NOOP", at);
        return result(tx, row);
      }
      eventRoom(row);
      const next = await update(tx, row, {
        ...patch,
        revision: row.revision + 1,
        eventCount: row.eventCount + 1,
        editedAt: at,
        updatedAt: at,
        lastActivityAt: at,
      });
      await event(tx, row, next, actorId, "EDIT", at);
      await receipt(
        tx,
        next,
        actorId,
        valueCommand,
        requestHash,
        "APPLIED",
        at,
      );
      if (row.threadId) {
        const thread = await target(tx, row.threadId, workId, true);
        if (thread.authorState !== "ERASED")
          await update(tx, thread, { lastActivityAt: at });
      }
      return result(tx, next);
    });
  });
}
export async function withdrawCommunityContent(
  workInput: string,
  targetInput: string,
  input: Input,
  headers: Headers,
) {
  return safe(async () => {
    const { principal, value } = await command(
      headers,
      communityDeleteSchema,
      input,
      "safety",
    );
    const workId = communityUuidSchema.parse(workInput),
      targetId = communityUuidSchema.parse(targetInput);
    const valueCommand: CommunityCommand = { kind: "WITHDRAW", input: value };
    const requestHash = hash(principal.user.id, workId, targetId, valueCommand);
    return getDatabase().transaction(async (tx) => {
      const actorId = await lockPrincipal(tx, principal);
      // Private owner erasure must remain possible after catalog unpublication.
      // Load only UUID scope, never unavailable catalog metadata; returned text is blank.
      const [work] = await tx
        .select({ id: works.id })
        .from(works)
        .where(eq(works.id, workId))
        .for("update");
      if (!work) throw missing();
      const row = await target(tx, targetId, workId, true);
      if (row.authorId !== actorId) throw missing();
      const previous = await replay(
        tx,
        actorId,
        value.mutationKey,
        requestHash,
      );
      if (previous) return result(tx, row, true);
      fence(row, value.contentKind, value.expectedRevision);
      const alreadyWithdrawn = row.authorState !== "ACTIVE";
      await receiptRoom(tx, actorId, !alreadyWithdrawn);
      const at = await clock(tx);
      if (alreadyWithdrawn) {
        await receipt(tx, row, actorId, valueCommand, requestHash, "NOOP", at);
        return result(tx, row);
      }
      eventRoom(row, true);
      const next = await update(tx, row, {
        authorState: "DELETED",
        title: "",
        body: "",
        spoilerContext: null,
        ratingHalfStars: null,
        titleSpoiler: false,
        bodySpoiler: false,
        editedAt: null,
        revision: row.revision + 1,
        eventCount: row.eventCount + 1,
        updatedAt: at,
      });
      await event(tx, row, next, actorId, "WITHDRAW", at);
      await receipt(
        tx,
        next,
        actorId,
        valueCommand,
        requestHash,
        "APPLIED",
        at,
      );
      return result(tx, next);
    });
  });
}
export async function reportCommunityContent(
  workInput: string,
  targetInput: string,
  input: Input,
  headers: Headers,
) {
  return safe(async () => {
    const { principal, value } = await command(
      headers,
      communityReportSchema,
      input,
      "report",
    );
    const workId = communityUuidSchema.parse(workInput),
      targetId = communityUuidSchema.parse(targetInput);
    const valueCommand: CommunityCommand = { kind: "REPORT", input: value };
    const requestHash = hash(principal.user.id, workId, targetId, valueCommand);
    return getDatabase().transaction(async (tx) => {
      const actorId = await lockPrincipal(tx, principal);
      await published(tx, workId, true);
      const row = await target(tx, targetId, workId, true);
      const previous = await replay(
        tx,
        actorId,
        value.mutationKey,
        requestHash,
      );
      if (previous) {
        await qualifyPublic(tx, row);
        return result(tx, row, true, previous.reportId, actorId);
      }
      await qualifyPublic(tx, row);
      fence(row, value.contentKind, value.expectedRevision);
      editable(row);
      await receiptRoom(tx, actorId);
      if (row.reportCount >= L.maxReportsPerContent)
        throw new HttpError(409, "REPORT_LIMIT_REACHED");
      const [owned] = await tx
        .select({ count: count() })
        .from(communityReports)
        .where(eq(communityReports.reporterId, actorId));
      if (owned.count >= L.maxReportsPerUser)
        throw new HttpError(409, "REPORT_LIMIT_REACHED");
      const at = await clock(tx);
      const [report] = await tx
        .insert(communityReports)
        .values({
          ...scope(row),
          reporterId: actorId,
          reason: value.reason,
          explanation: value.explanation,
          createdAt: at,
          updatedAt: at,
        })
        .returning();
      await update(tx, row, { reportCount: row.reportCount + 1 });
      await receipt(
        tx,
        row,
        actorId,
        valueCommand,
        requestHash,
        "APPLIED",
        at,
        report.id,
        report.revision,
      );
      return result(tx, row, false, report.id, actorId);
    });
  });
}
export async function moderateCommunityContent(
  workInput: string,
  targetInput: string,
  input: Input,
  headers: Headers,
) {
  return safe(async () => {
    const { principal, value } = await command(
      headers,
      communityModerationSchema,
      input,
      "safety",
      true,
    );
    const workId = communityUuidSchema.parse(workInput),
      targetId = communityUuidSchema.parse(targetInput);
    const valueCommand = {
      kind: value.action,
      input: value,
    } as CommunityCommand;
    const requestHash = hash(principal.user.id, workId, targetId, valueCommand);
    return getDatabase().transaction(async (tx) => {
      const actorId = await lockPrincipal(tx, principal, true);
      // Unavailable Work can still be hidden/dismissed privately; restore cannot publish it.
      const [work] = await tx
        .select({ visibility: works.visibility })
        .from(works)
        .where(eq(works.id, workId))
        .for("update");
      if (
        !work ||
        (value.action === "RESTORE" && work.visibility !== "PUBLISHED")
      )
        throw missing();
      const row = await target(tx, targetId, workId, true);
      const previous = await replay(
        tx,
        actorId,
        value.mutationKey,
        requestHash,
      );
      if (previous) return result(tx, row, true, previous.reportId);
      fence(row, value.contentKind, value.expectedRevision);
      const [report] = value.reportId
        ? await tx
            .select()
            .from(communityReports)
            .where(
              and(
                eq(communityReports.id, value.reportId),
                eq(communityReports.workId, workId),
                eq(communityReports.contentId, targetId),
                eq(communityReports.targetKind, row.kind),
              ),
            )
            .for("update")
        : [];
      if (value.reportId && !report) throw missing();
      if (
        report &&
        (report.state !== "OPEN" ||
          report.revision !== value.expectedReportRevision)
      )
        throw new HttpError(409, "STALE_REPORT_REVISION");
      if (value.action === "RESTORE" && row.authorState === "ERASED")
        throw new HttpError(409, "CONTENT_UNAVAILABLE");
      if (value.action === "HIDE" && row.authorState === "ERASED")
        throw new HttpError(409, "CONTENT_UNAVAILABLE");
      await receiptRoom(tx, actorId);
      const moderationState =
        value.action === "HIDE"
          ? "HIDDEN"
          : value.action === "RESTORE"
            ? "VISIBLE"
            : row.moderationState;
      const changed = moderationState !== row.moderationState || !!report;
      const at = await clock(tx);
      if (!changed) {
        await receipt(tx, row, actorId, valueCommand, requestHash, "NOOP", at);
        return result(tx, row);
      }
      eventRoom(row);
      if (row.moderationActionCount >= L.maxModerationActions)
        throw new HttpError(409, "HISTORY_LIMIT_REACHED");
      const next = await update(tx, row, {
        moderationState,
        revision: row.revision + 1,
        eventCount: row.eventCount + 1,
        moderationActionCount: row.moderationActionCount + 1,
        updatedAt: row.authorState === "ERASED" ? null : at,
      });
      let reportRevision: number | null = null;
      if (report) {
        reportRevision = report.revision + 1;
        await tx
          .update(communityReports)
          .set({
            state: value.action === "HIDE" ? "UPHELD" : "DISMISSED",
            revision: reportRevision,
            updatedAt: at,
          })
          .where(eq(communityReports.id, report.id));
      }
      await tx.insert(communityModerationActions).values({
        ...scope(next),
        actorId,
        reportId: report?.id ?? null,
        action: value.action,
        reason: value.reason,
        sequence: next.moderationActionCount,
        contentRevision: next.revision,
        reportRevision,
        createdAt: at,
      });
      await event(tx, row, next, actorId, value.action, at);
      await receipt(
        tx,
        next,
        actorId,
        valueCommand,
        requestHash,
        "APPLIED",
        at,
        report?.id ?? null,
        reportRevision,
      );
      return result(tx, next, false, report?.id ?? null);
    });
  });
}

export async function getCommunityContent(
  workInput: string,
  targetInput: string,
  headers = new Headers(),
) {
  return safe(async () => {
    requireCommunityEnabled();
    await publicReadBudget(headers);
    const workId = communityUuidSchema.parse(workInput),
      targetId = communityUuidSchema.parse(targetInput);
    return getDatabase().transaction(
      async (tx) => {
        await published(tx, workId);
        const row = await target(tx, targetId, workId);
        await qualifyPublic(tx, row);
        return projection(tx, row);
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  });
}
export async function revealCommunityContent(input: Input, headers: Headers) {
  return safe(async () => {
    requireCommunityEnabled();
    requireTrustedOrigin(new Request(getAuthEnv().APP_ORIGIN, { headers }));
    await publicReadBudget(headers, true);
    const value = communityRevealSchema.parse(
      typeof input === "function" ? await input() : input,
    );
    return getDatabase().transaction(
      async (tx) => {
        await published(tx, value.workId);
        const row = await target(tx, value.targetId, value.workId);
        await qualifyPublic(tx, row);
        return projectCommunityReveal(row, value);
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  });
}
export async function listCommunityContents(
  workInput: string,
  kind: "THREAD" | "REVIEW",
  input: Input,
  threadInput?: string,
  headers = new Headers(),
) {
  return safe(async () => {
    requireCommunityEnabled();
    await publicReadBudget(headers);
    z.enum(["THREAD", "REVIEW"]).parse(kind);
    const workId = communityUuidSchema.parse(workInput);
    const query = communityQuerySchema.parse(
      typeof input === "function" ? await input() : input,
    );
    const threadId = threadInput
      ? communityUuidSchema.parse(threadInput)
      : null;
    return getDatabase().transaction(
      async (tx) => {
        await published(tx, workId);
        let extra: SQL | undefined;
        if (threadId) {
          const thread = await target(tx, threadId, workId);
          if (thread.kind !== "THREAD") throw missing();
          await qualifyPublic(tx, thread);
          // Fixed depth makes ancestor qualification a bounded indexed two-parent join.
          extra = sql`not exists (select 1 from community_contents p where p.id = ${communityContents.parentId} and (p.moderation_state = 'HIDDEN' or exists (select 1 from community_contents gp where gp.id = p.parent_id and gp.moderation_state = 'HIDDEN')))`;
        }
        const sourceTime = threadId
          ? communityContents.createdAt
          : communityContents.lastActivityAt;
        // Cursor/order uses the same public allowlist: tombstones never expose their retained authored dates.
        const orderColumn = sql<Date | null>`date_trunc('milliseconds', case when ${communityContents.authorState} = 'ACTIVE' and ${communityContents.moderationState} = 'VISIBLE' then ${sourceTime} else null end)`;
        const cursor = query.cursor
          ? query.cursor.timestamp === null
            ? and(
                isNull(orderColumn),
                lt(communityContents.id, query.cursor.id),
              )
            : or(
                sql`${orderColumn} < ${query.cursor.timestamp}::timestamptz`,
                and(
                  sql`${orderColumn} = ${query.cursor.timestamp}::timestamptz`,
                  lt(communityContents.id, query.cursor.id),
                ),
                isNull(orderColumn),
              )
          : undefined;
        const rows = await tx
          .select()
          .from(communityContents)
          .where(
            and(
              eq(communityContents.workId, workId),
              eq(communityContents.kind, threadId ? "REPLY" : kind),
              threadId ? eq(communityContents.threadId, threadId) : undefined,
              threadId
                ? extra
                : eq(communityContents.moderationState, "VISIBLE"),
              !threadId && kind === "REVIEW"
                ? eq(communityContents.authorState, "ACTIVE")
                : undefined,
              cursor,
            ),
          )
          .orderBy(
            sql`${orderColumn} desc nulls last`,
            desc(communityContents.id),
          )
          .limit(L.pageSize)
          .offset(query.page ? (query.page - 1) * L.pageSize : 0);
        return {
          items: await Promise.all(rows.map((row) => projection(tx, row))),
          pageSize: L.pageSize,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  });
}
/** V4C reviews and statistics share one published-Work repeatable-read snapshot. */
export async function listCommunityReviews(
  workInput: string,
  input: Input,
  headers = new Headers(),
) {
  return safe(async () => {
    requireCommunityEnabled();
    await publicReadBudget(headers);
    const workId = communityUuidSchema.parse(workInput);
    const query = communityQuerySchema.parse(
      typeof input === "function" ? await input() : input,
    );
    return getDatabase().transaction(
      async (tx) => {
        await published(tx, workId);
        const visible = and(
          eq(communityContents.workId, workId),
          eq(communityContents.kind, "REVIEW"),
          eq(communityContents.authorState, "ACTIVE"),
          eq(communityContents.moderationState, "VISIBLE"),
        );
        // Only public community half-star rows; no library query, SQL AVG, rounding or private totals.
        const [aggregate] = await tx
          .select({
            reviewCount: sql<number>`count(*)::integer`,
            ratedReviewCount: sql<number>`count(${communityContents.ratingHalfStars})::integer`,
            ratingSum: sql<number>`coalesce(sum(${communityContents.ratingHalfStars}), 0)::integer`,
          })
          .from(communityContents)
          .where(visible);
        if (!aggregate) throw new Error("Missing review aggregate");
        const statistics = reviewStatisticsFromAggregate(aggregate);
        const orderColumn = sql<Date | null>`date_trunc('milliseconds', ${communityContents.lastActivityAt})`;
        const cursor = query.cursor
          ? query.cursor.timestamp === null
            ? and(
                isNull(orderColumn),
                lt(communityContents.id, query.cursor.id),
              )
            : or(
                sql`${orderColumn} < ${query.cursor.timestamp}::timestamptz`,
                and(
                  sql`${orderColumn} = ${query.cursor.timestamp}::timestamptz`,
                  lt(communityContents.id, query.cursor.id),
                ),
                isNull(orderColumn),
              )
          : undefined;
        const rows = await tx
          .select()
          .from(communityContents)
          .where(and(visible, cursor))
          .orderBy(
            sql`${orderColumn} desc nulls last`,
            desc(communityContents.id),
          )
          .limit(L.pageSize)
          .offset(query.page ? (query.page - 1) * L.pageSize : 0);
        return validatedCommunityResponse(reviewListResponseSchema, {
          items: await Promise.all(rows.map((row) => projection(tx, row))),
          pageSize: L.pageSize,
          statistics,
        });
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  });
}
/** REVIEW owner reads select only metadata and Work eligibility, never authored/catalog facts. */
function reviewOwnedColumns() {
  const available = sql<boolean>`(${works.visibility} = 'PUBLISHED')`;
  return {
    id: communityContents.id,
    workId: communityContents.workId,
    kind: communityContents.kind,
    threadId: communityContents.threadId,
    parentId: communityContents.parentId,
    depth: communityContents.depth,
    revision: communityContents.revision,
    authorState: communityContents.authorState,
    moderationState: communityContents.moderationState,
    workAvailable: available,
    canEdit: sql<boolean>`(${available} and ${communityContents.authorState} = 'ACTIVE' and ${communityContents.moderationState} = 'VISIBLE' and ${communityContents.revision} < 2147483647)`,
    canWithdraw: sql<boolean>`(${communityContents.authorState} = 'ACTIVE' and ${communityContents.revision} < 2147483647)`,
  };
}
export async function getOwnedCommunityReview(
  workInput: string,
  targetInput: string,
  input: Input,
  headers: Headers,
): Promise<ReviewOwnedDTO> {
  return safe(async () => {
    const principal = await verified(headers);
    await actorBudget(principal, `community.ownread:${principal.user.id}`, 60);
    const workId = communityUuidSchema.parse(workInput),
      targetId = communityUuidSchema.parse(targetInput);
    reviewOwnedContextQuerySchema.parse(
      typeof input === "function" ? await input() : input,
    );
    return getDatabase().transaction(async (tx) => {
      const actorId = await lockPrincipal(tx, principal);
      const [row] = await tx
        .select(reviewOwnedColumns())
        .from(communityContents)
        .innerJoin(works, eq(works.id, communityContents.workId))
        .where(
          and(
            eq(communityContents.id, targetId),
            eq(communityContents.workId, workId),
            eq(communityContents.authorId, actorId),
            eq(communityContents.kind, "REVIEW"),
          ),
        );
      if (!row) throw missing();
      return validatedCommunityResponse(reviewOwnedSchema, row);
    });
  });
}
export async function listOwnedCommunityReviews(
  input: Input,
  headers: Headers,
) {
  return safe(async () => {
    const principal = await verified(headers);
    await actorBudget(principal, `community.ownread:${principal.user.id}`, 60);
    const query = communityOwnedQuerySchema.parse(
      typeof input === "function" ? await input() : input,
    );
    return getDatabase().transaction(async (tx) => {
      const actorId = await lockPrincipal(tx, principal);
      const rows = await tx
        .select(reviewOwnedColumns())
        .from(communityContents)
        .innerJoin(works, eq(works.id, communityContents.workId))
        .where(
          and(
            eq(communityContents.authorId, actorId),
            eq(communityContents.kind, "REVIEW"),
            query.cursor
              ? lt(communityContents.id, query.cursor.id)
              : undefined,
          ),
        )
        .orderBy(desc(communityContents.id))
        .limit(L.pageSize)
        .offset(query.page ? (query.page - 1) * L.pageSize : 0);
      return {
        items: rows.map((row) =>
          validatedCommunityResponse(reviewOwnedSchema, row),
        ),
        pageSize: L.pageSize,
      };
    });
  });
}
export async function getCommunityReviewSlot(
  workInput: string | (() => Promise<string>),
  headers: Headers,
) {
  return safe(async () => {
    const principal = await verified(headers);
    await actorBudget(principal, `community.ownread:${principal.user.id}`, 60);
    const workId = communityUuidSchema.parse(
      typeof workInput === "function" ? await workInput() : workInput,
    );
    return getDatabase().transaction(async (tx) => {
      const actorId = await lockPrincipal(tx, principal);
      const [row] = await tx
        .select(reviewOwnedColumns())
        .from(communityContents)
        .innerJoin(works, eq(works.id, communityContents.workId))
        .where(
          and(
            eq(communityContents.workId, workId),
            eq(communityContents.authorId, actorId),
            eq(communityContents.kind, "REVIEW"),
            or(
              eq(communityContents.authorState, "ACTIVE"),
              eq(communityContents.moderationState, "HIDDEN"),
            ),
          ),
        )
        .limit(1);
      return {
        item: row ? validatedCommunityResponse(reviewOwnedSchema, row) : null,
      };
    });
  });
}
/** Indexed, fixed-depth eligibility checks; owner reads never select authored text. */
function ownedMetadataColumns() {
  const ancestorsVisible = sql<boolean>`case
    when ${communityContents.kind} = 'THREAD' then true
    when ${communityContents.kind} = 'REPLY' then
      exists (select 1 from community_contents t
        where t.id = ${communityContents.threadId} and t.work_id = ${communityContents.workId}
          and t.kind = 'THREAD' and t.moderation_state = 'VISIBLE')
      and (${communityContents.parentId} is null or exists (
        select 1 from community_contents p
        where p.id = ${communityContents.parentId} and p.work_id = ${communityContents.workId}
          and p.thread_id = ${communityContents.threadId} and p.kind = 'REPLY'
          and p.moderation_state = 'VISIBLE'
          and (p.parent_id is null or exists (
            select 1 from community_contents gp
            where gp.id = p.parent_id and gp.work_id = ${communityContents.workId}
              and gp.thread_id = ${communityContents.threadId} and gp.kind = 'REPLY'
              and gp.moderation_state = 'VISIBLE' and gp.parent_id is null))))
    else false end`;
  const available = sql<boolean>`(${works.visibility} = 'PUBLISHED')`;
  return {
    id: communityContents.id,
    workId: communityContents.workId,
    kind: communityContents.kind,
    threadId: communityContents.threadId,
    parentId: communityContents.parentId,
    depth: communityContents.depth,
    revision: communityContents.revision,
    authorState: communityContents.authorState,
    moderationState: communityContents.moderationState,
    workAvailable: available,
    canEdit: sql<boolean>`(${available} and ${communityContents.authorState} = 'ACTIVE'
      and ${communityContents.moderationState} = 'VISIBLE' and ${ancestorsVisible}
      and ${communityContents.revision} < 2147483647)`,
    canWithdraw: sql<boolean>`(${communityContents.authorState} = 'ACTIVE'
      and ${communityContents.revision} < 2147483647)`,
  };
}
function ownedMetadata(
  row: Omit<CommunityOwnedDTO, "kind"> & { kind: CommunityContentKind },
): CommunityOwnedDTO {
  return {
    id: row.id,
    workId: row.workId,
    kind: z.enum(["THREAD", "REPLY"]).parse(row.kind),
    threadId: row.threadId,
    parentId: row.parentId,
    depth: row.depth,
    revision: row.revision,
    authorState: row.authorState,
    moderationState: row.moderationState,
    workAvailable: row.workAvailable,
    canEdit: row.canEdit,
    canWithdraw: row.canWithdraw,
  };
}
export async function listOwnedCommunityContents(
  input: Input,
  headers: Headers,
) {
  return safe(async () => {
    const principal = await verified(headers);
    await actorBudget(principal, `community.ownread:${principal.user.id}`, 60);
    const query = communityOwnedQuerySchema.parse(
      typeof input === "function" ? await input() : input,
    );
    return getDatabase().transaction(async (tx) => {
      const actorId = await lockPrincipal(tx, principal);
      const rows = await tx
        .select(ownedMetadataColumns())
        .from(communityContents)
        .innerJoin(works, eq(works.id, communityContents.workId))
        .where(
          and(
            eq(communityContents.authorId, actorId),
            inArray(communityContents.kind, ["THREAD", "REPLY"]),
            query.cursor
              ? lt(communityContents.id, query.cursor.id)
              : undefined,
          ),
        )
        .orderBy(desc(communityContents.id))
        .limit(L.pageSize)
        .offset(query.page ? (query.page - 1) * L.pageSize : 0);
      return { items: rows.map(ownedMetadata), pageSize: L.pageSize };
    });
  });
}
export async function getOwnedCommunityContent(
  workInput: string,
  targetInput: string,
  input: Input,
  headers: Headers,
) {
  return safe(async () => {
    const principal = await verified(headers);
    await actorBudget(principal, `community.ownread:${principal.user.id}`, 60);
    const workId = communityUuidSchema.parse(workInput),
      targetId = communityUuidSchema.parse(targetInput);
    const query = communityOwnedDetailQuerySchema.parse(
      typeof input === "function" ? await input() : input,
    );
    return getDatabase().transaction(async (tx) => {
      const actorId = await lockPrincipal(tx, principal);
      const [row] = await tx
        .select(ownedMetadataColumns())
        .from(communityContents)
        .innerJoin(works, eq(works.id, communityContents.workId))
        .where(
          and(
            eq(communityContents.id, targetId),
            eq(communityContents.workId, workId),
            eq(communityContents.authorId, actorId),
            eq(communityContents.kind, query.contentKind),
          ),
        );
      if (!row) throw missing();
      return ownedMetadata(row);
    });
  });
}
// Report/context/history remain private, signed and role-rechecked. No catalog title/private-library query.
export async function communityModerationContext(
  workInput: string,
  targetInput: string,
  headers: Headers,
) {
  return safe(async () => {
    const principal = await verified(headers, true);
    await actorBudget(
      principal,
      `community.modread:${principal.user.id}`,
      60,
      true,
    );
    const workId = communityUuidSchema.parse(workInput),
      targetId = communityUuidSchema.parse(targetInput);
    return getDatabase().transaction(async (tx) => {
      await lockPrincipal(tx, principal, true);
      const row = await target(tx, targetId, workId);
      const [work] = await tx
        .select({ visibility: works.visibility })
        .from(works)
        .where(eq(works.id, workId));
      const reports = await tx
        .select({
          id: communityReports.id,
          reason: communityReports.reason,
          explanation: communityReports.explanation,
          state: communityReports.state,
          revision: communityReports.revision,
          evidenceRedacted: communityReports.evidenceRedacted,
        })
        .from(communityReports)
        .where(
          and(
            eq(communityReports.contentId, row.id),
            eq(communityReports.workId, workId),
          ),
        )
        .orderBy(desc(communityReports.createdAt), desc(communityReports.id))
        .limit(L.pageSize);
      const actions = await tx
        .select({
          id: communityModerationActions.id,
          action: communityModerationActions.action,
          reason: communityModerationActions.reason,
          evidenceRedacted: communityModerationActions.evidenceRedacted,
          sequence: communityModerationActions.sequence,
        })
        .from(communityModerationActions)
        .where(
          and(
            eq(communityModerationActions.contentId, row.id),
            eq(communityModerationActions.workId, workId),
          ),
        )
        .orderBy(desc(communityModerationActions.sequence))
        .limit(L.pageSize);
      return {
        work: { id: workId, available: work?.visibility === "PUBLISHED" },
        target: {
          id: row.id,
          kind: row.kind,
          revision: row.revision,
          authorState: row.authorState,
          moderationState: row.moderationState,
          title: row.title,
          body: row.body,
        },
        reports,
        actions,
      };
    });
  });
}
