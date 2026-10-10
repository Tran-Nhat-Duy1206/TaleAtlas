import { describe, expect, it } from "vitest";
import {
  normalizeIngestionCandidate,
  NormalizedCandidateSchema,
  IdentityMatchSchema,
  PROVIDER_IDENTITY_NAMESPACES,
  normalizeIdentityIdentifier,
  identityMatch,
  type IdentityWork,
} from "../../apps/web/src/features/ingestion/pipeline";
import type { ProviderCandidate } from "../../apps/web/src/features/ingestion/providers";

const requestId = "11111111-1111-4111-8111-111111111111";
const workId = "22222222-2222-4222-8222-222222222222";
const secondId = "33333333-3333-4333-8333-333333333333";
const provenance = {
  providerId: "OPEN_LIBRARY" as const,
  sourceRecordId: "OL123W",
  retrievedAt: "2026-01-02T03:04:05+07:00",
  sourceUpdatedAt: "2025-12-01T00:00:00Z",
};
const evidence = <T>(value: T) => ({ value, provenance: [provenance] });
function provider(): ProviderCandidate {
  return {
    providerId: "OPEN_LIBRARY",
    sourceRecordId: "OL123W",
    provenance: [provenance],
    title: evidence("Đất và trời"),
    format: evidence("NOVEL"),
    alternativeTitles: evidence([
      { title: "Earth and Sky", language: "en" },
      { title: "大地と空", language: "ja" },
    ]),
    creators: evidence([{ name: "Nguyễn An", role: "AUTHOR" }]),
    identifiers: evidence([{ namespace: "openlibrary", value: "OL123W" }]),
    editions: evidence([
      {
        title: "Earth and Sky",
        language: "en",
        identifiers: [{ namespace: "isbn", value: "9780306406157" }],
      },
    ]),
    covers: evidence([
      {
        sourceUrl: "https://example.org/cover.jpg",
        rights: "UNKNOWN",
        transferImages: false,
      },
    ]),
    autoPublish: false,
    humanReviewRequired: true,
  };
}
function work(overrides: Partial<IdentityWork> = {}): IdentityWork {
  return {
    id: workId,
    format: "NOVEL",
    titles: [{ title: "Dat va troi" }],
    creators: [{ name: "Nguyễn An", role: "AUTHOR" }],
    identifiers: [],
    providerSourceIds: [],
    ...overrides,
  };
}
function request() {
  return normalizeIngestionCandidate({
    origin: "REQUEST_INPUT",
    requestId,
    inputRevision: 2,
    details: {
      title: "Đất và trời",
      originalTitle: "大地と空",
      format: "UNKNOWN",
      alternativeTitles: ["Earth and Sky"],
      publicationLanguage: "en",
      notes: "PRIVATE NOTE",
      additionalEvidence: "PRIVATE EVIDENCE",
      sourceUrl: "https://example.org/citation",
    },
  });
}

