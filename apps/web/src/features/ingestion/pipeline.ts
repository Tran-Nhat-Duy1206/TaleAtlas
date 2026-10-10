import { z } from "zod";
import { WORK_FORMATS } from "../../../../../packages/database/src/catalog-types";
import {
  normalizeRequestTitle,
  requestDetailsSchema,
  evidenceUrlSchema,
  type RequestDetails,
} from "./contracts";
import {
  ProviderCandidateSchema,
  ProviderIdSchema,
  ProvenanceSchema,
  SourceIdentifierSchema,
  AlternativeTitleSchema,
  CreatorCandidateSchema,
  EditionCandidateSchema,
  CoverMetadataSchema,
  ReleaseEventSchema,
  type ProviderCandidate,
  type ProviderId,
} from "./providers";

// Only provider namespaces explicitly canonicalized by the existing catalog.
// Other provider IDs have no implied V1 work-identifier namespace.
export const PROVIDER_IDENTITY_NAMESPACES: Readonly<
  Partial<Record<ProviderId, string>>
> = Object.freeze({
  OPEN_LIBRARY: "openlibrary",
  MANGADEX: "mangadex",
});

export function normalizeIdentityIdentifier(identifier: {
  namespace: string;
  value: string;
}): { namespace: string; value: string } | null {
  if (!/^isbn(?:[-_ ]?(?:10|13))?$/i.test(identifier.namespace))
    return { ...identifier };
  const value = identifier.value.replace(/[ -]/g, "").toUpperCase();
  if (/^[0-9]{9}[0-9X]$/.test(value)) {
    const checksum = [...value].reduce(
      (sum, digit, index) =>
        sum + (digit === "X" ? 10 : Number(digit)) * (10 - index),
      0,
    );
    return checksum % 11 === 0 ? { namespace: "isbn10", value } : null;
  }
  if (/^[0-9]{13}$/.test(value)) {
    const checksum = [...value].reduce(
      (sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3),
      0,
    );
    return checksum % 10 === 0 ? { namespace: "isbn13", value } : null;
  }
  return null;
}

const text = z.string().min(1).max(600);
const requestEvidence = z.strictObject({
  sourceKind: z.literal("REQUEST_INPUT"),
  requestId: z.uuid(),
  inputRevision: z.number().int().positive(),
  verified: z.literal(false),
});
const providerEvidence = ProvenanceSchema.extend({
  sourceKind: z.literal("PROVIDER"),
});
export const IngestionEvidenceSchema = z.union([
  requestEvidence,
  providerEvidence,
]);
const fact = <T extends z.ZodType>(value: T) =>
  z.strictObject({
    value,
    provenance: z.array(IngestionEvidenceSchema).min(1).max(10),
    conflictingEvidence: z
      .array(z.strictObject({ value, provenance: IngestionEvidenceSchema }))
      .max(10)
      .optional(),
  });
