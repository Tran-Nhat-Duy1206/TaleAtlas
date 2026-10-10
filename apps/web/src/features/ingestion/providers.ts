import { z } from "zod";
import {
  WORK_FORMATS,
  CREATOR_ROLES,
  COVER_RIGHTS,
} from "@taleatlas/database/catalog-types";

// Pure V2A contracts. URLs are evidence strings, never instructions to fetch.
export const PROVIDER_CAPABILITIES = [
  "SEARCH_WORKS",
  "GET_WORK_DETAILS",
  "GET_EDITIONS",
  "GET_CREATORS",
  "GET_ALTERNATIVE_TITLES",
  "GET_COVER_METADATA",
  "DISCOVER_NEW_WORKS",
  "GET_RELEASE_EVENTS",
] as const;
export const ProviderCapabilitySchema = z.enum(PROVIDER_CAPABILITIES);
export type ProviderCapability = z.infer<typeof ProviderCapabilitySchema>;
export const ProviderIdSchema = z.enum([
  "MANGADEX",
  "OPEN_LIBRARY",
  "GOOGLE_BOOKS",
  "OFFICIAL_FEED",
]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;
export const ProviderReviewStateSchema = z.enum([
  "UNREVIEWED",
  "REVIEWED",
  "BLOCKED",
]);
export const ProviderApprovalStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
]);
const shortText = z.string().trim().min(1).max(500);
const identifier = z.string().trim().min(1).max(200);
const evidenceUrl = z
  .string()
  .max(2048)
  .url()
  .refine((value) => value.startsWith("https://"), "HTTPS evidence only");
const timestamp = z.iso.datetime({ offset: true });
const reviewDate = z.iso.date();

export const ProviderPolicySchema = z
  .strictObject({
    providerId: ProviderIdSchema,
    reviewState: ProviderReviewStateSchema,
    reviewStatus: ProviderReviewStateSchema,
    metadataStorageAllowed: z.boolean(),
    rateLimit: z
      .strictObject({
        maxRequests: z.number().int().min(1).max(10000),
        intervalSeconds: z.number().int().min(1).max(86400),
      })
      .nullable(),
    reviewedAt: reviewDate.optional(),
    documentationUrls: z.array(evidenceUrl).max(20),
    capabilities: z.array(ProviderCapabilitySchema).max(8),
    formats: z.array(z.enum(WORK_FORMATS)).max(WORK_FORMATS.length),
    auth: z.enum([
      "NONE",
      "IDENTIFIED_USER_AGENT",
      "API_KEY",
      "OAUTH",
      "PARTNER_AGREEMENT",
      "UNRESOLVED",
    ]),
    // null means unknown, not unlimited. These are conservative local budgets, not grants.
    rateIntervalMs: z.number().int().min(1).max(86_400_000).nullable(),
    rateMaxRequests: z.number().int().min(1).max(10000).nullable(),
    timeoutMs: z.number().int().min(100).max(60000),
    attribution: z.array(shortText).max(20),
    storageCommercialRestrictions: z
      .array(z.string().trim().min(1).max(2000))
      .max(20),
    covers: z.strictObject({
      metadataOnly: z.literal(true),
      transferImages: z.literal(false),
      rightsReviewRequired: z.literal(true),
    }),
    approvalStatus: ProviderApprovalStatusSchema,
    intendedUseReview: z.string().trim().min(1).max(4000).optional(),
    enabled: z.boolean(),
    autoPublish: z.literal(false),
    humanReviewRequired: z.literal(true),
  })
  .superRefine((policy, ctx) => {
    if (policy.reviewState !== policy.reviewStatus) {
      ctx.addIssue({
        code: "custom",
        path: ["reviewStatus"],
        message: "Review status must match review state",
      });
    }
    if (
      policy.rateLimit !== null &&
      (policy.rateIntervalMs !== policy.rateLimit.intervalSeconds * 1000 ||
        policy.rateMaxRequests !== policy.rateLimit.maxRequests)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["rateLimit"],
        message: "Rate budget representations must agree",
      });
    }
    if (policy.reviewState === "REVIEWED" && !policy.reviewedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["reviewedAt"],
        message: "Reviewed policy needs review date",
      });
    }
    if (
      policy.enabled &&
      (policy.reviewState !== "REVIEWED" ||
        policy.approvalStatus !== "APPROVED" ||
        !policy.intendedUseReview ||
        !policy.reviewedAt ||
        policy.documentationUrls.length === 0 ||
        policy.rateIntervalMs === null ||
        policy.rateMaxRequests === null ||
        policy.auth === "UNRESOLVED" ||
        !policy.metadataStorageAllowed ||
        policy.rateLimit === null)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["enabled"],
        message:
          "Enabling requires documented intended-use approval and operational limits",
      });
    }
  });
