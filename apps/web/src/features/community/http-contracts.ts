import { z } from "zod";
import { COMMUNITY_LIMITS as L } from "@taleatlas/database/community-types";
import {
  communityThreadCreateSchema,
  communityReplyCreateSchema,
  communityEditSchema,
  communityDeleteSchema,
  communityRevealSchema,
  communityQuerySchema,
  communityOwnedQuerySchema,
  communityOwnedDetailQuerySchema,
  communityUuidSchema,
} from "./contracts";
import type { CommunityPublicDTO, CommunityRevealDTO } from "./projection";

const kind = z.enum(["THREAD", "REPLY"]);
/** V4B narrows the guarded foundation; REVIEW/rating never enter these adapters. */
export const discussionThreadCreateSchema = communityThreadCreateSchema;
export const discussionReplyCreateSchema = communityReplyCreateSchema;
export const discussionEditSchema = communityEditSchema.transform(
  (value, context) => {
    if (value.contentKind === "REVIEW") {
      context.addIssue({ code: "custom", message: "Discussion kind required" });
      return z.NEVER;
    }
    return value;
  },
);
export const discussionWithdrawSchema = communityDeleteSchema
  .refine((value) => value.contentKind !== "REVIEW", "Discussion kind required")
  .transform((value) => ({
    ...value,
    contentKind: kind.parse(value.contentKind),
  }));
export const discussionRevealSchema = communityRevealSchema
  .refine((value) => value.contentKind !== "REVIEW", "Discussion kind required")
  .transform((value) => ({
    ...value,
    contentKind: kind.parse(value.contentKind),
  }));
const uuid = communityUuidSchema;
const revision = z.number().int().min(1).max(2_147_483_647);
const timestamp = z.string().max(35).datetime({ offset: true });

// Do not run accessors while safe-parsing unknown network data or test inputs.
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
function text(max: number, bytes: number, multiline = false) {
  return z
    .string()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        !(
          multiline
            ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
            : /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
        ).test(value) &&
        !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(
          value,
        ) &&
        value.trim().length > 0 &&
        new TextEncoder().encode(value).length <= bytes,
      "Invalid plain text",
    );
}
const titleText = text(L.titleLength, L.titleBytes);
const bodyText = text(L.bodyLength, L.bodyBytes, true);
const contextText = text(L.contextLength, L.contextBytes);
const field = (schema: z.ZodString | ReturnType<typeof text>) =>
  z.discriminatedUnion("state", [
    z.object({ state: z.literal("VISIBLE"), text: schema }).strict(),
    z.object({ state: z.literal("MASKED"), text: z.null() }).strict(),
    z.object({ state: z.literal("UNAVAILABLE"), text: z.null() }).strict(),
  ]);
const topology = {
  id: uuid,
  workId: uuid,
  kind,
  threadId: uuid.nullable(),
  parentId: uuid.nullable(),
  depth: z.number().int().min(0).max(L.replyMaxDepth).nullable(),
  revision,
};
type DiscussionTopology = {
  [Key in keyof typeof topology]: z.infer<(typeof topology)[Key]>;
};
function topologyCheck(value: DiscussionTopology, context: z.RefinementCtx) {
  if (
    value.kind === "THREAD"
      ? value.threadId !== null ||
        value.parentId !== null ||
        value.depth !== null
      : value.threadId === null ||
        value.depth === null ||
        (value.depth === 0) !== (value.parentId === null) ||
        value.threadId === value.id ||
        value.parentId === value.id ||
        value.parentId === value.threadId
  ) {
    context.addIssue({
      code: "custom",
      message: "Invalid discussion topology",
    });
  }
}
export const discussionPublicSchema = guarded(
  z
    .object({
      ...topology,
      state: z.enum(["ACTIVE", "DELETED", "ERASED", "HIDDEN"]),
      title: field(titleText),
      body: field(bodyText),
      spoilerContext: z.null(),
      ratingHalfStars: z.null(),
      author: z
        .object({ displayName: text(160, 640) })
        .strict()
        .nullable(),
      createdAt: timestamp.nullable(),
      editedAt: timestamp.nullable(),
      lastActivityAt: timestamp.nullable(),
    })
    .strict()
    .superRefine((value, context) => {
      topologyCheck(value, context);
      if (
        value.kind === "REPLY" &&
        (value.title.state !== "UNAVAILABLE" ||
          (value.body.text !== null &&
            (value.body.text.length > L.replyLength ||
              new TextEncoder().encode(value.body.text).length > L.replyBytes)))
      ) {
        context.addIssue({
          code: "custom",
          message: "Invalid reply projection",
        });
      }
      if (value.state !== "ACTIVE") {
        if (
          value.title.state !== "UNAVAILABLE" ||
          value.body.state !== "UNAVAILABLE" ||
          value.author !== null ||
          value.createdAt !== null ||
          value.editedAt !== null ||
          value.lastActivityAt !== null
        ) {
          context.addIssue({
            code: "custom",
            message: "Nonlive projection must contain no authored data",
          });
        }
      } else if (
        value.body.state === "UNAVAILABLE" ||
        (value.kind === "THREAD" && value.title.state === "UNAVAILABLE") ||
        value.createdAt === null ||
        value.lastActivityAt === null
      ) {
        context.addIssue({
          code: "custom",
          message: "Incomplete live projection",
        });
      }
    }),
);
export const discussionListResponseSchema = guarded(
  z
    .object({
      items: z.array(discussionPublicSchema).max(L.pageSize),
      pageSize: z.literal(25),
    })
    .strict(),
);
export const discussionMutationResponseSchema = guarded(
  z
    .object({
      content: discussionPublicSchema,
      replayed: z.boolean(),
    })
    .strict(),
);
export const discussionRevealResponseSchema = guarded(
  z
    .object({
      id: uuid,
      workId: uuid,
      kind,
      revision,
      title: titleText.optional(),
      body: bodyText.optional(),
      spoilerContext: contextText.optional(),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        (value.title === undefined && value.body === undefined) ||
        (value.kind === "REPLY" &&
          (value.title !== undefined ||
            (value.body !== undefined &&
              (value.body.length > L.replyLength ||
                new TextEncoder().encode(value.body).length > L.replyBytes))))
      ) {
        context.addIssue({
          code: "custom",
          message: "Invalid selected projection",
        });
      }
    }),
);
export const communityOwnedSchema = guarded(
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
      topologyCheck(value, context);
      if (
        (value.canEdit &&
          (!value.workAvailable ||
            value.authorState !== "ACTIVE" ||
            value.moderationState !== "VISIBLE" ||
            value.revision === 2_147_483_647)) ||
        (value.canWithdraw &&
          (value.authorState !== "ACTIVE" || value.revision === 2_147_483_647))
      ) {
        context.addIssue({
          code: "custom",
          message: "Invalid owner capabilities",
        });
      }
    }),
);
export const communityOwnedListResponseSchema = guarded(
  z
    .object({
      items: z.array(communityOwnedSchema).max(L.pageSize),
      pageSize: z.literal(25),
    })
    .strict(),
);
export const communityOwnedContextQuerySchema = communityOwnedDetailQuerySchema;