export const NormalizedCandidateSchema = z
  .strictObject({
    origin: z.enum(["REQUEST_INPUT", "PROVIDER"]),
    providerRecord: z
      .strictObject({
        providerId: ProviderIdSchema,
        sourceRecordId: z.string().min(1).max(200),
      })
      .optional(),
    provenance: z.array(IngestionEvidenceSchema).min(1).max(10),
    title: fact(text).optional(),
    originalTitle: fact(text).optional(),
    format: fact(z.enum([...WORK_FORMATS, "UNKNOWN"])).optional(),
    alternativeTitles: fact(
      z.array(AlternativeTitleSchema.extend({ title: text })).max(50),
    ).optional(),
    creators: fact(z.array(CreatorCandidateSchema).max(50)).optional(),
    identifiers: fact(z.array(SourceIdentifierSchema).max(30)).optional(),
    editions: fact(z.array(EditionCandidateSchema).max(50)).optional(),
    covers: fact(z.array(CoverMetadataSchema).max(10)).optional(),
    releaseEvents: fact(z.array(ReleaseEventSchema).max(50)).optional(),
    originalLanguage: fact(z.string().min(2).max(35)).optional(),
    publicationLanguage: fact(z.string().min(2).max(35)).optional(),
    publicationYear: fact(z.number().int().min(1).max(9999)).optional(),
    description: fact(z.string().min(1).max(4000)).optional(),
    requestCitation: evidenceUrlSchema.optional(),
    lookupTitles: z.array(z.string().max(600)).max(600),
    autoPublish: z.literal(false),
    humanReviewRequired: z.literal(true),
  })
  .superRefine((value, ctx) => {
    const evidence = [...value.provenance];
    for (const key of [
      "title",
      "originalTitle",
      "format",
      "alternativeTitles",
      "creators",
      "identifiers",
      "editions",
      "covers",
      "releaseEvents",
      "originalLanguage",
      "publicationLanguage",
      "publicationYear",
      "description",
    ] as const) {
      const f = value[key];
      if (f)
        evidence.push(
          ...f.provenance,
          ...(f.conflictingEvidence?.map((x) => x.provenance) ?? []),
        );
    }
    if (evidence.some((p) => p.sourceKind !== value.origin)) {
      ctx.addIssue({
        code: "custom",
        message: "All evidence must match the candidate origin",
      });
    }
    if (value.origin === "PROVIDER") {
      const record = value.providerRecord;
      if (
        !record ||
        !value.provenance.some(
          (p) =>
            p.sourceKind === "PROVIDER" &&
            p.providerId === record.providerId &&
            p.sourceRecordId === record.sourceRecordId,
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["providerRecord"],
          message:
            "Provider candidates require their principal record and matching envelope provenance",
        });
      }
    }
    if (value.origin === "REQUEST_INPUT") {
      if (value.providerRecord !== undefined)
        ctx.addIssue({
          code: "custom",
          path: ["providerRecord"],
          message: "Request input cannot claim a provider record",
        });
      const first = value.provenance[0];
      if (
        first.sourceKind === "REQUEST_INPUT" &&
        evidence.some(
          (p) =>
            p.sourceKind === "REQUEST_INPUT" &&
            (p.requestId !== first.requestId ||
              p.inputRevision !== first.inputRevision),
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Request evidence must share the same request and input revision",
        });
      }
      if (value.releaseEvents !== undefined)
        ctx.addIssue({
          code: "custom",
          message:
            "Provider release events cannot impersonate request evidence",
        });
    }
  })
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).length <= 32768,
    "Candidate snapshot exceeds 32 KiB",
  );
export type NormalizedCandidate = z.infer<typeof NormalizedCandidateSchema>;
export type IngestionCandidateInput =
  | {
      origin: "REQUEST_INPUT";
      requestId: string;
      inputRevision: number;
      details: RequestDetails;
    }
  | { origin: "PROVIDER"; candidate: ProviderCandidate };
const inputSchema = z.discriminatedUnion("origin", [
  z.strictObject({
    origin: z.literal("REQUEST_INPUT"),
    requestId: z.uuid(),
    inputRevision: z.number().int().positive(),
    details: requestDetailsSchema,
  }),
  z.strictObject({
    origin: z.literal("PROVIDER"),
    candidate: ProviderCandidateSchema,
  }),
]);

