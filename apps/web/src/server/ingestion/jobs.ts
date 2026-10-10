import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@taleatlas/database/client";
import { ingestionJobs, providerRegistry } from "@taleatlas/database";
import {
  ProviderCapabilitySchema,
  ProviderPolicySchema,
} from "../../features/ingestion/providers";
import { getDatabase } from "../database";

export type DbTx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export const JOB_ERROR_CODES = [
  "PROVIDER_DISABLED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "INVALID_RESPONSE",
  "RATE_LIMITED",
  "PROCESSING_FAILED",
] as const;
export type JobErrorCode = (typeof JOB_ERROR_CODES)[number];
const uuid = z.uuid();
const ownerSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => value === value.trim());
const fenceSchema = z.strictObject({
  jobId: uuid,
  leaseToken: uuid,
  owner: ownerSchema,
});
// Wall-clock database time also fences transactions that waited on a row lock.
const dbNow = sql`clock_timestamp()`;
const clearLease = { leaseToken: null, leaseOwner: null, leaseExpiresAt: null };

export async function enqueueRequestJob(
  tx: DbTx,
  requestId: string,
  inputRevision: number,
) {
  const input = z
    .strictObject({
      requestId: uuid,
      inputRevision: z.number().int().min(1).max(2147483647),
    })
    .parse({ requestId, inputRevision });
  const key = `request:${input.requestId}:input${input.inputRevision}`;
  const [inserted] = await tx
    .insert(ingestionJobs)
    .values({
      requestId: input.requestId,
      expectedInputRevision: input.inputRevision,
      kind: "REQUEST_ENRICH",
      idempotencyKey: key,
    })
    .onConflictDoNothing({ target: ingestionJobs.idempotencyKey })
    .returning();
  if (inserted) return inserted;
  const [existing] = await tx
    .select()
    .from(ingestionJobs)
    .where(eq(ingestionJobs.idempotencyKey, key));
  if (!existing) throw new Error("JOB_ENQUEUE_FAILED");
  return existing;
}

export async function claimJobs(
  owner: string,
  limit: number,
  leaseSeconds: number,
  requestId?: string,
) {
  const input = z
    .strictObject({
      owner: ownerSchema,
      limit: z.number().int().min(1).max(10),
      leaseSeconds: z.number().int().min(5).max(120),
      requestId: uuid.optional(),
    })
    .parse({ owner, limit, leaseSeconds, requestId });
  return getDatabase().transaction(async (tx) => {
    // Maintenance is deliberately bounded, and locks jobs only (never requests).
    const exhausted = await tx
      .select({ id: ingestionJobs.id })
      .from(ingestionJobs)
      .where(
        and(
          input.requestId
            ? eq(ingestionJobs.requestId, input.requestId)
            : undefined,
          eq(ingestionJobs.state, "RUNNING"),
          lte(ingestionJobs.leaseExpiresAt, dbNow),
          sql`${ingestionJobs.attempts} >= ${ingestionJobs.maxAttempts}`,
        ),
      )
      .orderBy(ingestionJobs.leaseExpiresAt, ingestionJobs.id)
      .limit(10)
      .for("update", { skipLocked: true });
    if (exhausted.length)
      await tx
        .update(ingestionJobs)
        .set({
          state: "DEAD_LETTER",
          ...clearLease,
          lastErrorCode: "PROCESSING_FAILED",
          completedAt: dbNow,
          updatedAt: dbNow,
        })
        .where(
          inArray(
            ingestionJobs.id,
            exhausted.map((row) => row.id),
          ),
        );
    const due = await tx
      .select()
      .from(ingestionJobs)
      .where(
        and(
          input.requestId
            ? eq(ingestionJobs.requestId, input.requestId)
            : undefined,
          lt(ingestionJobs.attempts, ingestionJobs.maxAttempts),
          or(
            and(
              inArray(ingestionJobs.state, ["QUEUED", "RETRY_WAIT"]),
              lte(ingestionJobs.runAfter, dbNow),
            ),
            and(
              eq(ingestionJobs.state, "RUNNING"),
              lte(ingestionJobs.leaseExpiresAt, dbNow),
            ),
          ),
        ),
      )
      .orderBy(ingestionJobs.runAfter, ingestionJobs.id)
      .limit(input.limit)
      .for("update", { skipLocked: true });
    const claimed: (typeof ingestionJobs.$inferSelect)[] = [];
    for (const job of due) {
      const [row] = await tx
        .update(ingestionJobs)
        .set({
          state: "RUNNING",
          attempts: sql`${ingestionJobs.attempts} + 1`,
          leaseToken: randomUUID(),
          leaseOwner: input.owner,
          leaseExpiresAt: sql`${dbNow} + ${input.leaseSeconds} * interval '1 second'`,
          completedAt: null,
          updatedAt: dbNow,
        })
        .where(eq(ingestionJobs.id, job.id))
        .returning();
      claimed.push(row!);
    }
    return claimed;
  });
}