describe("V2C pure ingestion normalization and identity explanations", () => {
  it("uses only the principal provider record as work identity while retaining unrelated citations", () => {
    const p = provider();
    const authorEvidence = { ...provenance, sourceRecordId: "OL999A" };
    const editionEvidence = { ...provenance, sourceRecordId: "OL888M" };
    p.provenance.push(authorEvidence, editionEvidence);
    p.creators!.provenance = [authorEvidence];
    p.editions!.provenance = [editionEvidence];
    const c = normalizeIngestionCandidate({ origin: "PROVIDER", candidate: p });
    expect(c.providerRecord).toEqual({
      providerId: "OPEN_LIBRARY",
      sourceRecordId: "OL123W",
    });
    expect(c.provenance).toHaveLength(3);
    expect(
      identityMatch(c, [
        work({
          titles: [],
          providerSourceIds: [
            { providerId: "OPEN_LIBRARY", sourceRecordId: "OL999A" },
            { providerId: "OPEN_LIBRARY", sourceRecordId: "OL888M" },
          ],
        }),
      ]),
    ).toEqual([]);
    expect(
      NormalizedCandidateSchema.safeParse({ ...c, providerRecord: undefined })
        .success,
    ).toBe(false);
    expect(
      NormalizedCandidateSchema.safeParse({
        ...c,
        providerRecord: {
          providerId: "OPEN_LIBRARY",
          sourceRecordId: "OL777W",
        },
      }).success,
    ).toBe(false);
    expect(
      NormalizedCandidateSchema.safeParse({
        ...request(),
        providerRecord: c.providerRecord,
      }).success,
    ).toBe(false);
  });
  it("derives checksum-valid ISBN keys without mutating edition facts or custom identifiers", () => {
    expect(
      normalizeIdentityIdentifier({
        namespace: "ISBN",
        value: "978-0-306-40615-7",
      }),
    ).toEqual({ namespace: "isbn13", value: "9780306406157" });
    expect(
      normalizeIdentityIdentifier({
        namespace: "ISBN_10",
        value: "0 306 40615 2",
      }),
    ).toEqual({ namespace: "isbn10", value: "0306406152" });
    expect(
      normalizeIdentityIdentifier({ namespace: "isbn10", value: "080442957x" }),
    ).toEqual({ namespace: "isbn10", value: "080442957X" });
    expect(
      normalizeIdentityIdentifier({
        namespace: "isbn",
        value: "9780306406158",
      }),
    ).toBeNull();
    expect(
      normalizeIdentityIdentifier({ namespace: "Custom", value: " Ab-C " }),
    ).toEqual({ namespace: "Custom", value: " Ab-C " });
    for (const [formatted, namespace, stored] of [
      ["978-0-306-40615-7", "isbn13", "9780306406157"],
      ["0 306 40615 2", "isbn10", "0306406152"],
    ]) {
      const p = provider();
      p.editions!.value[0].identifiers = [
        { namespace: "ISBN", value: formatted },
      ];
      const c = normalizeIngestionCandidate({
        origin: "PROVIDER",
        candidate: p,
      });
      const result = identityMatch(c, [
        work({ titles: [], identifiers: [{ namespace, value: stored }] }),
      ])[0];
      expect(result.reasons[0].kind).toBe("EXACT_IDENTIFIER");
      expect(result.conflicts).toContain(
        "ISBN identifies an edition, not a unique work",
      );
      expect(c.editions?.value[0].identifiers?.[0].value).toBe(formatted);
    }
    const p = provider();
    p.editions!.value[0].identifiers = [
      { namespace: "isbn", value: "9780306406158" },
    ];
    expect(
      identityMatch(
        normalizeIngestionCandidate({ origin: "PROVIDER", candidate: p }),
        [
          work({
            titles: [],
            identifiers: [{ namespace: "isbn", value: "9780306406158" }],
          }),
        ],
      ),
    ).toEqual([]);
  });
  it("maps only catalog-established provider identity namespaces", () => {
    expect(PROVIDER_IDENTITY_NAMESPACES).toEqual({
      OPEN_LIBRARY: "openlibrary",
      MANGADEX: "mangadex",
    });
    expect(PROVIDER_IDENTITY_NAMESPACES.GOOGLE_BOOKS).toBeUndefined();
    expect(PROVIDER_IDENTITY_NAMESPACES.OFFICIAL_FEED).toBeUndefined();
    expect(Object.isFrozen(PROVIDER_IDENTITY_NAMESPACES)).toBe(true);
  });
  it("binds envelope and fact evidence to origin and request revision", () => {
    const c = request();
    const p = normalizeIngestionCandidate({
      origin: "PROVIDER",
      candidate: provider(),
    });
    expect(
      NormalizedCandidateSchema.safeParse({ ...c, provenance: p.provenance })
        .success,
    ).toBe(false);
    expect(
      NormalizedCandidateSchema.safeParse({ ...c, title: p.title }).success,
    ).toBe(false);
    expect(
      NormalizedCandidateSchema.safeParse({ ...p, title: c.title }).success,
    ).toBe(false);
    expect(
      NormalizedCandidateSchema.safeParse({
        ...c,
        title: {
          ...c.title,
          provenance: [
            {
              sourceKind: "REQUEST_INPUT",
              requestId,
              inputRevision: 3,
              verified: false,
            },
          ],
        },
      }).success,
    ).toBe(false);
  });
  it("strictly parses identity explanations for private-store integration", () => {
    const result = identityMatch(request(), [work()])[0];
    expect(
      IdentityMatchSchema.parse(JSON.parse(JSON.stringify(result))),
    ).toEqual(result);
    expect(
      IdentityMatchSchema.safeParse({ ...result, workId: "invalid" }).success,
    ).toBe(false);
    expect(
      IdentityMatchSchema.safeParse({ ...result, autoPublish: true }).success,
    ).toBe(false);
    expect(
      IdentityMatchSchema.safeParse({ ...result, decision: "LINK" }).success,
    ).toBe(false);
    expect(
      IdentityMatchSchema.safeParse({ ...result, reasons: [] }).success,
    ).toBe(false);
  });
  it("preserves VN/EN/JA text without inferring original language or authors", () => {
    const c = request();
    expect(c.title?.value).toBe("Đất và trời");
    expect(c.originalTitle?.value).toBe("大地と空");
    expect(c.alternativeTitles?.value).toEqual([{ title: "Earth and Sky" }]);
    expect(c.lookupTitles).toEqual([
      "dat va troi",
      "大地と空",
      "earth and sky",
    ]);
    expect(c.format?.value).toBe("UNKNOWN");
    expect(c.originalLanguage).toBeUndefined();
    expect(c.creators).toBeUndefined();
    expect(c.publicationYear).toBeUndefined();
  });
  it("uses unverified request provenance and excludes private fields", () => {
    const c = request();
    expect(c.provenance).toEqual([
      {
        sourceKind: "REQUEST_INPUT",
        requestId,
        inputRevision: 2,
        verified: false,
      },
    ]);
    expect(c.title?.provenance).toEqual(c.provenance);
    expect(c.requestCitation).toBe("https://example.org/citation");
    expect(JSON.stringify(c)).not.toContain("PRIVATE");
    expect(c.autoPublish).toBe(false);
    expect(c.humanReviewRequired).toBe(true);
  });
  it("keeps fact conflicts, source record IDs, exact timestamps and edition metadata", () => {
    const p = provider();
    p.title!.conflictingEvidence = [
      {
        value: "Different source title",
        provenance: { ...provenance, sourceRecordId: "OL456W" },
      },
    ];
    const before = JSON.stringify(p);
    const c = normalizeIngestionCandidate({ origin: "PROVIDER", candidate: p });
    expect(c.title?.conflictingEvidence?.[0].value).toBe(
      "Different source title",
    );
    expect(c.title?.conflictingEvidence?.[0].provenance).toEqual({
      ...provenance,
      sourceRecordId: "OL456W",
      sourceKind: "PROVIDER",
    });
    expect(c.provenance[0]).toEqual({ ...provenance, sourceKind: "PROVIDER" });
    expect(c.editions?.value).toEqual(p.editions?.value);
    expect(c.alternativeTitles?.value).toEqual(p.alternativeTitles?.value);
    expect(JSON.stringify(p)).toBe(before);
    expect(
      NormalizedCandidateSchema.parse(JSON.parse(JSON.stringify(c))),
    ).toEqual(c);
  });
  it("retains covers as inert metadata and requires evidence for known rights", () => {
    const p = provider();
    expect(
      normalizeIngestionCandidate({ origin: "PROVIDER", candidate: p }).covers
        ?.value[0],
    ).toEqual(p.covers?.value[0]);
    p.covers!.value[0].rights = "LICENSED";
    expect(() =>
      normalizeIngestionCandidate({ origin: "PROVIDER", candidate: p }),
    ).toThrow();
    p.covers!.value[0].rightsEvidenceUrl = "https://example.org/license";
    expect(
      normalizeIngestionCandidate({ origin: "PROVIDER", candidate: p }).covers
        ?.value[0].rights,
    ).toBe("LICENSED");
    expect(
      NormalizedCandidateSchema.safeParse({ ...request(), autoPublish: true })
        .success,
    ).toBe(false);
  });
  it("treats title-only matches as weak and exposes format/author conflicts", () => {
    const c = normalizeIngestionCandidate({
      origin: "PROVIDER",
      candidate: provider(),
    });
    const result = identityMatch(c, [
      work({
        format: "MANGA",
        creators: [{ name: "Other Author", role: "AUTHOR" }],
      }),
    ])[0];
    expect(result.reasons).toEqual([
      { kind: "NORMALIZED_ALIAS", value: "dat va troi", strength: "WEAK" },
    ]);
    expect(result.conflicts).toEqual(["Format mismatch", "Author mismatch"]);
    expect(result.ambiguous).toBe(true);
    expect(result).not.toHaveProperty("decision");
    expect(result).not.toHaveProperty("merge");
    expect(result.autoPublish).toBe(false);
  });
  it("explains exact identifiers/provider records and ambiguity without changing UUIDs", () => {
    const c = normalizeIngestionCandidate({
      origin: "PROVIDER",
      candidate: provider(),
    });
    const a = work({
      identifiers: [{ namespace: "openlibrary", value: "OL123W" }],
      providerSourceIds: [
        { providerId: "OPEN_LIBRARY", sourceRecordId: "OL123W" },
      ],
    });
    const b = work({ ...a, id: secondId });
    const before = JSON.stringify([a, b]);
    const result = identityMatch(c, [a, b]);
    expect(result.map((x) => x.workId)).toEqual([workId, secondId]);
    expect(result.every((x) => x.ambiguous && x.humanReviewRequired)).toBe(
      true,
    );
    expect(result[0].reasons.map((x) => x.kind)).toContain(
      "EXACT_PROVIDER_RECORD",
    );
    expect(result[0].conflicts).toContain(
      "Exact evidence matches multiple Work UUIDs",
    );
    expect(JSON.stringify([a, b])).toBe(before);
  });
  it("notes ISBN edition ambiguity and performs no fuzzy merges", () => {
    const c = normalizeIngestionCandidate({
      origin: "PROVIDER",
      candidate: provider(),
    });
    const result = identityMatch(c, [
      work({
        titles: [{ title: "Different" }],
        identifiers: [{ namespace: "isbn", value: "9780306406157" }],
      }),
    ])[0];
    expect(result.conflicts).toContain(
      "ISBN identifies an edition, not a unique work",
    );
    expect(result.ambiguous).toBe(true);
    expect(
      identityMatch(c, [work({ titles: [{ title: "Dat va tro" }] })]),
    ).toEqual([]);
  });
  it("rejects invalid inputs, extra fields, invalid Work IDs and oversized snapshots", () => {
    expect(() =>
      normalizeIngestionCandidate({
        origin: "REQUEST_INPUT",
        requestId,
        inputRevision: 0,
        details: { title: "X", format: "UNKNOWN", alternativeTitles: [] },
      }),
    ).toThrow();
    expect(
      NormalizedCandidateSchema.safeParse({ ...request(), notes: "private" })
        .success,
    ).toBe(false);
    expect(() =>
      identityMatch(request(), [work({ id: "not-a-uuid" })]),
    ).toThrow();
    const p = provider();
    p.alternativeTitles = evidence(
      Array.from({ length: 50 }, (_, i) => ({
        title: `${i}${"界".repeat(499)}`,
      })),
    );
    expect(() =>
      normalizeIngestionCandidate({ origin: "PROVIDER", candidate: p }),
    ).toThrow();
    const missingTitle = provider();
    delete missingTitle.title;
    expect(
      normalizeIngestionCandidate({
        origin: "PROVIDER",
        candidate: missingTitle,
      }).title,
    ).toBeUndefined();
  });
});