export type ProviderPolicy = z.infer<typeof ProviderPolicySchema>;
export const providerPolicySchema = ProviderPolicySchema;
export const providerCapabilitySchema = ProviderCapabilitySchema;

export const SourceIdentifierSchema = z.strictObject({
  namespace: identifier,
  value: identifier,
});
export const ProvenanceSchema = z.strictObject({
  providerId: ProviderIdSchema,
  sourceRecordId: identifier,
  sourceUrl: evidenceUrl.optional(),
  retrievedAt: timestamp,
  sourceUpdatedAt: timestamp.optional(),
  identifiers: z.array(SourceIdentifierSchema).max(30).optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;
// Every fact carries evidence independently; conflicting values survive normalization.
const fact = <T extends z.ZodType>(value: T) =>
  z.strictObject({
    value,
    provenance: z.array(ProvenanceSchema).min(1).max(10),
    conflictingEvidence: z
      .array(z.strictObject({ value, provenance: ProvenanceSchema }))
      .max(10)
      .optional(),
  });
export const AlternativeTitleSchema = z.strictObject({
  title: shortText,
  language: z.string().min(2).max(35).optional(),
});
export const CreatorCandidateSchema = z.strictObject({
  name: shortText,
  role: z.enum(CREATOR_ROLES).optional(),
  identifiers: z.array(SourceIdentifierSchema).max(20).optional(),
});
export const EditionCandidateSchema = z.strictObject({
  sourceRecordId: identifier.optional(),
  title: shortText.optional(),
  identifiers: z.array(SourceIdentifierSchema).max(30).optional(),
  publisher: shortText.optional(),
  publicationDate: z
    .string()
    .max(10)
    .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/)
    .optional(),
  language: z.string().min(2).max(35).optional(),
});
export const CoverMetadataSchema = z
  .strictObject({
    sourceCoverId: identifier.optional(),
    sourceUrl: evidenceUrl.optional(),
    rights: z.enum(COVER_RIGHTS),
    rightsEvidenceUrl: evidenceUrl.optional(),
    attribution: shortText.optional(),
    width: z.number().int().positive().max(100000).optional(),
    height: z.number().int().positive().max(100000).optional(),
    transferImages: z.literal(false),
  })
  .superRefine((cover, ctx) => {
    if (cover.rights !== "UNKNOWN" && !cover.rightsEvidenceUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["rightsEvidenceUrl"],
        message: "Known rights require evidence",
      });
    }
  });
