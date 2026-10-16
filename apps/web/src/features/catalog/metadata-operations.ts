import { z } from "zod";
import { informationalUrlSchema, normalizeTitle } from "./contracts";

export const MAX_METADATA_CANONICAL_BYTES = 60000;
export const MAX_METADATA_REVISION = 2147483647;

// These contracts express intent only: parsing is not authorization or a rights grant.
function safeUnicode(value: string, multiline: boolean): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
    if (
      (code <= 0x1f && !(multiline && (code === 9 || code === 10))) ||
      (!multiline && (code === 0x2028 || code === 0x2029)) ||
      (code >= 0x7f && code <= 0x9f) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    )
      return false;
  }
  return true;
}
const text = (max: number, multiline = false) =>
  z
    .string()
    .transform((value) => (multiline ? value.replace(/\r\n?/g, "\n") : value))
    // Check before trim so forbidden boundary controls cannot disappear.
    .refine((value) => safeUnicode(value, multiline), "Unsafe Unicode text")
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(max));
const title = text(500).refine((value) => {
  const normalized = normalizeTitle(value);
  return normalized.length > 0 && normalized.length <= 1000;
}, "Title must have a bounded nonempty search representation");
const language = z
  .string()
  .regex(/^(?:und|[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/)
  .max(35);
const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const revision = z.number().int().min(1).max(MAX_METADATA_REVISION);
const reason = text(2000, true);
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(100);
const rights = z
  .object({
    basis: z.literal("ORIGINAL_SUMMARY"),
    originalityAcknowledged: z.literal(true),
    statement: text(2000, true),
  })
  .strict();
const citation = z
  .object({
    label: text(200),
    citation: text(4000, true),
    url: informationalUrlSchema
      .refine((value) => safeUnicode(value, false), "Unsafe Unicode URL")
      .optional(),
    consultedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
const operation = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("TITLE_ADD"),
      value: z
        .object({ title, language, kind: z.enum(["ALIAS", "PRIMARY"]) })
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal("TITLE_REPLACE"), titleId: uuid, title }).strict(),
  z.object({ type: z.literal("TITLE_REMOVE"), titleId: uuid, reason }).strict(),
  z
    .object({
      type: z.literal("DESCRIPTION_ADD"),
      language,
      text: text(20000, true),
      rights,
    })
    .strict(),
  z
    .object({
      type: z.literal("DESCRIPTION_REPLACE"),
      language,
      text: text(20000, true),
      rights,
    })
    .strict(),
  z
    .object({ type: z.literal("DESCRIPTION_REMOVE"), language, reason })
    .strict(),
  z.object({ type: z.literal("GENRE_ADD_MEMBERSHIP"), slug }).strict(),
  z
    .object({ type: z.literal("GENRE_REMOVE_MEMBERSHIP"), slug, reason })
    .strict(),
]);
const baseSchema = z
  .object({
    version: z.literal(1),
    submitKey: uuid,
    workId: uuid,
    baseWorkRevision: revision,
    citation,
    operation,
  })
  .strict();
type ParsedProposal = z.infer<typeof baseSchema>;

// Explicit whitelist, not input object iteration: delivery identity is excluded.
function project(value: ParsedProposal): string {
  const op = value.operation;
  let projected;
  switch (op.type) {
    case "TITLE_ADD":
      projected = {
        type: op.type,
        value: {
          title: op.value.title,
          language: op.value.language,
          kind: op.value.kind,
        },
      };
      break;
    case "TITLE_REPLACE":
      projected = { type: op.type, titleId: op.titleId, title: op.title };
      break;
    case "TITLE_REMOVE":
      projected = { type: op.type, titleId: op.titleId, reason: op.reason };
      break;
    case "DESCRIPTION_ADD":
    case "DESCRIPTION_REPLACE":
      projected = {
        type: op.type,
        language: op.language,
        text: op.text,
        rights: {
          basis: op.rights.basis,
          originalityAcknowledged: op.rights.originalityAcknowledged,
          statement: op.rights.statement,
        },
      };
      break;
    case "DESCRIPTION_REMOVE":
      projected = { type: op.type, language: op.language, reason: op.reason };
      break;
    case "GENRE_ADD_MEMBERSHIP":
      projected = { type: op.type, slug: op.slug };
      break;
    case "GENRE_REMOVE_MEMBERSHIP":
      projected = { type: op.type, slug: op.slug, reason: op.reason };
      break;
  }
  return JSON.stringify({
    domain: "TALEATLAS_METADATA_PROPOSAL_V1",
    version: value.version,
    workId: value.workId,
    baseWorkRevision: value.baseWorkRevision,
    operation: projected,
    citation: {
      label: value.citation.label,
      citation: value.citation.citation,
      url: value.citation.url,
      consultedAt: value.citation.consultedAt,
    },
  });
}
export const submitMetadataProposalSchema = baseSchema.superRefine(
  (value, ctx) => {
    if (
      new TextEncoder().encode(project(value)).byteLength >
      MAX_METADATA_CANONICAL_BYTES
    )
      ctx.addIssue({
        code: "custom",
        message: "Canonical metadata proposal exceeds byte limit",
      });
  },
);
export type SubmitMetadataProposal = z.infer<
  typeof submitMetadataProposalSchema
>;
export function canonicalMetadataProposalInput(input: unknown): string {
  return project(submitMetadataProposalSchema.parse(input));
}

const reviewBase = {
  version: z.literal(1),
  suggestionId: uuid,
  revision,
  baseWorkRevision: revision,
  reason,
};
export const reviewMetadataProposalSchema = z.discriminatedUnion("decision", [
  z.object({ ...reviewBase, decision: z.literal("REJECT") }).strict(),
  z
    .object({
      ...reviewBase,
      decision: z.literal("APPROVE"),
      metadataReviewAcknowledged: z.literal(true),
      publicationReviewAcknowledged: z.literal(true),
      rightsReviewAcknowledged: z.literal(true),
    })
    .strict(),
]);
export type ReviewMetadataProposal = z.infer<
  typeof reviewMetadataProposalSchema
>;
