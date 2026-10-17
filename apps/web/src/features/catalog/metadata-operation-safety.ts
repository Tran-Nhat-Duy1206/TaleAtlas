import { z } from "zod";
import { normalizeTitle } from "./contracts";
import {
  MAX_METADATA_REVISION,
  submitMetadataProposalSchema,
  type SubmitMetadataProposal,
} from "./metadata-operations";

/** Trusted server snapshot, never request-body authority or a public DTO.
 * A future adapter must load title UUIDs (today's DTO does not expose them).
 * Future execution must reload/revalidate the whole aggregate under transaction
 * locks, including source preservation, authorization and final search bounds.
 * This helper neither loads nor authorizes nor writes anything.
 */
export type MetadataOperationContext = {
  readonly work: {
    readonly id: string;
    readonly slug: string;
    readonly primaryTitle: string;
    readonly primaryTitleLanguage: string;
    readonly revision: number;
    readonly visibility: "DRAFT" | "PUBLISHED" | "HIDDEN";
  };
  readonly titles: readonly {
    readonly id: string;
    readonly workId: string;
    readonly title: string;
    readonly language: string;
    readonly kind: "PRIMARY" | "ORIGINAL" | "ALIAS";
  }[];
  readonly descriptions: readonly {
    readonly workId: string;
    readonly language: string;
    readonly text: string;
  }[];
  readonly genreMemberships: readonly {
    readonly workId: string;
    readonly slug: string;
  }[];
  /** Explicit existing-row snapshot, not a request permission or active flag. */
  readonly existingGenreSlugs: readonly string[];
};

export type MetadataPreflightDenialCode =
  | "INVALID_INPUT"
  | "INVALID_CONTEXT"
  | "WORK_UNAVAILABLE"
  | "STALE_REVISION"
  | "REVISION_OVERFLOW"
  | "TARGET_MISSING"
  | "TARGET_PROTECTED"
  | "CONFLICT"
  | "NO_CHANGE"
  | "LIMIT_EXCEEDED";
export type MetadataPreflightResult =
  | { ok: true; proposal: SubmitMetadataProposal }
  | { ok: false; code: MetadataPreflightDenialCode };

const uuid = z
  .string()
  .uuid()
  .transform((v) => v.toLowerCase());
// Context is existing data: do not impose the new input Unicode policy on
// untouched legacy assertions, or retrofit their exact language keys.
const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((v) => v.trim() === v);
const language = z
  .string()
  .regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/)
  .max(63);
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(100);
const contextSchema = z.object({
  work: z.object({
    id: uuid,
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(160),
    primaryTitle: text(500),
    primaryTitleLanguage: language,
    revision: z.number().int().min(1).max(MAX_METADATA_REVISION),
    visibility: z.enum(["DRAFT", "PUBLISHED", "HIDDEN"]),
  }),
  titles: z
    .array(
      z.object({
        id: uuid,
        workId: uuid,
        title: text(500),
        language,
        kind: z.enum(["PRIMARY", "ORIGINAL", "ALIAS"]),
      }),
    )
    .max(31),
  descriptions: z
    .array(z.object({ workId: uuid, language, text: text(20000) }))
    .max(30),
  genreMemberships: z.array(z.object({ workId: uuid, slug })).max(10),
  existingGenreSlugs: z.array(slug),
});
const deny = (code: MetadataPreflightDenialCode): MetadataPreflightResult => ({
  ok: false,
  code,
});
const unique = (values: readonly string[]) =>
  new Set(values).size === values.length;

