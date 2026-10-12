import { z } from "zod";
import type { LibraryEntryDetail } from "../../server/library/service";
import { libraryPatchSchema } from "./contracts";

/** Optional private ENTRY data only; session/progress notes are separate C data. */
export const personalHttpDetailsSchema = z
  .object({
    id: z.uuid(),
    workId: z.uuid(),
    revision: z.number().int().min(1).max(10000),
    ratingHalfStars: z.number().int().min(2).max(10).nullable(),
    notes: z
      .string()
      .regex(
        /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]*$/u,
        "Unsafe text control character",
      )
      .max(4000),
    archived: z.boolean(),
  })
  .strict();
export type PersonalHttpDetails = z.infer<typeof personalHttpDetailsSchema>;
export const personalHttpMutationResponseSchema = personalHttpDetailsSchema;

/** Parse the narrow D facade before the unchanged frozen canonical command. */
export const personalHttpPatchSchema = z
  .object({
    revision: libraryPatchSchema.shape.revision,
    mutationKey: libraryPatchSchema.shape.mutationKey,
    patch: z
      .object({
        ratingHalfStars: libraryPatchSchema.shape.patch.shape.ratingHalfStars,
        notes: libraryPatchSchema.shape.patch.shape.notes,
      })
      .strict()
      .refine(
        (value) => Object.values(value).some((field) => field !== undefined),
        "Provide at least one personal entry change",
      ),
  })
  .strict()
  .pipe(libraryPatchSchema);
export type PersonalHttpPatchInput = z.input<typeof personalHttpPatchSchema>;

/** Never serialize Work metadata, reading facts, identity, replay keys or snapshots. */
export function personalHttpEntry(
  entry: LibraryEntryDetail,
): PersonalHttpDetails {
  return {
    id: entry.id,
    workId: entry.workId,
    revision: entry.revision,
    ratingHalfStars: entry.ratingHalfStars,
    notes: entry.notes,
    archived: entry.archived,
  };
}