export const ReleaseEventSchema = z.strictObject({
  sourceEventId: identifier,
  kind: z.enum(["ANNOUNCEMENT", "PUBLICATION", "UPDATE"]),
  date: z.iso.date().optional(),
  label: shortText.optional(),
  provenance: ProvenanceSchema,
});
export const ProviderCandidateSchema = z.strictObject({
  providerId: ProviderIdSchema,
  sourceRecordId: identifier,
  provenance: z.array(ProvenanceSchema).min(1).max(10),
  title: fact(shortText).optional(),
  format: fact(z.enum(WORK_FORMATS)).optional(),
  identifiers: fact(z.array(SourceIdentifierSchema).max(30)).optional(),
  alternativeTitles: fact(z.array(AlternativeTitleSchema).max(50)).optional(),
  creators: fact(z.array(CreatorCandidateSchema).max(50)).optional(),
  editions: fact(z.array(EditionCandidateSchema).max(50)).optional(),
  covers: fact(z.array(CoverMetadataSchema).max(10)).optional(),
  releaseEvents: fact(z.array(ReleaseEventSchema).max(50)).optional(),
  autoPublish: z.literal(false),
  humanReviewRequired: z.literal(true),
});
export type ProviderCandidate = z.infer<typeof ProviderCandidateSchema>;
export type CreatorCandidate = z.infer<typeof CreatorCandidateSchema>;
export type EditionCandidate = z.infer<typeof EditionCandidateSchema>;
export type AlternativeTitle = z.infer<typeof AlternativeTitleSchema>;
export type CoverMetadata = z.infer<typeof CoverMetadataSchema>;
export type ReleaseEvent = z.infer<typeof ReleaseEventSchema>;

export const ProviderLookupSchema = z.strictObject({
  sourceRecordId: identifier,
});
export const ProviderSearchSchema = z.strictObject({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(20),
});
export const ProviderDiscoverySchema = z.strictObject({
  cursor: identifier.optional(),
  limit: z.number().int().min(1).max(20),
});
export type EvidencedFact<T> = {
  value: T;
  provenance: Provenance[];
  conflictingEvidence?: { value: T; provenance: Provenance }[];
};
export interface ProviderAdapterContext {
  readonly signal: AbortSignal;
  readonly requestedAt: string;
}
// Optional capability methods must be absent when unsupported, not throwing stubs.
// Future V2C runner must enforce policy/capability gates and parse every result.
export interface ProviderAdapter {
  readonly providerId: ProviderId;
  readonly capabilities: readonly ProviderCapability[];
  searchWorks?(
    input: z.infer<typeof ProviderSearchSchema>,
    context: ProviderAdapterContext,
  ): Promise<ProviderCandidate[]>;
  getWorkDetails?(
    input: z.infer<typeof ProviderLookupSchema>,
    context: ProviderAdapterContext,
  ): Promise<ProviderCandidate>;
  getEditions?(
    input: z.infer<typeof ProviderLookupSchema>,
    context: ProviderAdapterContext,
  ): Promise<EvidencedFact<EditionCandidate>[]>;
  getCreators?(
    input: z.infer<typeof ProviderLookupSchema>,
    context: ProviderAdapterContext,
  ): Promise<EvidencedFact<CreatorCandidate>[]>;
  getAlternativeTitles?(
    input: z.infer<typeof ProviderLookupSchema>,
    context: ProviderAdapterContext,
  ): Promise<EvidencedFact<AlternativeTitle>[]>;
  getCoverMetadata?(
    input: z.infer<typeof ProviderLookupSchema>,
    context: ProviderAdapterContext,
  ): Promise<EvidencedFact<CoverMetadata>[]>;
  discoverNewWorks?(
    input: z.infer<typeof ProviderDiscoverySchema>,
    context: ProviderAdapterContext,
  ): Promise<ProviderCandidate[]>;
  getReleaseEvents?(
    input: z.infer<typeof ProviderLookupSchema>,
    context: ProviderAdapterContext,
  ): Promise<ReleaseEvent[]>;
}

