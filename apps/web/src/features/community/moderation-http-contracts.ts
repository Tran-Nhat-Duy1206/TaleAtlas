import { z } from "zod";
import {
  COMMUNITY_LIMITS as L,
  COMMUNITY_CONTENT_KINDS,
  COMMUNITY_REPORT_REASONS,
  COMMUNITY_MODERATION_ACTION_KINDS,
  COMMUNITY_COMMAND_KINDS,
} from "@taleatlas/database/community-types";
import {
  communityUuidSchema,
  communityReportSchema,
  communityModerationSchema,
  communityOwnedQuerySchema,
} from "./contracts";
import {
  discussionPublicSchema,
  strictCommunitySearchParams,
  parseCommunityOwnedQuery,
  validatedCommunityResponse,
} from "./http-contracts";
import { reviewPublicSchema } from "./review-http-contracts";

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
    prototype !== null &&
    prototype !== (Array.isArray(value) ? Array.prototype : Object.prototype)
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
const uuid = communityUuidSchema,
  revision = z.number().int().min(1).max(2147483647);
const kind = z.enum(COMMUNITY_CONTENT_KINDS),
  authorState = z.enum(["ACTIVE", "DELETED", "ERASED"]),
  moderationState = z.enum(["VISIBLE", "HIDDEN"]);
const state = z.enum(["OPEN", "DISMISSED", "UPHELD"]),
  locale = z.enum(["en", "vi"]);
const timestamp = z.string().max(35).datetime({ offset: true });
function text(min: number, max: number, bytes: number, multiline = false) {
  return z
    .string()
    .refine(
      (value) =>
        value.length >= min &&
        value.length <= max &&
        value.trim().length >= min &&
        value === value.normalize("NFC") &&
        !(
          multiline
            ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
            : /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
        ).test(value) &&
        !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(
          value,
        ) &&
        new TextEncoder().encode(value).length <= bytes,
      "Invalid plain text",
    );
}
const scope = { id: uuid, workId: uuid, kind, revision };
const reportStatus = z.object({ id: uuid, state, revision }).strict();
export const reportCreateSchema = guarded(communityReportSchema);
export const moderationCommandSchema = guarded(communityModerationSchema);
export const communityTargetScopeSchema = guarded(z.object(scope).strict());
export const communityCommandResponseSchema = guarded(
  z
    .object({
      content: communityTargetScopeSchema,
      report: reportStatus.nullable(),
      replayed: z.boolean(),
    })
    .strict(),
);
export const moderationTargetSchema = guarded(
  z
    .object({
      ...scope,
      authorState,
      moderationState,
      workAvailable: z.boolean(),
      canHide: z.boolean(),
      canRestore: z.boolean(),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.canHide !== (value.authorState !== "ERASED") ||
        value.canRestore !==
          (value.workAvailable && value.authorState !== "ERASED")
      )
        context.addIssue({
          code: "custom",
          message: "Invalid moderation capabilities",
        });
    }),
);
export const ownedReportSchema = guarded(
  z
    .object({
      id: uuid,
      workId: uuid,
      contentId: uuid,
      contentKind: kind,
      state,
      revision,
      targetRevision: revision,
      targetAuthorState: authorState,
      targetModerationState: moderationState,
      workAvailable: z.boolean(),
    })
    .strict(),
);
export const ownedReportListResponseSchema = guarded(
  z
    .object({
      items: z.array(ownedReportSchema).max(L.pageSize),
      pageSize: z.literal(25),
    })
    .strict(),
);
export const moderationQueueItemSchema = guarded(
  z
    .object({
      ...reportStatus.shape,
      evidenceRedacted: z.boolean(),
      canDismiss: z.boolean(),
      target: moderationTargetSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (value.canDismiss !== (value.state === "OPEN"))
        context.addIssue({
          code: "custom",
          message: "Invalid report capability",
        });
    }),
);
const queueCursor = z.object({ id: uuid, timestamp }).strict();
export const moderationQueueResponseSchema = guarded(
  z
    .object({
      items: z.array(moderationQueueItemSchema).max(L.pageSize),
      pageSize: z.literal(25),
      nextCursor: queueCursor.nullable(),
    })
    .strict(),
);
export const moderationMetadataQuerySchema = guarded(
  z.object({ locale, kind }).strict(),
);
export const ownedReportDetailQuerySchema = guarded(
  z.object({ locale }).strict(),
);
export const moderationQueueQuerySchema = guarded(
  z
    .object({
      locale,
      state: state.default("OPEN"),
      page: z.number().int().min(1).max(L.maxPage).optional(),
      cursor: queueCursor.optional(),
    })
    .strict()
    .refine(
      (value) => value.page === undefined || value.cursor === undefined,
      "Choose page or cursor",
    ),
);
export const ownedReportQuerySchema = guarded(communityOwnedQuerySchema);
const evidenceBase = {
  workId: uuid,
  targetId: uuid,
  contentKind: kind,
  expectedRevision: revision,
  reportId: uuid.nullable(),
  expectedReportRevision: revision.nullable(),
  actionId: uuid.nullable(),
  actionSequence: z
    .number()
    .int()
    .min(1)
    .max(L.maxModerationActions)
    .nullable(),
  evidenceSelectionAcknowledged: z.literal(true),
  spoilerRevealAcknowledged: z.literal(true),
};
export const moderationEvidenceInputSchema = guarded(
  z
    .object({
      ...evidenceBase,
      selection: z.enum([
        "TITLE",
        "BODY",
        "SPOILER_CONTEXT",
        "REPORT",
        "ACTION_REASON",
      ]),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        (value.reportId === null) !== (value.expectedReportRevision === null) ||
        (value.actionId === null) !== (value.actionSequence === null) ||
        (value.selection === "TITLE" && value.contentKind !== "THREAD") ||
        (value.selection === "REPORT" && value.reportId === null) ||
        (value.selection === "ACTION_REASON"
          ? value.actionId === null
          : value.actionId !== null)
      )
        context.addIssue({
          code: "custom",
          message: "Invalid selected evidence scope",
        });
    }),
);
const evidenceState = z.enum(["AVAILABLE", "UNAVAILABLE", "REDACTED"]);
const fieldEvidence = <
  S extends "TITLE" | "BODY" | "SPOILER_CONTEXT" | "ACTION_REASON",