/** Pure snapshot only. Citations and cover URLs are inert strings, never image assets. */
export function normalizeIngestionCandidate(
  input: IngestionCandidateInput,
): NormalizedCandidate {
  const parsed = inputSchema.parse(input);
  const output: Record<string, unknown> = {
    origin: parsed.origin,
    autoPublish: false,
    humanReviewRequired: true,
  };
  if (parsed.origin === "REQUEST_INPUT") {
    const evidence = requestEvidence.parse({
      sourceKind: "REQUEST_INPUT",
      requestId: parsed.requestId,
      inputRevision: parsed.inputRevision,
      verified: false,
    });
    output.provenance = [evidence];
    const wrap = (value: unknown) => ({ value, provenance: [evidence] });
    const d = parsed.details;
    for (const key of [
      "title",
      "originalTitle",
      "format",
      "originalLanguage",
      "publicationLanguage",
      "publicationYear",
      "description",
    ] as const) {
      if (d[key] !== undefined) output[key] = wrap(d[key]);
    }
    output.alternativeTitles = wrap(
      d.alternativeTitles.map((title) => ({ title })),
    );
    if (d.author !== undefined)
      output.creators = wrap([{ name: d.author, role: "AUTHOR" }]);
    if (d.sourceUrl !== undefined) output.requestCitation = d.sourceUrl;
  } else {
    const c = parsed.candidate;
    const evidence = (p: z.infer<typeof ProvenanceSchema>) => ({
      ...p,
      sourceKind: "PROVIDER" as const,
    });
    // Keep the envelope record even when individual facts cite other records.
    if (
      !c.provenance.some(
        (p) =>
          p.providerId === c.providerId &&
          p.sourceRecordId === c.sourceRecordId,
      )
    ) {
      throw new Error("Provider envelope record must have its own provenance");
    }
    output.providerRecord = {
      providerId: c.providerId,
      sourceRecordId: c.sourceRecordId,
    };
    output.provenance = c.provenance.map(evidence);
    for (const key of [
      "title",
      "format",
      "identifiers",
      "alternativeTitles",
      "creators",
      "editions",
      "covers",
      "releaseEvents",
    ] as const) {
      const f = c[key];
      if (f)
        output[key] = {
          value: f.value,
          provenance: f.provenance.map(evidence),
          ...(f.conflictingEvidence
            ? {
                conflictingEvidence: f.conflictingEvidence.map((x) => ({
                  value: x.value,
                  provenance: evidence(x.provenance),
                })),
              }
            : {}),
        };
    }
  }
  const titleFact = output.title as NormalizedCandidate["title"];
  const original = output.originalTitle as NormalizedCandidate["originalTitle"];
  const aliases =
    output.alternativeTitles as NormalizedCandidate["alternativeTitles"];
  const titles = [
    titleFact?.value,
    original?.value,
    ...(aliases?.value.map((x) => x.title) ?? []),
    ...(titleFact?.conflictingEvidence?.map((x) => x.value) ?? []),
    ...(aliases?.conflictingEvidence?.flatMap((x) =>
      x.value.map((t) => t.title),
    ) ?? []),
  ].filter((x): x is string => x !== undefined);
  output.lookupTitles = [
    ...new Set(titles.map(normalizeRequestTitle).filter(Boolean)),
  ];
  // Remove explicitly undefined optional properties; the persisted value is strict JSON.
  return NormalizedCandidateSchema.parse(JSON.parse(JSON.stringify(output)));
}

export const IdentityWorkSchema = z.strictObject({
  id: z.uuid(),
  format: z.enum([...WORK_FORMATS, "UNKNOWN"]),
  titles: z
    .array(
      z.strictObject({
        title: text,
        language: z.string().min(2).max(35).optional(),
      }),
    )
    .max(100),
  creators: z.array(CreatorCandidateSchema).max(100),
  identifiers: z.array(SourceIdentifierSchema).max(100),
  providerSourceIds: z
    .array(
      z.strictObject({
        providerId: ProviderIdSchema,
        sourceRecordId: z.string().min(1).max(200),
      }),
    )
    .max(100),
});
export type IdentityWork = z.infer<typeof IdentityWorkSchema>;
export const IdentityMatchSchema = z.strictObject({
  workId: z.uuid(),
  reasons: z
    .array(
      z.strictObject({
        kind: z.enum([
          "EXACT_IDENTIFIER",
          "EXACT_PROVIDER_RECORD",
          "NORMALIZED_ALIAS",
        ]),
        value: z.string().min(1).max(600),
        strength: z.enum(["EXACT", "WEAK"]),
      }),
    )
    .min(1)
    .max(1640),
  conflicts: z.array(z.string().min(1).max(500)).max(20),
  ambiguous: z.boolean(),
  autoPublish: z.literal(false),
  humanReviewRequired: z.literal(true),
});
export type IdentityMatch = z.infer<typeof IdentityMatchSchema>;

