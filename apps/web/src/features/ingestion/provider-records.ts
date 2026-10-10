import { z } from "zod";
import { WORK_FORMATS } from "@taleatlas/database/catalog-types";
import {
  ProviderCandidateSchema,
  ProvenanceSchema,
  CreatorCandidateSchema,
  EditionCandidateSchema,
  AlternativeTitleSchema,
  PRODUCTION_PROVIDER_POLICIES,
  type ProviderCandidate,
  type ProviderAdapter,
  type ProviderPolicy,
} from "./providers";
import {
  normalizeIngestionCandidate,
  NormalizedCandidateSchema,
} from "./pipeline";

/** OFFLINE fixture preparation only: no API access, adapter methods or rights approval. */
export const OfflineRecordContextSchema = z.strictObject({
  retrievedAt: z.iso.datetime({ offset: true }),
  sourceUpdatedAt: z.iso.datetime({ offset: true }).optional(),
});
export type OfflineRecordContext = z.infer<typeof OfflineRecordContextSchema>;
const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/);
const text = z.string().trim().min(1).max(500);
const localized = z.record(z.string().min(2).max(35), text);
// Only explicit named creators are accepted. References are deliberately not resolved.
const creator = CreatorCandidateSchema;
const isbn13 = z
  .string()
  .regex(/^\d{13}$/)
  .refine((value) => {
    const sum = [...value]
      .slice(0, 12)
      .reduce((n, digit, index) => n + Number(digit) * (index % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === Number(value[12]);
  }, "Invalid ISBN-13 checksum");
const common = {
  format: z.enum(WORK_FORMATS).optional(),
  creators: z.array(creator).max(50).optional(),
  editions: z.array(EditionCandidateSchema).max(50).optional(),
  isbn_13: z.array(isbn13).max(29).optional(),
  titleConflicts: z
    .array(z.strictObject({ value: text, provenance: ProvenanceSchema }))
    .max(10)
    .optional(),
};
// Unknown payload fields are stripped, never spread into persisted candidates.
const openRecord = z.object({
  key: z
    .string()
    .regex(/^\/works\/[A-Za-z0-9_-]+$/)
    .max(207),
  title: text.optional(),
  title_language: z.string().min(2).max(35).optional(),
  alternative_titles: z.array(AlternativeTitleSchema).max(49).optional(),
  ...common,
});
const mangaRecord = z.object({
  id,
  type: z.literal("manga"),
  attributes: z.object({
    title: localized.optional(),
    altTitles: z.array(localized).max(49).optional(),
    ...common,
  }),
});
function bound(raw: unknown) {
  const json = JSON.stringify(raw);
  if (json === undefined || new TextEncoder().encode(json).length > 32768)
    throw new Error("Offline record exceeds 32 KiB or is not JSON");
}
function candidate(
  providerId: "OPEN_LIBRARY" | "MANGADEX",
  sourceRecordId: string,
  sourceUrl: string,
  context: OfflineRecordContext,
  fields:
    | z.infer<typeof openRecord>
    | z.infer<typeof mangaRecord>["attributes"],
  title: string | undefined,
  alternatives: z.infer<typeof AlternativeTitleSchema>[],
): ProviderCandidate {
  const timestamp = OfflineRecordContextSchema.parse(context);
  // Synthetic fixture IDs never impersonate records on an official provider host.
  const citation = sourceRecordId.startsWith("synthetic")
    ? `https://fixtures.example.invalid/${providerId.toLowerCase()}/${sourceRecordId}`
    : sourceUrl;
  const provenance = ProvenanceSchema.parse({
    providerId,
    sourceRecordId,
    sourceUrl: citation,
    ...timestamp,
  });
  const wrap = <T>(value: T) => ({ value, provenance: [provenance] });
  const identifiers = [
    {
      namespace: providerId === "OPEN_LIBRARY" ? "openlibrary" : "mangadex",
      value: sourceRecordId,
    },
    ...(fields.isbn_13 ?? []).map((value) => ({ namespace: "ISBN13", value })),
  ];
  return ProviderCandidateSchema.parse({
    providerId,
    sourceRecordId,
    provenance: [provenance],
    identifiers: wrap(identifiers),
    ...(title !== undefined
      ? {
          title: {
            ...wrap(title),
            ...(fields.titleConflicts
              ? { conflictingEvidence: fields.titleConflicts }
              : {}),
          },
        }
      : {}),
    ...(fields.format ? { format: wrap(fields.format) } : {}),
    ...(alternatives.length ? { alternativeTitles: wrap(alternatives) } : {}),
    ...(fields.creators ? { creators: wrap(fields.creators) } : {}),
    ...(fields.editions ? { editions: wrap(fields.editions) } : {}),
    autoPublish: false,
    humanReviewRequired: true,
  });
}
/** Decode caller-supplied OFFLINE Open Library-shaped JSON; citations are inert strings. */
export function decodeOfflineOpenLibraryRecord(
  raw: unknown,
  context: OfflineRecordContext,
): ProviderCandidate {
  bound(raw);
  const r = openRecord.parse(raw);
  const sourceRecordId = id.parse(r.key.slice("/works/".length));
  const aliases = [...(r.alternative_titles ?? [])];
  if (r.title && r.title_language)
    aliases.unshift({ title: r.title, language: r.title_language });
  return candidate(
    "OPEN_LIBRARY",
    sourceRecordId,
    `https://openlibrary.org/works/${sourceRecordId}`,
    context,
    r,
    r.title,
    aliases,
  );
}
/** Localized title order is preserved; no original language/title or format inferred. */
export function decodeOfflineMangaDexRecord(
  raw: unknown,
  context: OfflineRecordContext,
): ProviderCandidate {
  bound(raw);
  const r = mangaRecord.parse(raw);
  const titles = Object.entries(r.attributes.title ?? {}).map(
    ([language, title]) => ({ title, language }),
  );
  const aliases = [
    ...titles,
    ...(r.attributes.altTitles ?? []).flatMap((map) =>
      Object.entries(map).map(([language, title]) => ({ title, language })),
    ),
  ];
  return candidate(
    "MANGADEX",
    r.id,
    `https://mangadex.org/title/${r.id}`,
    context,
    r.attributes,
    titles[0]?.title,
    aliases,
  );
}
/** Shared strict pipeline; UNKNOWN is explicit here because ProviderCandidate has no UNKNOWN enum. */
export function normalizeOfflineProviderRecord(
  candidateInput: ProviderCandidate,
) {
  const parsed = ProviderCandidateSchema.parse(candidateInput);
  const normalized = normalizeIngestionCandidate({
    origin: "PROVIDER",
    candidate: parsed,
  });
  return NormalizedCandidateSchema.parse({
    ...normalized,
    ...(!normalized.format
      ? {
          format: { value: "UNKNOWN", provenance: normalized.provenance },
        }
      : {}),
  });
}
/** Disabled descriptors, not implementations. Capability declarations do not grant methods. */
export function createDisabledProviderDescriptors(
  policies: readonly ProviderPolicy[] = PRODUCTION_PROVIDER_POLICIES,
): readonly ProviderAdapter[] {
  if (policies.some((policy) => policy.enabled))
    throw new Error("Offline registry accepts disabled policies only");
  return policies.map((policy) =>
    Object.freeze({
      providerId: policy.providerId,
      capabilities: Object.freeze([]),
    }),
  );
}
export const OFFLINE_DISABLED_PROVIDER_DESCRIPTORS =
  createDisabledProviderDescriptors();