function liveFence(input: z.infer<typeof fenceSchema>) {
  return and(
    eq(ingestionJobs.id, input.jobId),
    eq(ingestionJobs.state, "RUNNING"),
    eq(ingestionJobs.leaseToken, input.leaseToken),
    eq(ingestionJobs.leaseOwner, input.owner),
    gt(ingestionJobs.leaseExpiresAt, dbNow),
  );
}
// Caller acquiring a request lock must do so BEFORE this job lock.
export async function lockLiveJobInTransaction(
  tx: DbTx,
  jobId: string,
  leaseToken: string,
  owner: string,
) {
  const input = fenceSchema.parse({ jobId, leaseToken, owner });
  await tx
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.id, input.jobId))
    .for("update");
  const [job] = await tx.select().from(ingestionJobs).where(liveFence(input));
  return job ?? null;
}
export async function stopJobInTransaction(
  tx: DbTx,
  jobId: string,
  leaseToken: string,
  owner: string,
  outcome: "OBSOLETE" | "PROVIDER_DISABLED",
): Promise<boolean> {
  const input = fenceSchema.parse({ jobId, leaseToken, owner });
  if (!(await lockLiveJobInTransaction(tx, jobId, leaseToken, owner)))
    return false;
  const rows = await tx
    .update(ingestionJobs)
    .set({
      state: outcome === "PROVIDER_DISABLED" ? "DEAD_LETTER" : "CANCELLED",
      ...clearLease,
      lastErrorCode:
        outcome === "PROVIDER_DISABLED" ? "PROVIDER_DISABLED" : null,
      completedAt: dbNow,
      updatedAt: dbNow,
    })
    .where(liveFence(input))
    .returning({ id: ingestionJobs.id });
  return rows.length === 1;
}
export async function completeJobInTransaction(
  tx: DbTx,
  jobId: string,
  leaseToken: string,
  owner: string,
): Promise<boolean> {
  const input = fenceSchema.parse({ jobId, leaseToken, owner });
  if (!(await lockLiveJobInTransaction(tx, jobId, leaseToken, owner)))
    return false;
  const rows = await tx
    .update(ingestionJobs)
    .set({
      state: "SUCCEEDED",
      ...clearLease,
      lastErrorCode: null,
      completedAt: dbNow,
      updatedAt: dbNow,
    })
    .where(liveFence(input))
    .returning({ id: ingestionJobs.id });
  return rows.length === 1;
}
export async function completeJob(
  jobId: string,
  leaseToken: string,
  owner: string,
): Promise<boolean> {
  fenceSchema.parse({ jobId, leaseToken, owner });
  return getDatabase().transaction((tx) =>
    completeJobInTransaction(tx, jobId, leaseToken, owner),
  );
}
export async function failJob(
  jobId: string,
  leaseToken: string,
  owner: string,
  errorCode: JobErrorCode,
): Promise<boolean> {
  const input = fenceSchema.parse({ jobId, leaseToken, owner });
  const code = z.enum(JOB_ERROR_CODES).parse(errorCode);
  return getDatabase().transaction(async (tx) => {
    // Separate statement ensures the clock fence runs after any lock wait.
    await tx
      .select({ id: ingestionJobs.id })
      .from(ingestionJobs)
      .where(eq(ingestionJobs.id, input.jobId))
      .for("update");
    const rows = await tx
      .update(ingestionJobs)
      .set({
        state: sql`CASE WHEN ${ingestionJobs.attempts} >= ${ingestionJobs.maxAttempts} THEN 'DEAD_LETTER'::ingestion_job_state ELSE 'RETRY_WAIT'::ingestion_job_state END`,
        ...clearLease,
        lastErrorCode: code,
        runAfter: sql`${dbNow} + least(3600, 30 * power(2, greatest(0, ${ingestionJobs.attempts} - 1))) * interval '1 second'`,
        completedAt: sql`CASE WHEN ${ingestionJobs.attempts} >= ${ingestionJobs.maxAttempts} THEN ${dbNow} ELSE NULL END`,
        updatedAt: dbNow,
      })
      .where(liveFence(input))
      .returning({ id: ingestionJobs.id });
    return rows.length === 1;
  });
}

export type ProviderBudgetResult =
  | { allowed: true; timeoutMs: number }
  | { allowed: false; errorCode: "PROVIDER_DISABLED" | "RATE_LIMITED" };
export async function reserveProviderBudget(
  providerId: string,
  capability: string,
): Promise<ProviderBudgetResult> {
  const id = z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .parse(providerId);
  const requested = ProviderCapabilitySchema.parse(capability);
  return getDatabase().transaction(
    async (tx): Promise<ProviderBudgetResult> => {
      const [provider] = await tx
        .select()
        .from(providerRegistry)
        .where(eq(providerRegistry.id, id))
        .for("update");
      if (!provider || !provider.enabled)
        return { allowed: false, errorCode: "PROVIDER_DISABLED" };
      const parsed = ProviderPolicySchema.safeParse(provider.policy);
      if (!parsed.success)
        return { allowed: false, errorCode: "PROVIDER_DISABLED" };
      const policy = parsed.data;
      if (
        policy.providerId.toLowerCase().replaceAll("_", "-") !== id ||
        !policy.enabled ||
        policy.reviewStatus !== "REVIEWED" ||
        !policy.metadataStorageAllowed ||
        !policy.capabilities.includes(requested) ||
        !policy.rateLimit
      )
        return { allowed: false, errorCode: "PROVIDER_DISABLED" };
      const { maxRequests, intervalSeconds } = policy.rateLimit;
      const reset = sql`(${providerRegistry.windowStartedAt} IS NULL OR ${providerRegistry.windowStartedAt} + ${intervalSeconds} * interval '1 second' <= ${dbNow})`;
      const rows = await tx
        .update(providerRegistry)
        .set({
          requestsInWindow: sql`CASE WHEN ${reset} THEN 1 ELSE ${providerRegistry.requestsInWindow} + 1 END`,
          windowStartedAt: sql`CASE WHEN ${reset} THEN ${dbNow} ELSE ${providerRegistry.windowStartedAt} END`,
          updatedAt: dbNow,
        })
        .where(
          and(
            eq(providerRegistry.id, id),
            or(reset, lt(providerRegistry.requestsInWindow, maxRequests)),
          ),
        )
        .returning({ id: providerRegistry.id });
      return rows.length
        ? { allowed: true, timeoutMs: policy.timeoutMs }
        : { allowed: false, errorCode: "RATE_LIMITED" };
    },
  );
}