/** Retrieval explanations, not identity decisions. No fuzzy matching or UUID rewriting. */
export function identityMatch(
  candidate: NormalizedCandidate,
  existing: IdentityWork[],
): IdentityMatch[] {
  const c = NormalizedCandidateSchema.parse(candidate);
  const works = z.array(IdentityWorkSchema).max(10000).parse(existing);
  const identifiers = [
    ...(c.identifiers?.value ?? []),
    ...(c.editions?.value.flatMap((e) => e.identifiers ?? []) ?? []),
  ]
    .map(normalizeIdentityIdentifier)
    .filter((i): i is { namespace: string; value: string } => i !== null);
  // Bibliographic citations may refer to creators or editions; only the principal
  // provider envelope record is work-identity evidence.
  const records = c.providerRecord ? [c.providerRecord] : [];
  const results: IdentityMatch[] = [];
  for (const w of works) {
    const reasons: IdentityMatch["reasons"] = [];
    const conflicts: string[] = [];
    const existingIdentifiers = w.identifiers
      .map(normalizeIdentityIdentifier)
      .filter((i): i is { namespace: string; value: string } => i !== null);
    for (const i of identifiers)
      if (
        existingIdentifiers.some(
          (x) => x.namespace === i.namespace && x.value === i.value,
        )
      ) {
        reasons.push({
          kind: "EXACT_IDENTIFIER",
          value: `${i.namespace}:${i.value}`,
          strength: "EXACT",
        });
        if (/^isbn(?:[-_ ]?(?:10|13))?$/i.test(i.namespace))
          conflicts.push("ISBN identifies an edition, not a unique work");
      }
    for (const p of records)
      if (
        w.providerSourceIds.some(
          (x) =>
            x.providerId === p.providerId &&
            x.sourceRecordId === p.sourceRecordId,
        )
      )
        reasons.push({
          kind: "EXACT_PROVIDER_RECORD",
          value: `${p.providerId}:${p.sourceRecordId}`,
          strength: "EXACT",
        });
    for (const t of w.titles) {
      const normalized = normalizeRequestTitle(t.title);
      if (normalized && c.lookupTitles.includes(normalized))
        reasons.push({
          kind: "NORMALIZED_ALIAS",
          value: normalized,
          strength: "WEAK",
        });
    }
    if (!reasons.length) continue;
    if (
      c.format &&
      c.format.value !== "UNKNOWN" &&
      w.format !== "UNKNOWN" &&
      c.format.value !== w.format
    )
      conflicts.push("Format mismatch");
    const authors =
      c.creators?.value.filter(
        (x) => x.role === "AUTHOR" || x.role === "WRITER",
      ) ?? [];
    const knownAuthors = w.creators.filter(
      (x) => x.role === "AUTHOR" || x.role === "WRITER",
    );
    if (
      authors.length &&
      knownAuthors.length &&
      !authors.some((a) =>
        knownAuthors.some(
          (b) =>
            normalizeRequestTitle(a.name) === normalizeRequestTitle(b.name),
        ),
      )
    )
      conflicts.push("Author mismatch");
    if (
      c.title?.conflictingEvidence?.length ||
      c.format?.conflictingEvidence?.length ||
      c.identifiers?.conflictingEvidence?.length ||
      c.creators?.conflictingEvidence?.length ||
      c.editions?.conflictingEvidence?.length
    )
      conflicts.push("Candidate contains conflicting evidence");
    results.push({
      workId: w.id,
      reasons,
      conflicts: [...new Set(conflicts)],
      ambiguous:
        conflicts.length > 0 || reasons.every((r) => r.strength === "WEAK"),
      autoPublish: false,
      humanReviewRequired: true,
    });
  }
  for (const result of results) {
    if (
      result.reasons.some(
        (r) =>
          r.strength === "EXACT" &&
          results.some(
            (other) =>
              other !== result &&
              other.reasons.some(
                (x) => x.kind === r.kind && x.value === r.value,
              ),
          ),
      )
    ) {
      result.ambiguous = true;
      result.conflicts.push("Exact evidence matches multiple Work UUIDs");
    }
  }
  return z.array(IdentityMatchSchema).max(10000).parse(results);
}
