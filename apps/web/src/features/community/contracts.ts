import { z } from "zod";
import {
  COMMUNITY_CONTENT_KINDS,
  COMMUNITY_REPORT_REASONS,
  COMMUNITY_MODERATION_ACTION_KINDS,
  COMMUNITY_LIMITS,
} from "@taleatlas/database/community-types";

/** Reject accessors/prototypes before validation can execute user code. JSON values only. */
function isPlainData(
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
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (
      !("value" in descriptor) ||
      !isPlainData(descriptor.value, seen, depth + 1)
    )
      return false;
  }
  seen.delete(value);
  return true;
}
const dataOnly = z.unknown().superRefine((value, context) => {
  if (!isPlainData(value))
    context.addIssue({
      code: "custom",
      message: "Plain data required",
      fatal: true,
    });
});
const guarded = <T extends z.ZodType>(schema: T) => dataOnly.pipe(schema);
export const communityUuidSchema = z
  .uuid()
  .transform((value) => value.toLowerCase());
const revision = z.number().int().min(1).max(2_147_483_647);
// Tabs/newlines are allowed only in multiline fields. Reject controls BEFORE trim/NFC.
function plainText(min: number, max: number, bytes: number, multiline = false) {
  return z
    .string()
    .refine(
      (value) =>
        !(
          multiline
            ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
            : /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
        ).test(value),
      "Unsafe control",
    )
    .refine(
      (value) =>
        !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(
          value,
        ),
      "Invalid Unicode",
    )
    .transform((value) => value.normalize("NFC").trim())
    .pipe(
      z
        .string()
        .refine(
          (value) => value.length >= min && value.length <= max,
          "UTF-16 text bound",
        ),
    )
    .refine(
      (value) => new TextEncoder().encode(value).length <= bytes,
      "Text byte bound",
    );
}
const L = COMMUNITY_LIMITS;
const context = plainText(1, L.contextLength, L.contextBytes).nullable();
const body = plainText(1, L.bodyLength, L.bodyBytes, true);
const thread = {
  title: plainText(1, L.titleLength, L.titleBytes),
  body,
  titleSpoiler: z.boolean(),
  bodySpoiler: z.boolean(),
  spoilerContext: context,
};
const reply = {
  body: plainText(1, L.replyLength, L.replyBytes, true),
  bodySpoiler: z.boolean(),
  spoilerContext: context,
};
const review = {
  body: plainText(L.reviewMinLength, L.bodyLength, L.bodyBytes, true),
  bodySpoiler: z.boolean(),
  spoilerContext: context,
  rating: z.number().int().min(L.ratingMin).max(L.ratingMax).nullable(),
};
const publicIntent = { publicSubmissionAcknowledged: z.literal(true) };
const mutation = { mutationKey: communityUuidSchema };
function spoilerCheck(
  value: {
    spoilerContext: string | null;
    bodySpoiler: boolean;
    titleSpoiler?: boolean;
  },
  context: z.RefinementCtx,
) {
  if (
    value.spoilerContext !== null &&
    !value.bodySpoiler &&
    !value.titleSpoiler
  )
    context.addIssue({
      code: "custom",
      path: ["spoilerContext"],
      message: "Context requires spoiler flag",
    });
}
const threadCreate = z
  .object({ ...thread, ...publicIntent, ...mutation })
  .strict()
  .superRefine(spoilerCheck);
const replyCreate = z
  .object({
    ...reply,
    ...publicIntent,
    ...mutation,
    threadId: communityUuidSchema,
    parentId: communityUuidSchema.nullable(),
    depth: z.number().int().min(0).max(L.replyMaxDepth),
  })
  .strict()
  .superRefine((v, c) => {
    spoilerCheck(v, c);
    if ((v.depth === 0) !== (v.parentId === null))
      c.addIssue({
        code: "custom",
        path: ["parentId"],
        message: "Parent/depth mismatch",
      });
  });
const reviewCreate = z
  .object({ ...review, ...publicIntent, ...mutation })
  .strict()
  .superRefine(spoilerCheck);
const edit = z
  .discriminatedUnion("contentKind", [
    z
      .object({
        contentKind: z.literal("THREAD"),
        ...thread,
        ...publicIntent,
        ...mutation,
        expectedRevision: revision,
      })
      .strict(),
    z
      .object({
        contentKind: z.literal("REPLY"),
        ...reply,
        ...publicIntent,
        ...mutation,
        expectedRevision: revision,
      })
      .strict(),
    z
      .object({
        contentKind: z.literal("REVIEW"),
        ...review,
        ...publicIntent,
        ...mutation,
        expectedRevision: revision,
      })
      .strict(),
  ])
  .superRefine(spoilerCheck);
const withdraw = z
  .object({
    ...mutation,
    contentKind: z.enum(COMMUNITY_CONTENT_KINDS),
    expectedRevision: revision,
  })
  .strict();
const explanation = plainText(0, L.reasonLength, L.reasonBytes, true);
const report = z
  .object({
    ...mutation,
    contentKind: z.enum(COMMUNITY_CONTENT_KINDS),
    expectedRevision: revision,
    reason: z.enum(COMMUNITY_REPORT_REASONS),
    explanation,
  })
  .strict()
  .superRefine((v, c) => {
    if (v.reason === "OTHER" && v.explanation.length < 3)
      c.addIssue({
        code: "custom",
        path: ["explanation"],
        message: "Explain OTHER",
      });
  });
