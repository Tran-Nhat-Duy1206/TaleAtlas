import { describe, expect, it, vi } from "vitest";
import {
  decodeOfflineOpenLibraryRecord,
  decodeOfflineMangaDexRecord,
  normalizeOfflineProviderRecord,
  createDisabledProviderDescriptors,
  OFFLINE_DISABLED_PROVIDER_DESCRIPTORS,
} from "../../apps/web/src/features/ingestion/provider-records";
import { PRODUCTION_PROVIDER_POLICIES } from "../../apps/web/src/features/ingestion/providers";

// Entirely invented offline records, not downloaded provider payloads.
const context = {
  retrievedAt: "2026-01-02T03:04:05+07:00",
  sourceUpdatedAt: "2025-12-01T00:00:00Z",
};
const ol = () => ({
  key: "/works/synthetic-book-1",
  title: "Đất giả tưởng",
  title_language: "vi",
  alternative_titles: [
    { title: "架空の大地", language: "ja" },
    { title: "Imaginary Land", language: "en" },
  ],
  creators: [{ name: "Synthetic Author", role: "AUTHOR" }],
  isbn_13: ["9780306406157"],
  editions: [
    {
      sourceRecordId: "synthetic-edition-1",
      language: "vi",
      identifiers: [{ namespace: "ISBN13", value: "9780306406157" }],
    },
  ],
});
describe("OFFLINE synthetic provider record preparation", () => {
  it("preserves explicit multilingual facts and exact caller timestamps", () => {
    const c = decodeOfflineOpenLibraryRecord(ol(), context);
    expect(c.sourceRecordId).toBe("synthetic-book-1");
    expect(c.title?.value).toBe("Đất giả tưởng");
    expect(c.identifiers?.value).toContainEqual({
      namespace: "ISBN13",
      value: "9780306406157",
    });
    expect(c.editions?.value[0].sourceRecordId).toBe("synthetic-edition-1");
    expect(c.provenance[0]).toEqual({
      providerId: "OPEN_LIBRARY",
      sourceRecordId: "synthetic-book-1",
      sourceUrl:
        "https://fixtures.example.invalid/open_library/synthetic-book-1",
      ...context,
    });
    expect(c.title?.provenance).toEqual(c.provenance);
    expect(normalizeOfflineProviderRecord(c).format?.value).toBe("UNKNOWN");
    expect(
      normalizeOfflineProviderRecord(c).alternativeTitles?.value,
    ).toContainEqual({ title: "架空の大地", language: "ja" });
  });
  it("keeps MangaDex localized map labels without inventing original facts or resolving references", () => {
    const c = decodeOfflineMangaDexRecord(
      {
        id: "synthetic-manga-1",
        type: "manga",
        attributes: {
          title: { ja: "架空の海", en: "Imaginary Sea", vi: "Biển giả tưởng" },
          altTitles: [{ vi: "Đại dương giả tưởng" }],
          originalLanguage: "ja",
          year: 1999,
        },
        relationships: [{ type: "author", id: "synthetic-author" }],
      },
      context,
    );
    const n = normalizeOfflineProviderRecord(c);
    expect(n.alternativeTitles?.value).toHaveLength(4);
    expect(n.lookupTitles).toContain("bien gia tuong");
    expect(n.creators).toBeUndefined();
    expect(n.originalTitle).toBeUndefined();
    expect(n.originalLanguage).toBeUndefined();
    expect(n.publicationYear).toBeUndefined();
    expect(n.format?.value).toBe("UNKNOWN");
  });
  it("permits sparse records and only explicit source format", () => {
    const c = decodeOfflineMangaDexRecord(
      { id: "synthetic-sparse", type: "manga", attributes: {} },
      context,
    );
    expect(c.title).toBeUndefined();
    expect(c.format).toBeUndefined();
    expect(
      decodeOfflineOpenLibraryRecord(
        { key: "/works/synthetic-format", format: "MANGA" },
        context,
      ).format?.value,
    ).toBe("MANGA");
  });
  it("preserves explicitly supplied conflicting evidence through shared normalization", () => {
    const c = decodeOfflineOpenLibraryRecord(
      {
        ...ol(),
        titleConflicts: [
          {
            value: "Other invented title",
            provenance: {
              providerId: "OPEN_LIBRARY",
              sourceRecordId: "synthetic-conflict",
              retrievedAt: context.retrievedAt,
              sourceUrl: "https://fixtures.example.invalid/conflict",
            },
          },
        ],
      },
      context,
    );
    expect(
      normalizeOfflineProviderRecord(c).title?.conflictingEvidence?.[0].value,
    ).toBe("Other invented title");
  });
  it("rejects invalid IDs, timestamps, ISBNs, fields and oversized JSON", () => {
    for (const key of [
      "/works/../secret",
      "/works/a?redirect=x",
      `/works/${"a".repeat(201)}`,
    ])
      expect(() => decodeOfflineOpenLibraryRecord({ key }, context)).toThrow();
    expect(() =>
      decodeOfflineOpenLibraryRecord(ol(), { retrievedAt: "not-a-time" }),
    ).toThrow();
    expect(() =>
      decodeOfflineOpenLibraryRecord(
        { ...ol(), isbn_13: ["9780306406158"] },
        context,
      ),
    ).toThrow();
    expect(() =>
      decodeOfflineOpenLibraryRecord(
        { ...ol(), creators: [{ id: "ref-only" }] },
        context,
      ),
    ).toThrow();
    expect(() =>
      decodeOfflineOpenLibraryRecord({ ...ol(), format: "UNKNOWN" }, context),
    ).toThrow();
    expect(() =>
      decodeOfflineOpenLibraryRecord(
        { ...ol(), ignored: "x".repeat(32768) },
        context,
      ),
    ).toThrow();
  });
  it("drops unsupported content and never fetches citations, cover images or user URLs", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("Network forbidden");
    });
    try {
      const c = decodeOfflineOpenLibraryRecord(
        {
          ...ol(),
          description: "excluded",
          sourceUrl: "https://user.example/private",
          covers: [123],
          releaseEvents: [],
          notes: "excluded",
          country: "JP",
        },
        context,
      );
      expect(c.covers).toBeUndefined();
      expect(c.releaseEvents).toBeUndefined();
      expect(JSON.stringify(c)).not.toContain("user.example");
      expect(JSON.stringify(c)).not.toContain("excluded");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(c.autoPublish).toBe(false);
      expect(c.humanReviewRequired).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  });
  it("constructs safe inert citations for explicitly supplied nonsynthetic IDs", () => {
    expect(
      decodeOfflineOpenLibraryRecord({ key: "/works/OL123W" }, context)
        .provenance[0].sourceUrl,
    ).toBe("https://openlibrary.org/works/OL123W");
  });
  it("has no runnable methods regardless of declared capabilities or storage flags", () => {
    expect(OFFLINE_DISABLED_PROVIDER_DESCRIPTORS).toHaveLength(4);
    for (const descriptor of createDisabledProviderDescriptors(
      PRODUCTION_PROVIDER_POLICIES.map((p) => ({
        ...p,
        metadataStorageAllowed: true,
      })),
    )) {
      expect(Object.keys(descriptor).sort()).toEqual([
        "capabilities",
        "providerId",
      ]);
      expect(descriptor.capabilities).toEqual([]);
      expect(descriptor.searchWorks).toBeUndefined();
      expect(descriptor.getWorkDetails).toBeUndefined();
    }
    expect(() =>
      createDisabledProviderDescriptors(
        PRODUCTION_PROVIDER_POLICIES.map((p) => ({ ...p, enabled: true })),
      ),
    ).toThrow();
  });
});
