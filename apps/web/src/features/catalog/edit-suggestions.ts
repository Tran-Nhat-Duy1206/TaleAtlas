import { z } from "zod";
import { RELEASE_STATUSES } from "@taleatlas/database/catalog-types";
import {
  normalizeTitle,
  sourceSchema,
  workInputSchema,
  type AdminWork,
  type WorkInput,
} from "./contracts";
const language = z
  .string()
  .regex(/^(?:und|[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/)
  .max(35);
export const editSuggestionPatchSchema = z
  .object({
    primaryTitle: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine((v) => !!normalizeTitle(v))
      .optional(),
    primaryTitleLanguage: language.optional(),
    releaseStatus: z.enum(RELEASE_STATUSES).optional(),
    publicationYear: z.number().int().min(1).max(9999).optional(),
    publicationLabel: z.string().trim().min(1).max(200).optional(),
    originalLanguage: language.optional(),
  })
  .strict()
  .refine(
    (v) => Object.values(v).some((x) => x !== undefined),
    "A correction is required",
  );
export const submitEditSuggestionSchema = z
  .object({
    submitKey: z.uuid(),
    baseWorkRevision: z.number().int().positive(),
    patch: editSuggestionPatchSchema,
    citation: sourceSchema,
  })
  .strict();
export const editSuggestionPageSchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
  .refine((v) => (v.page - 1) * v.pageSize <= 10000);
const reviewBase = {
  revision: z.number().int().positive(),
  baseWorkRevision: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2000),
};
export const reviewEditSuggestionSchema = z.discriminatedUnion("decision", [
  z.object({ ...reviewBase, decision: z.literal("REJECT") }).strict(),
  z
    .object({
      ...reviewBase,
      decision: z.literal("APPROVE"),
      metadataReviewAcknowledged: z.literal(true),
      publicationReviewAcknowledged: z.literal(true),
    })
    .strict(),
]);
export type EditSuggestionPatch = z.infer<typeof editSuggestionPatchSchema>;
export type SubmitEditSuggestion = z.infer<typeof submitEditSuggestionSchema>;
// A fixed ordered projection makes key-order/undefined differences irrelevant.
export function canonicalSuggestionInput(
  workId: string,
  value: SubmitEditSuggestion,
) {
  const p = value.patch,
    s = value.citation;
  return JSON.stringify({
    workId,
    baseWorkRevision: value.baseWorkRevision,
    patch: {
      primaryTitle: p.primaryTitle,
      primaryTitleLanguage: p.primaryTitleLanguage,
      releaseStatus: p.releaseStatus,
      publicationYear: p.publicationYear,
      publicationLabel: p.publicationLabel,
      originalLanguage: p.originalLanguage,
    },
    citation: {
      label: s.label,
      citation: s.citation,
      url: s.url,
      consultedAt: s.consultedAt,
    },
  });
}
export function applyReviewedSuggestion(
  current: AdminWork,
  patch: EditSuggestionPatch,
  citation: WorkInput["source"],
): WorkInput {
  // Exclude the aggregate's synthetic primary title only; retain every other assertion.
  const titles = current.titles.filter(
    (t) =>
      !(
        t.kind === "PRIMARY" &&
        t.title === current.primaryTitle &&
        t.language === current.primaryTitleLanguage
      ),
  );
  return workInputSchema.parse({
    primaryTitle: current.primaryTitle,
    primaryTitleLanguage: current.primaryTitleLanguage,
    format: current.format,
    visibility: current.visibility,
    releaseStatus: current.releaseStatus,
    originalLanguage: current.originalLanguage ?? undefined,
    country: current.country ?? undefined,
    publicationYear: current.publicationYear ?? undefined,
    publicationLabel: current.publicationLabel ?? undefined,
    titles,
    descriptions: current.descriptions,
    editions: current.editions,
    creators: current.creators,
    genres: current.genres,
    cover: current.cover ?? undefined,
    identifiers: current.identifiers,
    relations: current.relations.map(({ toWorkId, type }) => ({
      toWorkId,
      type,
    })),
    ...Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ),
    source: citation,
    publicationReviewAcknowledged: true,
  });
}
