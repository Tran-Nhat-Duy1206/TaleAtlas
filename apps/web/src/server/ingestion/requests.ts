import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  workRequests,
  requestEvents,
  ingestionJobs,
} from "@taleatlas/database/ingestion";
import type { Database } from "@taleatlas/database/client";
import { getDatabase } from "../database";
import { HttpError } from "../http";
import { enqueueRequestJob } from "./jobs";
import {
  normalizeRequestTitle,
  requestDetailsSchema,
  canTransitionRequest,
  EDITABLE_REQUEST_STATES,
  CANCELLABLE_REQUEST_STATES,
  type RequestDetails,
} from "../../features/ingestion/contracts";
import type { WorkRequestState } from "@taleatlas/database/ingestion-types";
export type RequestTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
export type RequestRecord = typeof workRequests.$inferSelect;

export async function appendRequestEvent(
  tx: RequestTransaction,
  row: RequestRecord,
  actorId: string | null,
  kind: string,
  from: WorkRequestState | null,
  payload: Record<string, unknown> = {},
) {
  await tx
    .insert(requestEvents)
    .values({
      requestId: row.id,
      actorUserId: actorId,
      actorSnapshot: actorId ?? "system:ingestion",
      eventKind: kind,
      revision: row.revision,
      fromState: from,
      toState: row.state,
      payload,
    });
}
export async function lockRequest(
  tx: RequestTransaction,
  requestId: string,
  ownerId?: string,
) {
  const [row] = await tx
    .select()
    .from(workRequests)
    .where(
      and(
        eq(workRequests.id, requestId),
        ownerId === undefined
          ? undefined
          : eq(workRequests.ownerUserId, ownerId),
      ),
    )
    .for("update");
  if (!row) throw new HttpError(404, "REQUEST_NOT_FOUND");
  return row;
}
function expected(row: RequestRecord, revision: number) {
  if (row.revision !== revision) throw new HttpError(409, "REVISION_CONFLICT");
}
async function cancelOpenJobs(tx: RequestTransaction, requestId: string) {
  await tx
    .update(ingestionJobs)
    .set({
      state: "CANCELLED",
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      completedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(ingestionJobs.requestId, requestId),
        inArray(ingestionJobs.state, ["QUEUED", "RUNNING", "RETRY_WAIT"]),
      ),
    );
}
function project(row: RequestRecord) {
  return {
    id: row.id,
    state: row.state,
    revision: row.revision,
    inputRevision: row.inputRevision,
    details: requestDetailsSchema.parse(row.details),
    resultingWorkId: row.resultingWorkId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export async function submitRequest(
  ownerId: string,
  submitKey: string,
  details: RequestDetails,
) {
  // Equality is delivery idempotency only, NOT bibliographic identity resolution.
  const inputHash = createHash("sha256")
    .update(JSON.stringify(details))
    .digest("hex");
  return getDatabase().transaction(async (tx) => {
    const inserted = await tx
      .insert(workRequests)
      .values({
        id: randomUUID(),
        ownerUserId: ownerId,
        submitKey,
        details,
        inputHash,
        normalizedTitle: normalizeRequestTitle(details.title),
      })
      .onConflictDoNothing({
        target: [workRequests.ownerUserId, workRequests.submitKey],
      })
      .returning();
    const [existing] = inserted.length
      ? inserted
      : await tx
          .select()
          .from(workRequests)
          .where(
            and(
              eq(workRequests.ownerUserId, ownerId),
              eq(workRequests.submitKey, submitKey),
            ),
          )
          .for("update");
    if (!existing || existing.inputHash !== inputHash)
      throw new HttpError(409, "IDEMPOTENCY_CONFLICT");
    if (inserted.length) {
      await appendRequestEvent(tx, existing, ownerId, "SUBMITTED", null, {
        inputRevision: 1,
      });
      await enqueueRequestJob(tx, existing.id, 1);
    }
    return project(existing);
  });
}
export async function getRequest(requestId: string, ownerId?: string) {
  return getDatabase().transaction(
    async (tx) => {
      const [row] = await tx
        .select()
        .from(workRequests)
        .where(
          and(
            eq(workRequests.id, requestId),
            ownerId === undefined
              ? undefined
              : eq(workRequests.ownerUserId, ownerId),
          ),
        );
      if (!row) throw new HttpError(404, "REQUEST_NOT_FOUND");
      const events = await tx
        .select({
          eventKind: requestEvents.eventKind,
          revision: requestEvents.revision,
          fromState: requestEvents.fromState,
          toState: requestEvents.toState,
          payload: requestEvents.payload,
          createdAt: requestEvents.createdAt,
        })
        .from(requestEvents)
        .where(eq(requestEvents.requestId, requestId))
        .orderBy(requestEvents.revision);
      return {
        ...project(row),
        events: events.map((event) => ({
          ...event,
          createdAt: event.createdAt.toISOString(),
        })),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function listOwnedRequests(
  ownerId: string,
  page: number,
  pageSize: number,
) {
  return getDatabase().transaction(
    async (tx) => {
      const where = eq(workRequests.ownerUserId, ownerId);
      const [count] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(workRequests)
        .where(where);
      const rows = await tx
        .select()
        .from(workRequests)
        .where(where)
        .orderBy(desc(workRequests.createdAt), desc(workRequests.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      return {
        items: rows.map(project),
        total: count?.count ?? 0,
        page,
        pageSize,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function amendRequest(
  requestId: string,
  ownerId: string,
  revision: number,
  details: RequestDetails,
) {
  return getDatabase().transaction(async (tx) => {
    const previous = await lockRequest(tx, requestId, ownerId);
    expected(previous, revision);
    if (!EDITABLE_REQUEST_STATES.includes(previous.state))
      throw new HttpError(409, "REQUEST_NOT_EDITABLE");
    const [row] = await tx
      .update(workRequests)
      .set({
        details,
        normalizedTitle: normalizeRequestTitle(details.title),
        state: "SUBMITTED",
        revision: previous.revision + 1,
        inputRevision: previous.inputRevision + 1,
        // Any previously reviewed summary is withdrawn after untrusted input changes.
        publicTitle: null,
        publicFormat: null,
        publicSummaryVerifiedAt: null,
        updatedAt: sql`now()`,
      })
      .where(eq(workRequests.id, requestId))
      .returning();
    await cancelOpenJobs(tx, requestId);
    await enqueueRequestJob(tx, requestId, row.inputRevision);
    await appendRequestEvent(
      tx,
      row,
      ownerId,
      "INFORMATION_UPDATED",
      previous.state,
      {
        previousDetails: previous.details,
        details,
        inputRevision: row.inputRevision,
      },
    );
    return project(row);
  });
}
export async function cancelRequest(
  requestId: string,
  ownerId: string,
  revision: number,
) {
  return getDatabase().transaction(async (tx) => {
    const previous = await lockRequest(tx, requestId, ownerId);
    expected(previous, revision);
    if (!CANCELLABLE_REQUEST_STATES.includes(previous.state))
      throw new HttpError(409, "REQUEST_NOT_CANCELLABLE");
    const [row] = await tx
      .update(workRequests)
      .set({
        state: "CANCELLED",
        revision: previous.revision + 1,
        publicTitle: null,
        publicFormat: null,
        publicSummaryVerifiedAt: null,
        updatedAt: sql`now()`,
      })
      .where(eq(workRequests.id, requestId))
      .returning();
    await cancelOpenJobs(tx, requestId);
    await appendRequestEvent(tx, row, ownerId, "CANCELLED", previous.state);
    return project(row);
  });
}
export async function moderateRequest(
  requestId: string,
  actorId: string,
  revision: number,
  state: "NEEDS_INFO" | "NEEDS_REVIEW" | "REJECTED",
  reason: string,
) {
  return getDatabase().transaction(async (tx) => {
    const previous = await lockRequest(tx, requestId);
    expected(previous, revision);
    if (!canTransitionRequest(previous.state, state))
      throw new HttpError(409, "INVALID_TRANSITION");
    const [row] = await tx
      .update(workRequests)
      .set({ state, revision: previous.revision + 1, updatedAt: sql`now()` })
      .where(eq(workRequests.id, requestId))
      .returning();
    await cancelOpenJobs(tx, requestId);
    await appendRequestEvent(tx, row, actorId, "MODERATED", previous.state, {
      reason,
    });
    return project(row);
  });
}
