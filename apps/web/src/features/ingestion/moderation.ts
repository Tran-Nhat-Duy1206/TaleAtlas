import { z } from "zod";
import { workInputSchema } from "../catalog/contracts";

const revision = z.number().int().positive();
const base = {
  revision,
  reason: z.string().trim().min(1).max(2000),
};
const candidate = {
  inputRevision: revision,
  candidateId: z.uuid(),
  identityReviewAcknowledged: z.literal(true),
};
/** Decisions are explicit human input; no candidate-to-Work conversion exists. */
export const requestReviewSchema = z
  .discriminatedUnion("action", [
    z.strictObject({
      action: z.literal("APPROVE"),
      ...base,
      ...candidate,
      publicationReviewAcknowledged: z.literal(true),
      work: workInputSchema.refine((work) => work.visibility === "PUBLISHED", {
        message: "Approval requires a published, manually verified Work",
      }),
    }),
    z.strictObject({
      action: z.literal("LINK"),
      ...base,
      ...candidate,
      workId: z.uuid(),
      workRevision: revision,
    }),
    z.strictObject({
      action: z.literal("REJECT"),
      ...base,
      candidateId: z.uuid().optional(),
    }),
    z.strictObject({
      action: z.literal("NEEDS_INFO"),
      ...base,
      candidateId: z.uuid().optional(),
    }),
  ])
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).length <= 60000,
    "Review payload too large",
  );
export type RequestReview = z.infer<typeof requestReviewSchema>;

/** Minimal decision DTO: excludes owner identity, raw input, matches and candidate facts. */
export const requestReviewRecordSchema = z
  .strictObject({
    id: z.uuid(),
    state: z.enum(["APPROVED", "LINKED_EXISTING", "REJECTED", "NEEDS_INFO"]),
    revision,
    inputRevision: revision,
    resultingWorkId: z.uuid().nullable(),
  })
  .refine((record) =>
    ["APPROVED", "LINKED_EXISTING"].includes(record.state)
      ? record.resultingWorkId !== null
      : record.resultingWorkId === null,
  );
export type RequestReviewRecord = z.infer<typeof requestReviewRecordSchema>;
