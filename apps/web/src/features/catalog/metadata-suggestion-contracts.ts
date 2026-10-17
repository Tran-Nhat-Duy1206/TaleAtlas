import { z } from "zod";
import {
  MAX_METADATA_REVISION,
  submitMetadataProposalSchema,
} from "./metadata-operations";

const uuid = z.uuid();
const revision = z.number().int().min(1).max(MAX_METADATA_REVISION);
const language = z
  .string()
  .regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/)
  .max(63);
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(100);

// Verified private target handles, not a public catalog projection or authority.
export const metadataTargetSchema = z
  .object({
    work: z
      .object({
        id: uuid,
        slug: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(160),
        primaryTitle: z.string().min(1).max(500),
        primaryTitleLanguage: language,
        revision,
        visibility: z.literal("PUBLISHED"),
      })
      .strict(),
    titles: z
      .array(
        z
          .object({
            id: uuid,
            workId: uuid,
            title: z.string().min(1).max(500),
            language,
            kind: z.enum(["PRIMARY", "ORIGINAL", "ALIAS"]),
          })
          .strict(),
      )
      .max(31),
    descriptions: z
      .array(
        z
          .object({
            workId: uuid,
            language,
            text: z.string().min(1).max(20000),
          })
          .strict(),
      )
      .max(30),
    genreMemberships: z
      .array(z.object({ workId: uuid, slug }).strict())
      .max(10),
    genreOptions: z
      .array(
        z
          .object({
            slug,
            nameEn: z.string().min(1).max(200),
            nameVi: z.string().min(1).max(200),
          })
          .strict(),
      )
      .max(210),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      [...value.titles, ...value.descriptions, ...value.genreMemberships].some(
        (row) => row.workId !== value.work.id,
      )
    )
      ctx.addIssue({ code: "custom", message: "Wrong Work scope" });
    for (const keys of [
      value.titles.map((t) => t.id),
      value.descriptions.map((d) => d.language),
      value.genreMemberships.map((g) => g.slug),
      value.genreOptions.map((g) => g.slug),
    ]) {
      if (new Set(keys).size !== keys.length)
        ctx.addIssue({ code: "custom", message: "Duplicate target identity" });
    }
  });
export type MetadataTarget = z.infer<typeof metadataTargetSchema>;

// No actor identifiers, unbounded event payloads, source internals or private library data.
export const metadataSuggestionSchema = z
  .object({
    id: uuid,
    workId: uuid,
    baseWorkRevision: revision,
    revision: z.number().int().min(1).max(2),
    state: z.enum(["SUBMITTED", "APPROVED", "REJECTED"]),
    appliedWorkRevision: revision.nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    contentState: z.enum(["ACTIVE", "ERASED"]),
    proposal: submitMetadataProposalSchema.nullable(),
    reviewReason: z.string().min(1).max(2000).nullable(),
    reasonRedacted: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const invalid = () =>
      ctx.addIssue({ code: "custom", message: "Invalid proposal lifecycle" });
    if (value.contentState === "ERASED") {
      if (
        value.proposal !== null ||
        value.reviewReason !== null ||
        (value.state !== "SUBMITTED" && !value.reasonRedacted)
      )
        invalid();
    } else if (
      !value.proposal ||
      value.proposal.workId !== value.workId ||
      value.proposal.baseWorkRevision !== value.baseWorkRevision
    )
      invalid();
    if (value.state === "SUBMITTED") {
      if (
        value.revision !== 1 ||
        value.appliedWorkRevision !== null ||
        value.reviewReason !== null
      )
        invalid();
    } else {
      if (value.revision !== 2) invalid();
      if (
        value.contentState === "ACTIVE" &&
        !value.reasonRedacted &&
        value.reviewReason === null
      )
        invalid();
      if (value.state === "APPROVED") {
        if (value.appliedWorkRevision !== value.baseWorkRevision + 1) invalid();
      } else if (value.appliedWorkRevision !== null) invalid();
    }
    if (value.reasonRedacted && value.reviewReason !== null) invalid();
  });
export type MetadataSuggestion = z.infer<typeof metadataSuggestionSchema>;

