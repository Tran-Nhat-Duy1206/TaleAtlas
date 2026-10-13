import { z } from "zod";
import { COMMUNITY_LIMITS as L } from "@taleatlas/database/community-types";
import {
  communityUuidSchema,
  communityReviewCreateSchema,
  communityEditSchema,
  communityDeleteSchema,
  communityRevealSchema,
} from "./contracts";
import {
  parseDiscussionQuery,
  parseCommunityOwnedQuery,
  strictCommunitySearchParams,
  validatedCommunityResponse,
} from "./http-contracts";

// Never evaluate accessors on untrusted input, including response-validation inputs.
function plainData(
  value: unknown,
  seen = new Set<object>(),
  depth = 0,
): boolean {
  if (
    value === null ||
    ["string", "boolean", "number", "undefined"].includes(typeof value)
  )
    return true;
  if (typeof value !== "object" || depth > 12 || seen.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (
    prototype !== Object.prototype &&
    prototype !== null &&
    !Array.isArray(value)
  )
    return false;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (
      typeof key !== "string" ||
      !("value" in descriptor) ||
      !plainData(descriptor.value, seen, depth + 1)
    )
      return false;
  }
  seen.delete(value);
  return true;
}
const dataOnly = z.unknown().superRefine((value, context) => {
  if (!plainData(value))
    context.addIssue({
      code: "custom",
      message: "Plain data required",
      fatal: true,
    });
});
const guarded = <T extends z.ZodType>(schema: T) => dataOnly.pipe(schema);
const uuid = communityUuidSchema;
const revision = z.number().int().min(1).max(2_147_483_647);
const rating = z.number().int().min(2).max(10).nullable();
const locale = z.enum(["en", "vi"]);
// Omitted rating is independent/unrated, never a private-library lookup or prefill.
export const reviewCreateSchema = dataOnly
  .transform((value) => {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !Object.hasOwn(value, "rating")
    )
      return { ...value, rating: null };
    return value;
  })
  .pipe(communityReviewCreateSchema);
export const reviewEditSchema = communityEditSchema.transform(
  (value, context) => {
    if (value.contentKind !== "REVIEW") {
      context.addIssue({ code: "custom", message: "Review kind required" });
      return z.NEVER;
    }
    return value;
  },
);
export const reviewWithdrawSchema = communityDeleteSchema
  .refine((value) => value.contentKind === "REVIEW", "Review kind required")
  .transform((value) => ({
    ...value,
    contentKind: z.literal("REVIEW").parse(value.contentKind),
  }));
export const reviewRevealSchema = communityRevealSchema
  .refine(
    (value) => value.contentKind === "REVIEW" && !value.title && value.body,
    "Review body required",
  )
  .transform((value) => ({
    ...value,
    contentKind: z.literal("REVIEW").parse(value.contentKind),
  }));
function text(min: number, max: number, bytes: number, multiline = false) {
  return z.string().refine(
    (value) =>
      // Locked bounds count UTF-16 units; Zod 4 string min/max count code points.
      value.length >= min &&
      value.length <= max &&
      !(
        multiline
          ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
          : /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
      ).test(value) &&
      !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(
        value,
      ) &&
      value.trim().length >= min &&
      new TextEncoder().encode(value).length <= bytes,
    "Invalid plain text",
  );
}
const body = text(L.reviewMinLength, L.bodyLength, L.bodyBytes, true);
const unavailable = z
  .object({ state: z.literal("UNAVAILABLE"), text: z.null() })
  .strict();