const moderation = z
  .object({
    ...mutation,
    action: z.enum(COMMUNITY_MODERATION_ACTION_KINDS),
    contentKind: z.enum(COMMUNITY_CONTENT_KINDS),
    expectedRevision: revision,
    reportId: communityUuidSchema.nullable(),
    expectedReportRevision: revision.nullable(),
    reason: plainText(1, L.reasonLength, L.reasonBytes, true),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      (v.reportId === null) !== (v.expectedReportRevision === null) ||
      (v.action === "DISMISS" && v.reportId === null)
    )
      c.addIssue({
        code: "custom",
        path: ["reportId"],
        message: "Report revision scope required",
      });
  });
export const communityThreadCreateSchema = guarded(threadCreate);
export const communityReplyCreateSchema = guarded(replyCreate);
export const communityReviewCreateSchema = guarded(reviewCreate);
export const communityEditSchema = guarded(edit);
export const communityDeleteSchema = guarded(withdraw);
export const communityReportSchema = guarded(report);
export const communityModerationSchema = guarded(moderation);
export const communityRevealSchema = guarded(
  z
    .object({
      workId: communityUuidSchema,
      targetId: communityUuidSchema,
      contentKind: z.enum(COMMUNITY_CONTENT_KINDS),
      expectedRevision: revision,
      title: z.boolean(),
      body: z.boolean(),
      spoilerRevealAcknowledged: z.literal(true),
    })
    .strict()
    .superRefine((v, c) => {
      if ((!v.title && !v.body) || (v.title && v.contentKind !== "THREAD"))
        c.addIssue({ code: "custom", message: "Select applicable text" });
    }),
);
export const communityQuerySchema = guarded(
  z
    .object({
      locale: z.enum(["en", "vi"]),
      page: z.number().int().min(1).max(L.maxPage).optional(),
      cursor: z
        .object({
          timestamp: z.string().datetime({ offset: true }).max(35).nullable(),
          id: communityUuidSchema,
        })
        .strict()
        .optional(),
    })
    .strict()
    .superRefine((v, c) => {
      if (v.page !== undefined && v.cursor !== undefined)
        c.addIssue({ code: "custom", message: "Choose page or keyset" });
    }),
);
const commandSchemas = [
  z.object({ kind: z.literal("CREATE_THREAD"), input: threadCreate }).strict(),
  z.object({ kind: z.literal("CREATE_REPLY"), input: replyCreate }).strict(),
  z.object({ kind: z.literal("CREATE_REVIEW"), input: reviewCreate }).strict(),
  z.object({ kind: z.literal("EDIT"), input: edit }).strict(),
  z.object({ kind: z.literal("WITHDRAW"), input: withdraw }).strict(),
  z.object({ kind: z.literal("REPORT"), input: report }).strict(),
  ...COMMUNITY_MODERATION_ACTION_KINDS.map((kind) =>
    z
      .object({
        kind: z.literal(kind),
        input: moderation.refine((v) => v.action === kind, "Action mismatch"),
      })
      .strict(),
  ),
] as const;
export const communityCommandSchema = guarded(
  z.discriminatedUnion("kind", commandSchemas),
);
export type CommunityThreadCreateInput = z.infer<
  typeof communityThreadCreateSchema
>;
export type CommunityReplyCreateInput = z.infer<
  typeof communityReplyCreateSchema
>;
export type CommunityReviewCreateInput = z.infer<
  typeof communityReviewCreateSchema
>;
export type CommunityEditInput = z.infer<typeof communityEditSchema>;
export type CommunityDeleteInput = z.infer<typeof communityDeleteSchema>;
export type CommunityReportInput = z.infer<typeof communityReportSchema>;
export type CommunityModerationInput = z.infer<
  typeof communityModerationSchema
>;
export type CommunityQueryInput = z.infer<typeof communityQuerySchema>;
export type CommunityCommand = z.infer<typeof communityCommandSchema>;
export type CommunityRevealInput = z.infer<typeof communityRevealSchema>;
const canonicalSchema = guarded(
  z
    .object({
      actorId: z
        .string()
        .min(1)
        .max(256)
        .refine(
          (value) =>
            !/[\u0000-\u001f\u007f-\u009f]/u.test(value) &&
            new TextEncoder().encode(value).length <= 1024,
          "Invalid signed actor",
        ),
      workId: communityUuidSchema,
      targetId: communityUuidSchema.nullable(),
      command: communityCommandSchema,
    })
    .strict()
    .superRefine((v, c) => {
      if (v.command.kind.startsWith("CREATE_") !== (v.targetId === null))
        c.addIssue({
          code: "custom",
          path: ["targetId"],
          message: "Target scope mismatch",
        });
    }),
);
export type CanonicalPublicCommand = z.infer<typeof canonicalSchema>;
/** Pure hash input only: service hashes UTF-8 using Node SHA256, never JSON.stringify(raw). */
export function canonicalCommunityCommand(value: unknown): string {
  const parsed = canonicalSchema.parse(value);
  function encode(value: unknown): string {
    if (value === null || typeof value !== "object")
      return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(encode).join(",")}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${encode(record[key])}`)
      .join(",")}}`;
  }
  return encode(parsed);
}