export function preflightMetadataProposal(
  input: unknown,
  context: MetadataOperationContext,
): MetadataPreflightResult {
  // Catch malformed objects/getters and parser/normalization failures as well as
  // ordinary schema failures. Never return raw input, context or error details.
  let proposal: SubmitMetadataProposal;
  try {
    const parsed = submitMetadataProposalSchema.safeParse(input);
    if (!parsed.success) return deny("INVALID_INPUT");
    proposal = parsed.data;
  } catch {
    return deny("INVALID_INPUT");
  }
  try {
    const parsed = contextSchema.safeParse(context);
    if (!parsed.success) return deny("INVALID_CONTEXT");
    const c = parsed.data;
    const w = c.work;
    if (w.visibility !== "PUBLISHED" || w.id !== proposal.workId.toLowerCase())
      return deny("WORK_UNAVAILABLE");
    if (w.revision !== proposal.baseWorkRevision) return deny("STALE_REVISION");
    if (w.revision === MAX_METADATA_REVISION) return deny("REVISION_OVERFLOW");
    const primary = c.titles.filter((t) => t.kind === "PRIMARY");
    const canonical = (t: (typeof c.titles)[number]) =>
      t.kind === "PRIMARY" &&
      t.language === w.primaryTitleLanguage &&
      t.title === w.primaryTitle;
    if (
      !unique(c.titles.map((t) => t.id)) ||
      c.titles.some(
        (t) =>
          t.workId !== w.id ||
          !normalizeTitle(t.title) ||
          normalizeTitle(t.title).length > 1000,
      ) ||
      c.descriptions.some((d) => d.workId !== w.id) ||
      c.genreMemberships.some((g) => g.workId !== w.id) ||
      !unique(primary.map((t) => t.language)) ||
      c.titles.filter(canonical).length !== 1 ||
      c.titles.filter((t) => t.kind === "ORIGINAL").length > 1 ||
      !unique(c.descriptions.map((d) => d.language)) ||
      !unique(c.genreMemberships.map((g) => g.slug)) ||
      !unique(c.existingGenreSlugs)
    )
      return deny("INVALID_CONTEXT");

    const op = proposal.operation;
    switch (op.type) {
      case "TITLE_ADD": {
        const v = op.value;
        if (c.titles.length >= 31) return deny("LIMIT_EXCEEDED");
        if (
          v.kind === "PRIMARY" &&
          primary.some((t) => t.language === v.language)
        )
          return deny("CONFLICT");
        if (
          c.titles.some(
            (t) =>
              t.language === v.language &&
              t.kind === v.kind &&
              (t.title === v.title ||
                normalizeTitle(t.title) === normalizeTitle(v.title)),
          )
        )
          return deny("CONFLICT");
        break;
      }
      case "TITLE_REPLACE":
      case "TITLE_REMOVE": {
        const target = c.titles.find((t) => t.id === op.titleId.toLowerCase());
        if (!target) return deny("TARGET_MISSING");
        if (target.kind === "ORIGINAL" || canonical(target))
          return deny("TARGET_PROTECTED");
        if (op.type === "TITLE_REPLACE") {
          if (target.title === op.title) return deny("NO_CHANGE");
          const oldNorm = normalizeTitle(target.title);
          const newNorm = normalizeTitle(op.title);
          if (
            c.titles.some(
              (t) =>
                t.id !== target.id &&
                t.language === target.language &&
                t.kind === target.kind &&
                ((op.title !== target.title && t.title === op.title) ||
                  (newNorm !== oldNorm && normalizeTitle(t.title) === newNorm)),
            )
          )
            return deny("CONFLICT");
        }
        break;
      }
      case "DESCRIPTION_ADD":
      case "DESCRIPTION_REPLACE":
      case "DESCRIPTION_REMOVE": {
        const target = c.descriptions.find((d) => d.language === op.language);
        if (op.type === "DESCRIPTION_ADD") {
          if (target) return deny("CONFLICT");
          if (c.descriptions.length >= 30) return deny("LIMIT_EXCEEDED");
        } else {
          if (!target) return deny("TARGET_MISSING");
          if (op.type === "DESCRIPTION_REPLACE" && target.text === op.text)
            return deny("NO_CHANGE");
        }
        break;
      }
      case "GENRE_ADD_MEMBERSHIP":
        if (!c.existingGenreSlugs.includes(op.slug))
          return deny("TARGET_MISSING");
        if (c.genreMemberships.some((g) => g.slug === op.slug))
          return deny("CONFLICT");
        if (c.genreMemberships.length >= 10) return deny("LIMIT_EXCEEDED");
        break;
      case "GENRE_REMOVE_MEMBERSHIP":
        if (!c.genreMemberships.some((g) => g.slug === op.slug))
          return deny("TARGET_MISSING");
        break;
      default: {
        const unsupported: never = op;
        void unsupported;
        return deny("INVALID_INPUT");
      }
    }
    return { ok: true, proposal };
  } catch {
    return deny("INVALID_CONTEXT");
  }
}
