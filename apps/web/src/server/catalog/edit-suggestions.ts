import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  editSuggestions,
  editSuggestionEvents,
} from "@taleatlas/database/edit-suggestions";
import { works } from "@taleatlas/database/catalog";
import { getDatabase } from "../database";
import { requireRole, requireSession, AuthorizationError } from "../session";
import { HttpError, limitCatalogMutation } from "../http";
import { loadWork, saveWorkInTransaction } from "./repository";
import { sourceSchema, type AdminWork } from "../../features/catalog/contracts";
import {
  submitEditSuggestionSchema,
  editSuggestionPatchSchema,
  reviewEditSuggestionSchema,
  editSuggestionPageSchema,
  canonicalSuggestionInput,
  applyReviewedSuggestion,
} from "../../features/catalog/edit-suggestions";
type Tx = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];
type Row = typeof editSuggestions.$inferSelect;
async function actor(headers: Headers, admin = false) {
  const session = admin
    ? await requireRole(["admin"], headers)
    : await requireSession(headers);
  if (!session.user.emailVerified) throw new AuthorizationError(403);
  return session.user.id;
}
function project(row: Row) {
  return {
    id: row.id,
    workId: row.workId,
    baseWorkRevision: row.baseWorkRevision,
    revision: row.revision,
    state: row.state,
    patch: editSuggestionPatchSchema.parse(row.proposed),
    citation: sourceSchema.parse(row.citation),
    reviewReason: row.reviewReason,
    appliedWorkRevision: row.appliedWorkRevision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
async function append(
  tx: Tx,
  row: Row,
  actorId: string,
  fromState: Row["state"] | null,
  payload: Record<string, unknown>,
) {
  await tx
    .insert(editSuggestionEvents)
    .values({
      suggestionId: row.id,
      actorUserId: actorId,
      actorSnapshot: actorId,
      revision: row.revision,
      fromState,
      toState: row.state,
      payload,
    });
}
// Routes pass a thunk so authority and the single limiter run before JSON parsing.
export async function submitEditSuggestion(
  workId: string,
  input: unknown | (() => Promise<unknown>),
  headers: Headers,
) {
  const owner = await actor(headers);
  await limitCatalogMutation(owner);
  const id = z.uuid().parse(workId);
  const value = submitEditSuggestionSchema.parse(
    typeof input === "function" ? await input() : input,
  );
  const canonical = canonicalSuggestionInput(id, value);
  if (Buffer.byteLength(canonical, "utf8") > 12000)
    throw new HttpError(400, "PAYLOAD_TOO_LARGE");
  const inputHash = createHash("sha256").update(canonical).digest("hex");
  return getDatabase().transaction(async (tx) => {
    // No private catalog aggregate is ever read for submissions.
    const [work] = await tx
      .select({ revision: works.revision })
      .from(works)
      .where(and(eq(works.id, id), eq(works.visibility, "PUBLISHED")))
      .for("share");
    if (!work) throw new HttpError(404, "WORK_NOT_FOUND");
    const [existing] = await tx
      .select()
      .from(editSuggestions)
      .where(
        and(
          eq(editSuggestions.ownerUserId, owner),
          eq(editSuggestions.submitKey, value.submitKey),
        ),
      );
    if (existing) {
      if (existing.inputHash !== inputHash)
        throw new HttpError(409, "IDEMPOTENCY_CONFLICT");
      return project(existing);
    }
    if (work.revision !== value.baseWorkRevision)
      throw new HttpError(409, "REVISION_CONFLICT");
    const inserted = await tx
      .insert(editSuggestions)
      .values({
        ownerUserId: owner,
        workId: id,
        baseWorkRevision: value.baseWorkRevision,
        proposed: value.patch,
        citation: value.citation,
        submitKey: value.submitKey,
        inputHash,
      })
      .onConflictDoNothing({
        target: [editSuggestions.ownerUserId, editSuggestions.submitKey],
      })
      .returning();
    const [row] = inserted.length
      ? inserted
      : await tx
          .select()
          .from(editSuggestions)
          .where(
            and(
              eq(editSuggestions.ownerUserId, owner),
              eq(editSuggestions.submitKey, value.submitKey),
            ),
          );
    if (!row || row.inputHash !== inputHash)
      throw new HttpError(409, "IDEMPOTENCY_CONFLICT");
    if (inserted.length)
      await append(tx, row, owner, null, {
        baseWorkRevision: row.baseWorkRevision,
      });
    return project(row);
  });
}
export async function listEditSuggestions(
  input: unknown,
  headers: Headers,
  admin = false,
) {
  const owner = await actor(headers, admin);
  const { page, pageSize } = editSuggestionPageSchema.parse(input);
  return getDatabase().transaction(
    async (tx) => {
      const where = admin ? undefined : eq(editSuggestions.ownerUserId, owner);
      const [count] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(editSuggestions)
        .where(where);
      const rows = await tx
        .select()
        .from(editSuggestions)
        .where(where)
        .orderBy(desc(editSuggestions.createdAt), desc(editSuggestions.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      return {
        items: rows.map(project),
        total: count?.total ?? 0,
        page,
        pageSize,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function getOwnedEditSuggestion(
  suggestionId: string,
  headers: Headers,
) {
  const owner = await actor(headers);
  const id = z.uuid().parse(suggestionId);
  return getDatabase().transaction(
    async (tx) => {
      const [row] = await tx
        .select()
        .from(editSuggestions)
        .where(
          and(
            eq(editSuggestions.id, id),
            eq(editSuggestions.ownerUserId, owner),
          ),
        );
      if (!row) throw new HttpError(404, "SUGGESTION_NOT_FOUND");
      const events = await tx
        .select({
          revision: editSuggestionEvents.revision,
          fromState: editSuggestionEvents.fromState,
          toState: editSuggestionEvents.toState,
          payload: editSuggestionEvents.payload,
          createdAt: editSuggestionEvents.createdAt,
        })
        .from(editSuggestionEvents)
        .where(eq(editSuggestionEvents.suggestionId, id))
        .orderBy(editSuggestionEvents.revision);
      return {
        ...project(row),
        events: events.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
        })),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function reviewEditSuggestion(
  suggestionId: string,
  input: unknown | (() => Promise<unknown>),
  headers: Headers,
) {
  const admin = await actor(headers, true);
  await limitCatalogMutation(admin);
  const id = z.uuid().parse(suggestionId);
  const value = reviewEditSuggestionSchema.parse(
    typeof input === "function" ? await input() : input,
  );
  return getDatabase().transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(editSuggestions)
      .where(eq(editSuggestions.id, id))
      .for("update");
    if (!previous) throw new HttpError(404, "SUGGESTION_NOT_FOUND");
    if (
      previous.state !== "SUBMITTED" ||
      previous.revision !== value.revision ||
      previous.baseWorkRevision !== value.baseWorkRevision
    )
      throw new HttpError(409, "REVISION_CONFLICT");
    let appliedWorkRevision: number | null = null;
    if (value.decision === "APPROVE") {
      const [work] = await tx
        .select()
        .from(works)
        .where(eq(works.id, previous.workId))
        .for("update");
      if (
        !work ||
        work.visibility !== "PUBLISHED" ||
        work.revision !== previous.baseWorkRevision
      )
        throw new HttpError(409, "WORK_REVISION_CONFLICT");
      const current = (await loadWork(tx, work.id, "en", true)) as AdminWork;
      const next = applyReviewedSuggestion(
        current,
        editSuggestionPatchSchema.parse(previous.proposed),
        sourceSchema.parse(previous.citation),
      );
      // Match V1's audit budget before invoking its transaction-local writer.
      if (Buffer.byteLength(JSON.stringify(next), "utf8") > 60000)
        throw new HttpError(400, "PAYLOAD_TOO_LARGE");
      await saveWorkInTransaction(tx, next, admin, work.id, work.revision);
      appliedWorkRevision = work.revision + 1;
    }
    const [row] = await tx
      .update(editSuggestions)
      .set({
        state: value.decision === "APPROVE" ? "APPROVED" : "REJECTED",
        revision: previous.revision + 1,
        reviewReason: value.reason,
        appliedWorkRevision,
        updatedAt: new Date(),
      })
      .where(eq(editSuggestions.id, id))
      .returning();
    // No user input/citation/reason/identity is copied into event payloads.
    await append(tx, row, admin, previous.state, {
      baseWorkRevision: previous.baseWorkRevision,
      appliedWorkRevision,
      ...(value.decision === "APPROVE"
        ? {
            metadataReviewAcknowledged: true,
            publicationReviewAcknowledged: true,
          }
        : {}),
    });
    return project(row);
  });
}