export const metadataSuggestionPageSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(501).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const metadataSuggestionListSchema = z
  .object({
    items: z.array(metadataSuggestionSchema).max(50),
    total: z.number().int().min(0),
    page: z.number().int().min(1).max(501),
    pageSize: z.number().int().min(1).max(50),
  })
  .strict();
export const metadataHistoryEventSchema = z
  .object({
    revision: z.number().int().min(1).max(2),
    fromState: z.enum(["SUBMITTED", "APPROVED", "REJECTED"]).nullable(),
    toState: z.enum(["SUBMITTED", "APPROVED", "REJECTED"]),
    createdAt: z.string().datetime({ offset: true }),
    reasonRedacted: z.boolean(),
    metadataReviewAcknowledged: z.boolean().nullable(),
    publicationReviewAcknowledged: z.boolean().nullable(),
    rightsReviewAcknowledged: z.boolean().nullable(),
  })
  .strict()
  .superRefine((event, ctx) => {
    const invalid = () =>
      ctx.addIssue({ code: "custom", message: "Invalid history transition" });
    const acknowledgments = [
      event.metadataReviewAcknowledged,
      event.publicationReviewAcknowledged,
      event.rightsReviewAcknowledged,
    ];
    if (event.toState === "SUBMITTED") {
      if (event.revision !== 1 || event.fromState !== null) invalid();
    } else if (event.revision !== 2 || event.fromState !== "SUBMITTED")
      invalid();
    if (
      event.toState === "APPROVED"
        ? acknowledgments.some((ack) => ack !== true)
        : acknowledgments.some((ack) => ack !== null)
    )
      invalid();
  });
export const metadataEvidenceSchema = z
  .object({
    id: uuid,
    auditEventId: uuid,
    workRevision: revision,
    operationType: z.enum([
      "TITLE_ADD",
      "TITLE_REPLACE",
      "TITLE_REMOVE",
      "DESCRIPTION_ADD",
      "DESCRIPTION_REPLACE",
      "DESCRIPTION_REMOVE",
      "GENRE_ADD_MEMBERSHIP",
      "GENRE_REMOVE_MEMBERSHIP",
    ]),
    titleId: uuid.nullable(),
    descriptionLanguage: language.nullable(),
    genreSlug: slug.nullable(),
    beforePresent: z.boolean(),
    afterPresent: z.boolean(),
    beforeTitle: z.string().min(1).max(500).nullable(),
    afterTitle: z.string().min(1).max(500).nullable(),
    titleLanguage: language.nullable(),
    titleKind: z.enum(["PRIMARY", "ORIGINAL", "ALIAS"]).nullable(),
    beforeDescription: z.string().min(1).max(20000).nullable(),
    afterDescription: z.string().min(1).max(20000).nullable(),
    rightsBasis: z.literal("ORIGINAL_SUMMARY").nullable(),
    originalityAcknowledged: z.boolean().nullable(),
    rightsReviewAcknowledged: z.boolean().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const invalid = () =>
      ctx.addIssue({ code: "custom", message: "Invalid typed evidence" });
    const add =
      value.operationType === "TITLE_ADD" ||
      value.operationType === "DESCRIPTION_ADD" ||
      value.operationType === "GENRE_ADD_MEMBERSHIP";
    const remove =
      value.operationType === "TITLE_REMOVE" ||
      value.operationType === "DESCRIPTION_REMOVE" ||
      value.operationType === "GENRE_REMOVE_MEMBERSHIP";
    const nulls = (items: unknown[]) => items.every((item) => item === null);
    if (value.beforePresent !== !add || value.afterPresent !== !remove)
      invalid();
    if (value.operationType.startsWith("TITLE_")) {
      if (
        !value.titleId ||
        !value.titleLanguage ||
        !value.titleKind ||
        value.titleKind === "ORIGINAL" ||
        !nulls([
          value.descriptionLanguage,
          value.genreSlug,
          value.beforeDescription,
          value.afterDescription,
          value.rightsBasis,
          value.originalityAcknowledged,
          value.rightsReviewAcknowledged,
        ]) ||
        (value.beforeTitle !== null) !== value.beforePresent ||
        (value.afterTitle !== null) !== value.afterPresent ||
        (!add && !remove && value.beforeTitle === value.afterTitle)
      )
        invalid();
    } else if (value.operationType.startsWith("DESCRIPTION_")) {
      if (
        !value.descriptionLanguage ||
        !nulls([
          value.titleId,
          value.titleLanguage,
          value.titleKind,
          value.genreSlug,
          value.beforeTitle,
          value.afterTitle,
        ]) ||
        (value.beforeDescription !== null) !== value.beforePresent ||
        (value.afterDescription !== null) !== value.afterPresent ||
        (!add && !remove && value.beforeDescription === value.afterDescription)
      )
        invalid();
      if (
        remove
          ? !nulls([
              value.rightsBasis,
              value.originalityAcknowledged,
              value.rightsReviewAcknowledged,
            ])
          : value.rightsBasis !== "ORIGINAL_SUMMARY" ||
            value.originalityAcknowledged !== true ||
            value.rightsReviewAcknowledged !== true
      )
        invalid();
    } else if (
      !value.genreSlug ||
      !nulls([
        value.titleId,
        value.titleLanguage,
        value.titleKind,
        value.descriptionLanguage,
        value.beforeTitle,
        value.afterTitle,
        value.beforeDescription,
        value.afterDescription,
        value.rightsBasis,
        value.originalityAcknowledged,
        value.rightsReviewAcknowledged,
      ])
    )
      invalid();
  });
