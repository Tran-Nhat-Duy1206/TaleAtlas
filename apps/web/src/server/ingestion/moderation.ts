import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  ingestionCandidates,
  ingestionJobs,
  workRequests,
  works,
} from "@taleatlas/database";
import {
  requestReviewSchema,
  requestReviewRecordSchema,
  type RequestReview,
} from "../../features/ingestion/moderation";
import { NormalizedCandidateSchema } from "../../features/ingestion/pipeline";
import { canTransitionRequest } from "../../features/ingestion/contracts";
import { requireRole } from "../session";
import { HttpError, limitCatalogMutation } from "../http";
import { getDatabase } from "../database";
import { saveWorkInTransaction } from "../catalog/repository";
import { appendRequestEvent, lockRequest } from "./requests";

async function applyReview(
  requestId: string,
  actorId: string,
  value: RequestReview,
) {
  return getDatabase().transaction(async (tx) => {
    // Request first, then Work/jobs: matches amendments and C processing fences.
    const previous = await lockRequest(tx, requestId);
    if (previous.revision !== value.revision)
      throw new HttpError(409, "REVISION_CONFLICT");
    const state =
      value.action === "APPROVE"
        ? "APPROVED"
        : value.action === "LINK"
          ? "LINKED_EXISTING"
          : value.action === "REJECT"
            ? "REJECTED"
            : "NEEDS_INFO";
    if (!canTransitionRequest(previous.state, state))
      throw new HttpError(409, "INVALID_TRANSITION");

    if (value.candidateId) {
      const [snapshot] = await tx
        .select()
        .from(ingestionCandidates)
        .where(
          and(
            eq(ingestionCandidates.id, value.candidateId),
            eq(ingestionCandidates.requestId, requestId),
            eq(ingestionCandidates.inputRevision, previous.inputRevision),
          ),
        );
      if (!snapshot) throw new HttpError(409, "CANDIDATE_CONFLICT");
      const parsed = NormalizedCandidateSchema.safeParse(snapshot.candidate);
      if (!parsed.success) throw new HttpError(409, "CANDIDATE_CONFLICT");
      if (parsed.data.origin === "REQUEST_INPUT") {
        const evidence = parsed.data.provenance[0];
        if (
          evidence.sourceKind !== "REQUEST_INPUT" ||
          evidence.requestId !== requestId ||
          evidence.inputRevision !== previous.inputRevision
        )
          throw new HttpError(409, "CANDIDATE_CONFLICT");
      }
    }
    let resultingWorkId: string | null = null;
    if (value.action === "APPROVE" || value.action === "LINK") {
      if (
        previous.state !== "NEEDS_REVIEW" ||
        previous.inputRevision !== value.inputRevision
      )
        throw new HttpError(409, "CANDIDATE_CONFLICT");
      if (value.action === "APPROVE") {
        // Only the supplied, V1-validated Work is written. Candidate facts stay private/inert.
        const work = await saveWorkInTransaction(tx, value.work, actorId);
        resultingWorkId = work.id;
      } else {
        const [work] = await tx
          .select()
          .from(works)
          .where(eq(works.id, value.workId))
          .for("update");
        if (
          !work ||
          work.visibility !== "PUBLISHED" ||
          work.revision !== value.workRevision
        )
          throw new HttpError(409, "WORK_CONFLICT");
        resultingWorkId = work.id;
      }
    }
    const [row] = await tx
      .update(workRequests)
      .set({
        state,
        resultingWorkId,
        revision: previous.revision + 1,
        updatedAt: sql`now()`,
      })
      .where(eq(workRequests.id, requestId))
      .returning();
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
    // Owner-visible immutable history includes the explanation and final target only.
    await appendRequestEvent(tx, row, actorId, "REVIEWED", previous.state, {
      reason: value.reason,
      resultingWorkId,
    });
    return requestReviewRecordSchema.parse({
      id: row.id,
      state: row.state,
      revision: row.revision,
      inputRevision: row.inputRevision,
      resultingWorkId: row.resultingWorkId,
    });
  });
}

/** Direct calls enforce the same actual session, role and write budget as HTTP calls. */
export async function reviewStoryRequest(
  requestId: string,
  input: unknown,
  headers: Headers,
) {
  const session = await requireRole(["admin"], headers);
  await limitCatalogMutation(session.user.id);
  const value = requestReviewSchema.parse(input);
  if (
    value.action === "APPROVE" &&
    Buffer.byteLength(JSON.stringify(value.work), "utf8") > 60000
  )
    throw new HttpError(400, "PAYLOAD_TOO_LARGE");
  return applyReview(z.uuid().parse(requestId), session.user.id, value);
}