>(
  selection: S,
  field: ReturnType<typeof text>,
) =>
  z
    .object({
      ...scope,
      selection: z.literal(selection),
      state: evidenceState,
      text: field.nullable(),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        (value.state === "AVAILABLE") !== (value.text !== null) ||
        (selection === "TITLE" && value.kind !== "THREAD")
      )
        context.addIssue({
          code: "custom",
          message: "Invalid evidence projection",
        });
    });
export const moderationEvidenceResponseSchema = guarded(
  z.union([
    fieldEvidence("TITLE", text(1, L.titleLength, L.titleBytes)),
    fieldEvidence("BODY", text(1, L.bodyLength, L.bodyBytes, true)).superRefine(
      (value, context) => {
        if (
          value.text !== null &&
          (value.kind === "REVIEW"
            ? value.text.length < L.reviewMinLength
            : value.kind === "REPLY" &&
              (value.text.length > L.replyLength ||
                new TextEncoder().encode(value.text).length > L.replyBytes))
        )
          context.addIssue({
            code: "custom",
            message: "Invalid kind body bound",
          });
      },
    ),
    fieldEvidence("SPOILER_CONTEXT", text(1, L.contextLength, L.contextBytes)),
    fieldEvidence(
      "ACTION_REASON",
      text(1, L.reasonLength, L.reasonBytes, true),
    ).safeExtend({
      action: z
        .object({
          id: uuid,
          sequence: z.number().int().min(1).max(L.maxModerationActions),
        })
        .strict(),
    }),
    z
      .object({
        ...scope,
        selection: z.literal("REPORT"),
        state: evidenceState,
        report: reportStatus,
        reason: z.enum(COMMUNITY_REPORT_REASONS).nullable(),
        explanation: text(0, L.reasonLength, L.reasonBytes, true).nullable(),
      })
      .strict()
      .superRefine((value, context) => {
        if (
          value.state === "AVAILABLE"
            ? value.reason === null ||
              value.explanation === null ||
              (value.reason === "OTHER" && value.explanation.trim().length < 3)
            : value.reason !== null || value.explanation !== null
        )
          context.addIssue({
            code: "custom",
            message: "Invalid report evidence projection",
          });
      }),
  ]),
);
const historyBase = { id: uuid, createdAt: timestamp };
export const moderationEventSchema = guarded(
  z
    .object({
      ...historyBase,
      command: z.enum(COMMUNITY_COMMAND_KINDS).exclude(["REPORT"]),
      contentRevision: revision,
      beforeAuthorState: authorState,
      afterAuthorState: authorState,
      beforeModerationState: moderationState,
      afterModerationState: moderationState,
    })
    .strict(),
);
export const moderationActionSchema = guarded(
  z
    .object({
      ...historyBase,
      action: z.enum(COMMUNITY_MODERATION_ACTION_KINDS),
      sequence: z.number().int().min(1).max(L.maxModerationActions),
      contentRevision: revision,
      reportId: uuid.nullable(),
      reportRevision: revision.nullable(),
      evidenceRedacted: z.boolean(),
    })
    .strict()
    .refine(
      (value) => value.reportId === null || value.reportRevision !== null,
      "Attached report revision required",
    ),
);
export const moderationHistoryQuerySchema = guarded(
  z
    .object({
      locale,
      kind,
      expectedRevision: revision,
      stream: z.enum(["EVENTS", "ACTIONS"]),
      page: z.number().int().min(1).max(L.maxPage).optional(),
      cursor: revision.optional(),
    })
    .strict()
    .refine(
      (value) => value.page === undefined || value.cursor === undefined,
      "Choose page or cursor",
    ),
);
export const moderationHistoryResponseSchema = guarded(
  z.discriminatedUnion("stream", [
    z
      .object({
        content: moderationTargetSchema,
        stream: z.literal("EVENTS"),
        items: z.array(moderationEventSchema).max(L.pageSize),
        pageSize: z.literal(25),
        nextCursor: revision.nullable(),
      })
      .strict(),
    z
      .object({
        content: moderationTargetSchema,
        stream: z.literal("ACTIONS"),
        items: z.array(moderationActionSchema).max(L.pageSize),
        pageSize: z.literal(25),
        nextCursor: revision.nullable(),
      })
      .strict(),
  ]),
);
function queryError(): never {
  throw new z.ZodError([
    { code: "custom", path: [], message: "Invalid moderation query" },
  ]);
}
function pagination(value: Record<string, string>) {
  if (value.page !== undefined && !/^[1-9]\d{0,2}$/.test(value.page))
    queryError();
  if (value.page !== undefined && value.cursorId !== undefined) queryError();
  if ((value.cursorId === undefined) !== (value.cursorTimestamp === undefined))
    queryError();
  return value.cursorId === undefined
    ? { page: value.page === undefined ? 1 : Number(value.page) }
    : { cursor: { id: value.cursorId, timestamp: value.cursorTimestamp } };
}
export function parseModerationQueueQuery(url: string) {
  const value = strictCommunitySearchParams(url, [
    "locale",
    "state",
    "page",
    "cursorId",
    "cursorTimestamp",
  ]);
  return moderationQueueQuerySchema.parse({
    locale: value.locale ?? "en",
    state: value.state ?? "OPEN",
    ...pagination(value),
  });
}
export const parseOwnedReportQuery = parseCommunityOwnedQuery;
export function parseOwnedReportDetailQuery(url: string) {
  const value = strictCommunitySearchParams(url, ["locale"]);
  return ownedReportDetailQuerySchema.parse({ locale: value.locale ?? "en" });
}
export function parseModerationMetadataQuery(url: string) {
  const value = strictCommunitySearchParams(url, ["locale", "kind"]);
  return moderationMetadataQuerySchema.parse({
    ...value,
    locale: value.locale ?? "en",
  });
}
export function parseModerationHistoryQuery(url: string) {
  const value = strictCommunitySearchParams(url, [
    "locale",
    "kind",
    "expectedRevision",
    "stream",
    "page",
    "cursor",
  ]);
  for (const key of ["expectedRevision", "cursor", "page"])
    if (value[key] !== undefined && !/^[1-9]\d{0,9}$/.test(value[key]!))
      queryError();
  return moderationHistoryQuerySchema.parse({
    locale: value.locale ?? "en",
    kind: value.kind,
    expectedRevision: Number(value.expectedRevision),
    stream: value.stream,
    ...(value.cursor === undefined
      ? { page: value.page === undefined ? 1 : Number(value.page) }
      : {
          cursor: Number(value.cursor),
          ...(value.page === undefined ? {} : { page: Number(value.page) }),
        }),
  });
}
export function requireModerationScope(
  value: { id: string; workId: string; kind: string },
  workId: string,
  targetId: string,
  contentKind: z.infer<typeof kind>,
): void {
  if (
    value.workId !== uuid.parse(workId) ||
    value.id !== uuid.parse(targetId) ||
    value.kind !== contentKind
  )
    throw new Error("Invalid moderation response scope");
}
export function communityHttpCommand(
  value: unknown,
  workId: string,
  targetId: string,
  selection:
    | z.infer<typeof reportCreateSchema>
    | z.infer<typeof moderationCommandSchema>,
  mode: "REPORT" | "MODERATION",
) {
  if ((mode === "MODERATION") !== "action" in selection)
    throw new Error("Invalid command mode");
  const foundation = validatedCommunityResponse(
    guarded(
      z
        .object({
          content: z.union([discussionPublicSchema, reviewPublicSchema]),
          report: reportStatus.nullable(),
          replayed: z.boolean(),
        })
        .strict(),
    ),
    value,
  );
  const content = {
    id: foundation.content.id,
    workId: foundation.content.workId,
    kind: foundation.content.kind,
    revision: foundation.content.revision,
  };
  requireModerationScope(content, workId, targetId, selection.contentKind);
  if (
    content.revision < selection.expectedRevision ||
    (!foundation.replayed &&
      (mode === "REPORT"
        ? content.revision !== selection.expectedRevision
        : content.revision > selection.expectedRevision + 1))
  )
    throw new Error("Invalid command revision scope");
  if (mode === "REPORT" && foundation.report === null)
    throw new Error("Missing reporter receipt");
  if (
    "reportId" in selection &&
    ((foundation.report !== null &&
      foundation.report.id !== selection.reportId) ||
      (!foundation.replayed &&
        selection.reportId !== null &&
        foundation.report === null))
  )
    throw new Error("Invalid attached report scope");
  if (
    !foundation.replayed &&
    mode === "REPORT" &&
    (foundation.report === null ||
      foundation.report.revision !== 1 ||
      foundation.report.state !== "OPEN")
  )
    throw new Error("Invalid new report receipt");
  if (
    "action" in selection &&
    foundation.report !== null &&
    (foundation.report.revision < selection.expectedReportRevision! + 1 ||
      (!foundation.replayed &&
        (foundation.report.revision !== selection.expectedReportRevision! + 1 ||
          content.revision !== selection.expectedRevision + 1 ||
          foundation.report.state !==
            (selection.action === "HIDE" ? "UPHELD" : "DISMISSED"))))
  )
    throw new Error("Invalid report decision revision scope");
  return validatedCommunityResponse(communityCommandResponseSchema, {
    content,
    report: foundation.report,
    replayed: foundation.replayed,
  });
}
export function moderationHttpEvidence(
  value: unknown,
  selection: z.infer<typeof moderationEvidenceInputSchema>,
) {
  const result = validatedCommunityResponse(
    moderationEvidenceResponseSchema,
    value,
  );
  requireModerationScope(
    result,
    selection.workId,
    selection.targetId,
    selection.contentKind,
  );
  if (
    result.revision !== selection.expectedRevision ||
    result.selection !== selection.selection ||
    (result.selection === "REPORT" &&
      (result.report.id !== selection.reportId ||
        result.report.revision !== selection.expectedReportRevision)) ||
    (result.selection === "ACTION_REASON" &&
      (result.action.id !== selection.actionId ||
        result.action.sequence !== selection.actionSequence))
  )
    throw new Error("Invalid evidence response scope");
  return result;
}
export type CommunityTargetScopeDTO = z.infer<
  typeof communityTargetScopeSchema
>;
export type CommunityCommandResponseDTO = z.infer<
  typeof communityCommandResponseSchema
>;
export type ModerationTargetDTO = z.infer<typeof moderationTargetSchema>;
export type OwnedReportDTO = z.infer<typeof ownedReportSchema>;
export type OwnedReportListResponseDTO = z.infer<
  typeof ownedReportListResponseSchema
>;
export type ModerationQueueDTO = z.infer<typeof moderationQueueResponseSchema>;
export type ModerationEvidenceInput = z.infer<
  typeof moderationEvidenceInputSchema
>;
export type ModerationEvidenceDTO = z.infer<
  typeof moderationEvidenceResponseSchema
>;
export type ModerationHistoryDTO = z.infer<
  typeof moderationHistoryResponseSchema
>;