function queryError(message: string): never {
  throw new z.ZodError([{ code: "custom", path: [], message }]);
}
/** Bounded before Zod; retain duplicates rather than silently flattening them. */
export function strictCommunitySearchParams(
  url: string,
  allowed: readonly string[] = [
    "locale",
    "page",
    "cursorId",
    "cursorTimestamp",
  ],
): Record<string, string> {
  if (url.length > 8192) queryError("Query too large");
  const values: Record<string, string> = Object.create(null);
  for (const [key, value] of new URL(url).searchParams) {
    if (
      key.length > 24 ||
      value.length > 64 ||
      !allowed.includes(key) ||
      Object.hasOwn(values, key)
    )
      queryError("Invalid query parameter");
    values[key] = value;
  }
  return values;
}
export function parseDiscussionQuery(url: string) {
  const value = strictCommunitySearchParams(url);
  const hasCursor =
    value.cursorId !== undefined || value.cursorTimestamp !== undefined;
  if (
    hasCursor &&
    (value.cursorId === undefined ||
      value.cursorTimestamp === undefined ||
      value.page !== undefined)
  )
    queryError("Choose complete cursor or page");
  if (value.page !== undefined && !/^[1-9]\d{0,2}$/.test(value.page))
    queryError("Invalid page");
  return communityQuerySchema.parse({
    locale: value.locale ?? "en",
    ...(hasCursor
      ? {
          cursor: {
            id: value.cursorId,
            timestamp:
              value.cursorTimestamp === "null" ? null : value.cursorTimestamp,
          },
        }
      : { page: value.page === undefined ? 1 : Number(value.page) }),
  });
}
export function parseCommunityOwnedQuery(url: string) {
  return communityOwnedQuerySchema.parse(parseDiscussionQuery(url));
}
export function parseCommunityOwnedContextQuery(url: string) {
  return communityOwnedContextQuerySchema.parse(
    strictCommunitySearchParams(url, ["contentKind"]),
  );
}
export function requireEmptyCommunityQuery(url: string): void {
  strictCommunitySearchParams(url, []);
}

/** Response failures are server failures, never validation issues containing authored data. */
export function validatedCommunityResponse<T>(
  schema: z.ZodType<T>,
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid community response");
  return parsed.data;
}
export function requireDiscussionScope(
  value: Pick<CommunityPublicDTO, "id" | "workId" | "kind" | "threadId">,
  workId: string,
  expectedKind: "THREAD" | "REPLY",
  targetId?: string,
  threadId?: string,
): void {
  if (
    value.workId !== uuid.parse(workId) ||
    value.kind !== expectedKind ||
    (targetId !== undefined && value.id !== uuid.parse(targetId)) ||
    (threadId !== undefined && value.threadId !== uuid.parse(threadId))
  )
    throw new Error("Invalid community response scope");
}
export function discussionHttpMutation(
  value: unknown,
  workId: string,
  expectedKind: "THREAD" | "REPLY",
  targetId?: string,
  threadId?: string,
) {
  // Strip only the explicitly frozen foundation report:null, rejecting every other extra field.
  const foundation = validatedCommunityResponse(
    guarded(
      z
        .object({
          content: discussionPublicSchema,
          replayed: z.boolean(),
          report: z.null(),
        })
        .strict(),
    ),
    value,
  );
  const result = validatedCommunityResponse(discussionMutationResponseSchema, {
    content: foundation.content,
    replayed: foundation.replayed,
  });
  requireDiscussionScope(
    result.content,
    workId,
    expectedKind,
    targetId,
    threadId,
  );
  return result;
}
export function discussionHttpReveal(
  value: unknown,
  selection: z.infer<typeof discussionRevealSchema>,
): CommunityRevealDTO {
  const result = validatedCommunityResponse(
    discussionRevealResponseSchema,
    value,
  );
  if (
    result.id !== selection.targetId ||
    result.workId !== selection.workId ||
    result.kind !== selection.contentKind ||
    result.revision !== selection.expectedRevision ||
    (result.title !== undefined) !== selection.title ||
    (result.body !== undefined) !== selection.body
  )
    throw new Error("Invalid community reveal scope");
  return result;
}
export type DiscussionPublic = z.infer<typeof discussionPublicSchema>;
export type CommunityOwned = z.infer<typeof communityOwnedSchema>;