const metadataCapabilities = [
  "SEARCH_WORKS",
  "GET_WORK_DETAILS",
  "GET_EDITIONS",
  "GET_CREATORS",
  "GET_ALTERNATIVE_TITLES",
  "GET_COVER_METADATA",
] as const;
const disabledDefaults = {
  reviewedAt: "2026-10-09",
  approvalStatus: "PENDING",
  enabled: false,
  autoPublish: false,
  humanReviewRequired: true,
  timeoutMs: 10000,
  metadataStorageAllowed: false,
  rateLimit: null,
  covers: {
    metadataOnly: true,
    transferImages: false,
    rightsReviewRequired: true,
  },
} as const;
export const PRODUCTION_PROVIDER_POLICIES: readonly ProviderPolicy[] = z
  .array(ProviderPolicySchema)
  .parse([
    {
      ...disabledDefaults,
      providerId: "OPEN_LIBRARY",
      reviewState: "REVIEWED",
      reviewStatus: "REVIEWED",
      capabilities: metadataCapabilities,
      formats: WORK_FORMATS,
      documentationUrls: [
        "https://openlibrary.org/developers/api",
        "https://openlibrary.org/developers/licensing",
        "https://openlibrary.org/dev/docs/api/covers",
      ],
      auth: "IDENTIFIED_USER_AGENT",
      rateIntervalMs: 1000,
      rateMaxRequests: 1,
      rateLimit: { maxRequests: 1, intervalSeconds: 1 },
      attribution: [
        "Preserve source record links; courtesy Open Library link appreciated.",
      ],
      storageCommercialRestrictions: [
        "Human-requested low-volume lookup only; no bulk API harvest or high-traffic commercial backend.",
        "Cache where permitted; third-party rights remain unresolved for some contributions.",
        "Production approval pending safe intended-use review; no automatic discovery.",
      ],
    },
    {
      ...disabledDefaults,
      providerId: "GOOGLE_BOOKS",
      reviewState: "REVIEWED",
      reviewStatus: "REVIEWED",
      capabilities: ["SEARCH_WORKS", "GET_WORK_DETAILS", "GET_COVER_METADATA"],
      formats: WORK_FORMATS,
      documentationUrls: [
        "https://developers.google.com/books/terms?hl=en",
        "https://developers.google.com/terms?hl=en",
        "https://developers.google.com/books/branding",
        "https://developers.google.com/books/docs/v1/using",
      ],
      auth: "API_KEY",
      rateIntervalMs: null,
      rateMaxRequests: null,
      attribution: [
        "Google attribution and primary Google Books links required; preserve result ordering and notices.",
      ],
      storageCommercialRestrictions: [
        "General terms section 5e restrict permanent copies/database building absent owner or legal permission; cache limited by headers.",
        "Books terms prohibit charging app users absent separate agreement/written permission.",
        "Project quota and intended-use rights unresolved; no permanent catalog ingestion approval.",
      ],
    },
    {
      ...disabledDefaults,
      providerId: "MANGADEX",
      reviewState: "BLOCKED",
      reviewStatus: "BLOCKED",
      capabilities: [],
      formats: ["MANGA", "MANHWA", "MANHUA"],
      documentationUrls: [
        "https://api.mangadex.org/docs/",
        "https://api.mangadex.org/docs/swagger.html",
      ],
      auth: "UNRESOLVED",
      rateIntervalMs: null,
      rateMaxRequests: null,
      attribution: ["Attribution requirements unresolved."],
      storageCommercialRestrictions: [
        "Official documentation retrieval failed during review; do not infer permission, quota or storage rights from third-party summaries.",
      ],
    },
    {
      ...disabledDefaults,
      providerId: "OFFICIAL_FEED",
      reviewState: "UNREVIEWED",
      reviewStatus: "UNREVIEWED",
      capabilities: [],
      formats: WORK_FORMATS,
      documentationUrls: [
        "https://developer.penguinrandomhouse.com/",
        "https://www.penguinrandomhouse.biz/vendors/rhi_datafeeds",
      ],
      auth: "PARTNER_AGREEMENT",
      rateIntervalMs: null,
      rateMaxRequests: null,
      attribution: ["Per-publisher/author agreement required."],
      storageCommercialRestrictions: [
        "Placeholder category, not blanket approval. Approve each named source, delivery method, storage/commercial use and images separately.",
        "Public feed availability is not a license; customer feed onboarding does not establish TaleAtlas eligibility.",
      ],
    },
  ]);