export const metadataSuggestionDetailSchema = z
  .object({
    suggestion: metadataSuggestionSchema,
    current: metadataTargetSchema.nullable(),
    history: z.array(metadataHistoryEventSchema).min(1).max(2),
    evidence: metadataEvidenceSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const invalid = () =>
      ctx.addIssue({ code: "custom", message: "Inconsistent private history" });
    if (value.current && value.current.work.id !== value.suggestion.workId)
      invalid();
    if (value.history.length !== value.suggestion.revision) invalid();
    value.history.forEach((event, index) => {
      if (
        event.revision !== index + 1 ||
        (index === 0
          ? event.fromState !== null || event.toState !== "SUBMITTED"
          : event.fromState !== "SUBMITTED" ||
            event.toState !== value.suggestion.state)
      )
        invalid();
      if (
        event.toState === "APPROVED" &&
        (event.metadataReviewAcknowledged !== true ||
          event.publicationReviewAcknowledged !== true ||
          event.rightsReviewAcknowledged !== true)
      )
        invalid();
    });
    if (
      value.evidence &&
      (value.suggestion.state !== "APPROVED" ||
        value.evidence.workRevision !== value.suggestion.appliedWorkRevision)
    )
      invalid();
    const op = value.suggestion.proposal?.operation,
      evidence = value.evidence;
    if (op && evidence) {
      if (evidence.operationType !== op.type) invalid();
      if ("titleId" in op && evidence.titleId !== op.titleId) invalid();
      if ("language" in op && evidence.descriptionLanguage !== op.language)
        invalid();
      if ("slug" in op && evidence.genreSlug !== op.slug) invalid();
      if (
        op.type === "TITLE_ADD" &&
        (evidence.afterTitle !== op.value.title ||
          evidence.titleLanguage !== op.value.language ||
          evidence.titleKind !== op.value.kind)
      )
        invalid();
      if (op.type === "TITLE_REPLACE" && evidence.afterTitle !== op.title)
        invalid();
      if (
        (op.type === "DESCRIPTION_ADD" || op.type === "DESCRIPTION_REPLACE") &&
        evidence.afterDescription !== op.text
      )
        invalid();
    }
  });
// Role context comes from persisted administrator authorization, never this parser.
export const metadataAdminSuggestionDetailSchema =
  metadataSuggestionDetailSchema.superRefine((value, ctx) => {
    if (value.suggestion.state === "APPROVED" && value.evidence === null)
      ctx.addIssue({
        code: "custom",
        message: "Approved administrator detail requires evidence",
      });
  });