const topology = {
  id: uuid,
  workId: uuid,
  kind: z.literal("REVIEW"),
  threadId: z.null(),
  parentId: z.null(),
  depth: z.null(),
  revision,
};
const timestamp = z.string().max(35).datetime({ offset: true });
export const reviewPublicSchema = guarded(
  z
    .object({
      ...topology,
      state: z.enum(["ACTIVE", "DELETED", "ERASED", "HIDDEN"]),
      title: unavailable,
      body: z.discriminatedUnion("state", [
        z.object({ state: z.literal("VISIBLE"), text: body }).strict(),
        z.object({ state: z.literal("MASKED"), text: z.null() }).strict(),
        unavailable,
      ]),
      spoilerContext: z.null(),
      ratingHalfStars: rating,
      author: z
        .object({ displayName: text(1, 160, 640) })
        .strict()
        .nullable(),
      createdAt: timestamp.nullable(),
      editedAt: timestamp.nullable(),
      lastActivityAt: timestamp.nullable(),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.state === "ACTIVE"
          ? value.body.state === "UNAVAILABLE" ||
            value.createdAt === null ||
            value.lastActivityAt === null
          : value.body.state !== "UNAVAILABLE" ||
            value.ratingHalfStars !== null ||
            value.author !== null ||
            value.createdAt !== null ||
            value.editedAt !== null ||
            value.lastActivityAt !== null
      )
        context.addIssue({
          code: "custom",
          message: "Invalid review projection",
        });
    }),
);
export const reviewOwnedSchema = guarded(
  z
    .object({
      ...topology,
      authorState: z.enum(["ACTIVE", "DELETED", "ERASED"]),
      moderationState: z.enum(["VISIBLE", "HIDDEN"]),
      workAvailable: z.boolean(),
      canEdit: z.boolean(),
      canWithdraw: z.boolean(),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        (value.canEdit &&
          (!value.workAvailable ||
            value.authorState !== "ACTIVE" ||
            value.moderationState !== "VISIBLE" ||
            value.revision === 2_147_483_647)) ||
        (value.canWithdraw &&
          (value.authorState !== "ACTIVE" || value.revision === 2_147_483_647))
      )
        context.addIssue({
          code: "custom",
          message: "Invalid owner capabilities",
        });
    }),
);
export const reviewStatisticsSchema = guarded(
  z
    .object({
      reviewCount: z.number().int().min(0).max(L.maxReviewsPerWork),
      ratedReviewCount: z.number().int().min(0).max(L.maxReviewsPerWork),
      meanRating: z.number().finite().min(1).max(5).nullable(),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.ratedReviewCount > value.reviewCount ||
        (value.meanRating === null) !== (value.ratedReviewCount === 0)
      )
        context.addIssue({
          code: "custom",
          message: "Invalid review statistics",
        });
    }),
);
/** Typed SQL driver values must be exact bounded integers; never return the internal sum. */
export function reviewStatisticsFromAggregate(value: {
  reviewCount: unknown;
  ratedReviewCount: unknown;
  ratingSum: unknown;
}): ReviewStatisticsDTO {
  const exact = (input: unknown) => {
    if (
      typeof input !== "number" &&
      !(typeof input === "string" && /^(0|[1-9]\d*)$/.test(input))
    )
      throw new Error("Invalid review aggregate");
    const number = Number(input);
    if (!Number.isSafeInteger(number) || number < 0)
      throw new Error("Invalid review aggregate");
    return number;
  };
  const reviewCount = exact(value.reviewCount),
    ratedReviewCount = exact(value.ratedReviewCount),
    sum = exact(value.ratingSum);
  if (sum < 2 * ratedReviewCount || sum > 10 * ratedReviewCount)
    throw new Error("Invalid review aggregate");
  return validatedCommunityResponse(reviewStatisticsSchema, {
    reviewCount,
    ratedReviewCount,
    meanRating: ratedReviewCount === 0 ? null : sum / (2 * ratedReviewCount),
  });
}
export const reviewListResponseSchema = guarded(
  z
    .object({
      items: z.array(reviewPublicSchema).max(L.pageSize),
      pageSize: z.literal(25),
      statistics: reviewStatisticsSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.items.some((item) => item.state !== "ACTIVE") ||
        value.items.length > value.statistics.reviewCount ||
        value.items.filter((item) => item.ratingHalfStars !== null).length >
          value.statistics.ratedReviewCount
      )
        context.addIssue({ code: "custom", message: "Incoherent review list" });
    }),
);
export const reviewMutationResponseSchema = guarded(
  z.object({ content: reviewPublicSchema, replayed: z.boolean() }).strict(),
);
export const reviewRevealResponseSchema = guarded(
  z
    .object({
      id: uuid,
      workId: uuid,
      kind: z.literal("REVIEW"),
      revision,
      body,
      spoilerContext: text(1, L.contextLength, L.contextBytes).optional(),
    })
    .strict(),
);
export const reviewOwnedListResponseSchema = guarded(
  z
    .object({
      items: z.array(reviewOwnedSchema).max(L.pageSize),
      pageSize: z.literal(25),
    })
    .strict(),
);
export const reviewSlotResponseSchema = guarded(
  z.object({ item: reviewOwnedSchema.nullable() }).strict(),
);
export const reviewOwnedContextQuerySchema = guarded(
  z.object({ locale, contentKind: z.literal("REVIEW") }).strict(),
);
export const parseReviewQuery = parseDiscussionQuery;
export const parseReviewOwnedQuery = parseCommunityOwnedQuery;
export function parseReviewOwnedContextQuery(url: string) {
  const value = strictCommunitySearchParams(url, ["locale", "contentKind"]);
  return reviewOwnedContextQuerySchema.parse({
    ...value,
    locale: value.locale ?? "en",
  });
}
export function parseReviewSlotQuery(url: string) {
  const value = strictCommunitySearchParams(url, ["locale"]);
  return guarded(z.object({ locale }).strict()).parse({
    locale: value.locale ?? "en",
  });
}
export function requireReviewScope(
  value: { id: string; workId: string; kind: string },
  workId: string,
  targetId?: string,
): void {
  if (
    value.kind !== "REVIEW" ||
    value.workId !== uuid.parse(workId) ||
    (targetId !== undefined && value.id !== uuid.parse(targetId))
  )
    throw new Error("Invalid review response scope");
}
export function reviewHttpMutation(
  value: unknown,
  workId: string,
  targetId?: string,
) {
  const foundation = validatedCommunityResponse(
    guarded(
      z
        .object({
          content: reviewPublicSchema,
          replayed: z.boolean(),
          report: z.null(),
        })
        .strict(),
    ),
    value,
  );
  const result = validatedCommunityResponse(reviewMutationResponseSchema, {
    content: foundation.content,
    replayed: foundation.replayed,
  });
  requireReviewScope(result.content, workId, targetId);
  return result;
}
export function reviewHttpReveal(
  value: unknown,
  selection: z.infer<typeof reviewRevealSchema>,
) {
  const result = validatedCommunityResponse(reviewRevealResponseSchema, value);
  requireReviewScope(result, selection.workId, selection.targetId);
  if (
    result.revision !== selection.expectedRevision ||
    selection.title ||
    !selection.body
  )
    throw new Error("Invalid review reveal scope");
  return result;
}
export type ReviewPublicDTO = z.infer<typeof reviewPublicSchema>;
export type ReviewOwnedDTO = z.infer<typeof reviewOwnedSchema>;
export type ReviewStatisticsDTO = z.infer<typeof reviewStatisticsSchema>;
export type ReviewListResponseDTO = z.infer<typeof reviewListResponseSchema>;
export type ReviewOwnedListResponseDTO = z.infer<
  typeof reviewOwnedListResponseSchema
>;
export type ReviewMutationResponseDTO = z.infer<
  typeof reviewMutationResponseSchema
>;
export type ReviewRevealResponseDTO = z.infer<
  typeof reviewRevealResponseSchema
>;
export type ReviewSlotResponseDTO = z.infer<typeof reviewSlotResponseSchema>;
export type ReviewCreateInput = z.infer<typeof reviewCreateSchema>;
export type ReviewEditInput = z.infer<typeof reviewEditSchema>;
