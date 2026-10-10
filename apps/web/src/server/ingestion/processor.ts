import "server-only";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ingestionJobs, workRequests } from "@taleatlas/database";
import { normalizeIngestionCandidate } from "../../features/ingestion/pipeline";
import { requestDetailsSchema } from "../../features/ingestion/contracts";
import { getDatabase } from "../database";
import { requireRole } from "../session";
import { limitCatalogMutation } from "../http";
import { appendRequestEvent } from "./requests";
import {
  claimJobs,
  completeJobInTransaction,
  lockLiveJobInTransaction,
  stopJobInTransaction,
  failJob,
} from "./jobs";
import { persistCandidate } from "./candidates";

export const processIngestionSchema = z.strictObject({
  limit: z.number().int().min(1).max(3).default(1),
  requestId: z.uuid().optional(),
});
type ClaimedJob = typeof ingestionJobs.$inferSelect;
class LostLease extends Error {}

/** One request-then-job transaction; all effects roll back if the final clock fence fails. */
export async function processClaimedJob(
  job: ClaimedJob,
  owner: string,
): Promise<"PROCESSED" | "STALE" | "DISABLED"> {
  if (!job.leaseToken) return "STALE";
  const token = job.leaseToken;
  try {
    return await getDatabase().transaction(async (tx) => {
      // Do not lock a job and then wait for its request: amendments use the opposite order.
      const [request] = job.requestId
        ? await tx
            .select()
            .from(workRequests)
            .where(eq(workRequests.id, job.requestId))
            .for("update")
        : [];
      const live = await lockLiveJobInTransaction(tx, job.id, token, owner);
      if (!live) return "STALE";
      if (live.kind !== "REQUEST_ENRICH") {
        // Discovery has no admitted live adapter in V2C. Terminal, no HTTP and no retry storm.
        if (
          !(await stopJobInTransaction(
            tx,
            job.id,
            token,
            owner,
            "PROVIDER_DISABLED",
          ))
        )
          throw new LostLease();
        return "DISABLED";
      }
      if (
        !request ||
        request.id !== live.requestId ||
        request.inputRevision !== live.expectedInputRevision ||
        request.state !== "SUBMITTED"
      ) {
        if (!(await stopJobInTransaction(tx, job.id, token, owner, "OBSOLETE")))
          throw new LostLease();
        return "STALE";
      }
      const candidate = normalizeIngestionCandidate({
        origin: "REQUEST_INPUT",
        requestId: request.id,
        inputRevision: request.inputRevision,
        details: requestDetailsSchema.parse(request.details),
      });
      const [enriching] = await tx
        .update(workRequests)
        .set({
          state: "ENRICHING",
          revision: request.revision + 1,
          updatedAt: sql`clock_timestamp()`,
        })
        .where(eq(workRequests.id, request.id))
        .returning();
      if (!enriching) throw new Error("REQUEST_PROCESS_FAILED");
      await appendRequestEvent(
        tx,
        enriching,
        null,
        "PROCESSING_STARTED",
        request.state,
        {
          jobId: job.id,
          inputRevision: request.inputRevision,
          processingStatus: "ENRICHING",
        },
      );
      await persistCandidate(
        tx,
        request.id,
        request.inputRevision,
        job.id,
        candidate,
      );
      const [review] = await tx
        .update(workRequests)
        .set({
          state: "NEEDS_REVIEW",
          revision: enriching.revision + 1,
          updatedAt: sql`clock_timestamp()`,
        })
        .where(eq(workRequests.id, request.id))
        .returning();
      if (!review) throw new Error("REQUEST_PROCESS_FAILED");
      await appendRequestEvent(
        tx,
        review,
        null,
        "PROCESSING_COMPLETED",
        "ENRICHING",
        {
          jobId: job.id,
          inputRevision: request.inputRevision,
          processingStatus: "NEEDS_REVIEW",
        },
      );
      // The final evaluation happens after all locks and work, on database wall-clock time.
      if (!(await completeJobInTransaction(tx, job.id, token, owner)))
        throw new LostLease();
      return "PROCESSED";
    });
  } catch (error) {
    if (error instanceof LostLease) return "STALE";
    throw error;
  }
}

export async function processIngestion(input: unknown, headers: Headers) {
  const session = await requireRole(["admin"], headers);
  await limitCatalogMutation(session.user.id);
  const value = processIngestionSchema.parse(input);
  const owner = `manual:${randomUUID()}`;
  const jobs = await claimJobs(owner, value.limit, 30, value.requestId);
  const result = {
    claimed: jobs.length,
    processed: 0,
    stale: 0,
    disabled: 0,
    failed: 0,
  };
  for (const job of jobs) {
    try {
      const status = await processClaimedJob(job, owner);
      if (status === "PROCESSED") result.processed++;
      else if (status === "DISABLED") result.disabled++;
      else result.stale++;
    } catch {
      // Sanitized retry only; never reject a human request or leak raw details.
      if (job.leaseToken)
        await failJob(job.id, job.leaseToken, owner, "PROCESSING_FAILED");
      result.failed++;
    }
  }
  return result;
}
