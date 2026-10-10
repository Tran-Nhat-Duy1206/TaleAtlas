import { describe, it, expect } from "vitest";
import {
  editSuggestionPatchSchema,
  submitEditSuggestionSchema,
  reviewEditSuggestionSchema,
  canonicalSuggestionInput,
  applyReviewedSuggestion,
} from "../../apps/web/src/features/catalog/edit-suggestions";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
const uuid = "12345678-1234-4234-8234-123456789abc";
const citation = {
  label: "Manual source",
  citation: "Human inspected edition",
};
describe("bounded human edit contracts", () => {
  it("accepts safe scalar corrections but rejects empty, null, provider and rich metadata", () => {
    expect(editSuggestionPatchSchema.parse({ publicationYear: 1 })).toEqual({
      publicationYear: 1,
    });
    for (const patch of [
      {},
      { publicationYear: 0 },
      { publicationYear: undefined },
      { primaryTitle: null },
      { primaryTitle: "!!!" },
      { cover: {} },
      { descriptions: [] },
      { providerId: "claim" },
      { visibility: "PUBLISHED" },
    ])
      expect(editSuggestionPatchSchema.safeParse(patch).success).toBe(false);
  });
  it("requires UUID, current revision and strict V1 human citation", () => {
    const input = {
      submitKey: uuid,
      baseWorkRevision: 1,
      patch: { releaseStatus: "UNKNOWN" },
      citation,
    };
    expect(submitEditSuggestionSchema.safeParse(input).success).toBe(true);
    for (const extra of [
      { baseWorkRevision: 0 },
      { submitKey: "bad" },
      { citation: { ...citation, provider: "automatic" } },
      { citation: { ...citation, url: "http://localhost/a" } },
      { ownerUserId: "spoof" },
    ])
      expect(
        submitEditSuggestionSchema.safeParse({ ...input, ...extra }).success,
      ).toBe(false);
  });
  it("canonicalizes key order and undefined without changing semantic hashes", () => {
    const a = submitEditSuggestionSchema.parse({
      submitKey: uuid,
      baseWorkRevision: 1,
      patch: { primaryTitle: " A ", publicationYear: 2 },
      citation,
    });
    const b = submitEditSuggestionSchema.parse({
      citation: { citation: citation.citation, label: citation.label },
      patch: {
        publicationYear: 2,
        originalLanguage: undefined,
        primaryTitle: "A",
      },
      baseWorkRevision: 1,
      submitKey: uuid,
    });
    expect(canonicalSuggestionInput(uuid, a)).toBe(
      canonicalSuggestionInput(uuid, b),
    );
    expect(canonicalSuggestionInput(uuid, a)).not.toBe(
      canonicalSuggestionInput(uuid, { ...b, baseWorkRevision: 2 }),
    );
  });
  it("requires explicit dual human attestation for approval and bounded review reasons", () => {
    const base = {
      revision: 1,
      baseWorkRevision: 1,
      reason: "Verified manually",
      decision: "APPROVE",
    };
    expect(reviewEditSuggestionSchema.safeParse(base).success).toBe(false);
    expect(
      reviewEditSuggestionSchema.safeParse({
        ...base,
        metadataReviewAcknowledged: true,
        publicationReviewAcknowledged: true,
      }).success,
    ).toBe(true);
    expect(
      reviewEditSuggestionSchema.safeParse({ ...base, decision: "REJECT" })
        .success,
    ).toBe(true);
    expect(
      reviewEditSuggestionSchema.safeParse({
        ...base,
        decision: "REJECT",
        reason: " ",
      }).success,
    ).toBe(false);
  });
  it("preserves the privileged current aggregate rather than accepting client replacement", () => {
    const current: AdminWork = {
      id: uuid,
      slug: "work",
      primaryTitle: "Old",
      primaryTitleLanguage: "en",
      displayTitle: "Old",
      displayTitleLanguage: "en",
      visibility: "PUBLISHED",
      revision: 1,
      format: "NOVEL",
      releaseStatus: "UNKNOWN",
      originalLanguage: null,
      country: null,
      publicationYear: null,
      publicationLabel: null,
      source: citation,
      titles: [
        { title: "Old", language: "en", kind: "PRIMARY" },
        { title: "Alias", language: "en", kind: "ALIAS" },
      ],
      descriptions: [{ language: "en", text: "Keep" }],
      editions: [{ id: uuid, title: "Edition" }],
      creators: [
        {
          id: uuid,
          name: "Person",
          role: "AUTHOR",
          displayOrder: 0,
          editionId: uuid,
        },
      ],
      genres: [],
      identifiers: [],
      relations: [],
      cover: null,
    };
    const next = applyReviewedSuggestion(
      current,
      {
        primaryTitle: "New",
        publicationYear: 2020,
        originalLanguage: undefined,
      },
      citation,
    );
    expect(next.primaryTitle).toBe("New");
    expect(next.titles).toEqual([
      { title: "Alias", language: "en", kind: "ALIAS" },
    ]);
    expect(next.creators).toEqual(current.creators);
    expect(next.editions).toEqual(current.editions);
    expect(next.descriptions).toEqual(current.descriptions);
    expect(next.publicationReviewAcknowledged).toBe(true);
  });
});
