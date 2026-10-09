import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  cancelRequestSchema,
  canTransitionRequest,
  evidenceUrlSchema,
  normalizeRequestTitle,
  requestDetailsSchema,
  requestModerationSchema,
  requestPageSchema,
  submitRequestSchema,
} from "../../apps/web/src/features/ingestion/contracts";
import {
  ProviderCandidateSchema,
  ProviderPolicySchema,
  PRODUCTION_PROVIDER_POLICIES,
} from "../../apps/web/src/features/ingestion/providers";

describe("V2A request and provider boundaries", () => {
  it("requires only title and format including unknown, without invented bibliographic facts", () => {
    expect(
      requestDetailsSchema.parse({
        title: " Missing story ",
        format: "UNKNOWN",
      }),
    ).toEqual({
      title: "Missing story",
      format: "UNKNOWN",
      alternativeTitles: [],
    });
    expect(
      submitRequestSchema.parse({
        submitKey: randomUUID(),
        details: { title: "物語", format: "MANGA" },
      }).details.author,
    ).toBeUndefined();
    expect(
      requestDetailsSchema.safeParse({ title: "---", format: "UNKNOWN" })
        .success,
    ).toBe(false);
    expect(
      requestDetailsSchema.safeParse({
        title: "X",
        format: "UNKNOWN",
        ownerUserId: "forged",
      }).success,
    ).toBe(false);
  });
  it("retains original and translated spellings, normalizing lookup only", () => {
    const value = requestDetailsSchema.parse({
      title: "Đường về",
      format: "NOVEL",
      alternativeTitles: ["The Way Home", "道"],
      originalTitle: "道",
      originalLanguage: "JA",
      publicationLanguage: "vi",
    });
    expect(value.title).toBe("Đường về");
    expect(value.alternativeTitles).toEqual(["The Way Home", "道"]);
    expect(value.originalLanguage).toBe("ja");
    expect(normalizeRequestTitle(value.title)).toBe("duong ve");
    expect(normalizeRequestTitle("Ｄｕｏｎｇ   Ve")).toBe("duong ve");
  });
  it.each([
    "http://127.0.0.1/private",
    "http://2130706433/",
    "http://[::1]/",
    "https://user:pass@example.org/",
    "file:///secret",
    "https://host.local/",
    "https://metadata.google.internal/",
    "https://example.org:8080/",
  ])("rejects malicious/private citation %s without fetching it", (value) => {
    expect(evidenceUrlSchema.safeParse(value).success).toBe(false);
  });
  it("bounds request input, revisions and pagination", () => {
    expect(
      requestDetailsSchema.safeParse({
        title: "ﬃ".repeat(250),
        format: "NOVEL",
      }).success,
    ).toBe(false);
    expect(evidenceUrlSchema.parse("https://example.org/book")).toBe(
      "https://example.org/book",
    );
    expect(
      requestDetailsSchema.safeParse({
        title: "x".repeat(601),
        format: "NOVEL",
      }).success,
    ).toBe(false);
    expect(
      requestDetailsSchema.safeParse({
        title: "x",
        format: "NOVEL",
        alternativeTitles: Array(13).fill("x"),
      }).success,
    ).toBe(false);
    expect(
      requestDetailsSchema.safeParse({
        title: "x",
        format: "NOVEL",
        description: "界".repeat(4000),
        notes: "界".repeat(2000),
      }).success,
    ).toBe(false);
    expect(
      requestDetailsSchema.safeParse({
        title: "x",
        format: "NOVEL",
        publicationYear: 0,
      }).success,
    ).toBe(false);
    expect(cancelRequestSchema.safeParse({ revision: 0 }).success).toBe(false);
    expect(requestPageSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(requestPageSchema.safeParse({ pageSize: 51 }).success).toBe(false);
  });
  it("has explicit lifecycle transitions and no final-state resurrection", () => {
    expect(canTransitionRequest("SUBMITTED", "ENRICHING")).toBe(true);
    expect(canTransitionRequest("NEEDS_INFO", "SUBMITTED")).toBe(true);
    expect(canTransitionRequest("SUBMITTED", "APPROVED")).toBe(false);
    for (const terminal of [
      "APPROVED",
      "LINKED_EXISTING",
      "REJECTED",
      "CANCELLED",
    ] as const)
      expect(canTransitionRequest(terminal, "SUBMITTED")).toBe(false);
    expect(
      requestModerationSchema.safeParse({
        revision: 1,
        state: "APPROVED",
        reason: "invented",
      }).success,
    ).toBe(false);
    expect(
      requestModerationSchema.safeParse({
        revision: 1,
        state: "REJECTED",
        reason: " ",
      }).success,
    ).toBe(false);
  });
  it("keeps all initial providers disabled, with unresolved intended use and no auto-publication", () => {
    expect(PRODUCTION_PROVIDER_POLICIES).toHaveLength(4);
    for (const policy of PRODUCTION_PROVIDER_POLICIES) {
      expect(ProviderPolicySchema.parse(policy).enabled).toBe(false);
      expect(policy.metadataStorageAllowed).toBe(false);
      expect(policy.autoPublish).toBe(false);
      expect(policy.humanReviewRequired).toBe(true);
      expect(
        ProviderPolicySchema.safeParse({ ...policy, enabled: true }).success,
      ).toBe(false);
    }
  });
  it("preserves contradictory sourced facts without granting publication or cover permissions", () => {
    const provenance = {
      providerId: "OPEN_LIBRARY",
      sourceRecordId: "OL1W",
      retrievedAt: "2026-10-09T10:00:00Z",
    };
    const value = {
      providerId: "OPEN_LIBRARY",
      sourceRecordId: "OL1W",
      provenance: [provenance],
      title: {
        value: "One",
        provenance: [provenance],
        conflictingEvidence: [{ value: "Two", provenance }],
      },
      covers: {
        value: [
          {
            sourceUrl: "https://example.org/image",
            rights: "UNKNOWN",
            transferImages: false,
          },
        ],
        provenance: [provenance],
      },
      autoPublish: false,
      humanReviewRequired: true,
    };
    expect(
      ProviderCandidateSchema.parse(value).title?.conflictingEvidence?.[0]
        ?.value,
    ).toBe("Two");
    expect(
      ProviderCandidateSchema.safeParse({ ...value, autoPublish: true })
        .success,
    ).toBe(false);
    expect(
      ProviderCandidateSchema.safeParse({
        ...value,
        covers: {
          ...value.covers,
          value: [{ rights: "LICENSED", transferImages: false }],
        },
      }).success,
    ).toBe(false);
  });
});
