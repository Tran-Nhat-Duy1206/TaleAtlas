import { describe, it, expect } from "vitest";
import {
  normalizeTitle,
  workInputSchema,
  updateWorkSchema,
  visibilityInputSchema,
  catalogQuerySchema,
  informationalUrlSchema,
} from "../../apps/web/src/features/catalog/contracts";
const input = {
  primaryTitle: "Đường đến 日本",
  format: "MANGA",
  visibility: "DRAFT",
  releaseStatus: "UNKNOWN",
  source: { label: "Publisher", citation: "Publisher bibliography, record 12" },
};
describe("catalog contracts", () => {
  it("requires explicit strict boolean review for every published command", () => {
    for (const schema of [
      workInputSchema,
      updateWorkSchema,
      visibilityInputSchema,
    ]) {
      const base =
        schema === visibilityInputSchema
          ? { revision: 1 }
          : {
              ...input,
              ...(schema === updateWorkSchema ? { revision: 1 } : {}),
            };
      for (const acknowledgment of [
        undefined,
        false,
        "true",
        "false",
        1,
        null,
      ]) {
        expect(
          schema.safeParse({
            ...base,
            visibility: "PUBLISHED",
            ...(acknowledgment === undefined
              ? {}
              : { publicationReviewAcknowledged: acknowledgment }),
          }).success,
        ).toBe(false);
      }
      expect(
        schema.safeParse({
          ...base,
          visibility: "PUBLISHED",
          publicationReviewAcknowledged: true,
        }).success,
      ).toBe(true);
      for (const visibility of ["DRAFT", "HIDDEN"]) {
        for (const acknowledgment of [undefined, false, true])
          expect(
            schema.safeParse({
              ...base,
              visibility,
              ...(acknowledgment === undefined
                ? {}
                : { publicationReviewAcknowledged: acknowledgment }),
            }).success,
          ).toBe(true);
        expect(
          schema.safeParse({
            ...base,
            visibility,
            publicationReviewAcknowledged: "false",
          }).success,
        ).toBe(false);
      }
    }
  });
  it("normalizes multilingual titles without changing display", () => {
    expect(normalizeTitle("  ĐƯỜNG—đến: 日本! 한글 ")).toBe(
      "duong den 日本 한글",
    );
    expect(normalizeTitle("Cafe\u0301")).toBe("cafe");
    expect(workInputSchema.parse(input).primaryTitle).toBe(input.primaryTitle);
  });
  it("defaults unknown primary language and children", () => {
    expect(workInputSchema.parse(input)).toMatchObject({
      primaryTitleLanguage: "und",
      titles: [],
      editions: [],
    });
  });
  it("strictly rejects invented fields and missing provenance", () => {
    expect(workInputSchema.safeParse({ ...input, actorId: "x" }).success).toBe(
      false,
    );
    expect(
      workInputSchema.safeParse({
        ...input,
        source: { label: "p", citation: "" },
      }).success,
    ).toBe(false);
    expect(
      workInputSchema.safeParse({
        ...input,
        titles: [
          { title: "Alias", language: "en", kind: "ALIAS", source: "invented" },
        ],
      }).success,
    ).toBe(false);
  });
  it("bounds lists and validates edition references", () => {
    expect(
      workInputSchema.safeParse({
        ...input,
        titles: Array.from({ length: 31 }, () => ({
          title: "alias",
          language: "en",
          kind: "ALIAS",
        })),
      }).success,
    ).toBe(false);
    expect(
      workInputSchema.safeParse({
        ...input,
        creators: [
          { name: "Person", role: "AUTHOR", displayOrder: 0, editionIndex: 0 },
        ],
      }).success,
    ).toBe(false);
    expect(
      workInputSchema.safeParse({
        ...input,
        editions: [{ format: "paperback" }],
        creators: [
          { name: "Person", role: "AUTHOR", displayOrder: 0, editionIndex: 0 },
        ],
      }).success,
    ).toBe(true);
  });
  it("rejects ISBN work identity and malformed external identity", () => {
    for (const i of [
      { namespace: "ISBN", value: "9781234567890" },
      { namespace: "openlibrary", value: "OL123M" },
      { namespace: "wikidata", value: "abc" },
      { namespace: "mangadex", value: "123" },
    ])
      expect(
        workInputSchema.safeParse({ ...input, identifiers: [i] }).success,
      ).toBe(false);
  });
  it("accepts only safe informational HTTPS URLs", () => {
    for (const u of [
      "http://example.com",
      "https://a:b@example.com",
      "https://localhost",
      "https://127.0.0.1",
      "https://10.0.0.1",
      "https://[::1]",
      "https://local.local",
    ])
      expect(informationalUrlSchema.safeParse(u).success).toBe(false);
    expect(
      informationalUrlSchema.safeParse("https://publisher.example/catalog")
        .success,
    ).toBe(true);
  });
  it("requires citation for approved local covers and no directories", () => {
    expect(
      workInputSchema.safeParse({
        ...input,
        cover: { rights: "LICENSED", assetPath: "/covers/a.jpg" },
      }).success,
    ).toBe(false);
    for (const path of [
      "/covers/../a.png",
      "/covers/a.svg",
      "https://example.com/a.jpg",
    ])
      expect(
        workInputSchema.safeParse({
          ...input,
          cover: { rights: "UNKNOWN", assetPath: path },
        }).success,
      ).toBe(false);
    expect(
      workInputSchema.safeParse({
        ...input,
        cover: {
          rights: "LICENSED",
          assetPath: "/covers/dir/a.webp",
          credit: "Publisher",
          rightsStatement: "Licensed via publisher agreement",
        },
      }).success,
    ).toBe(true);
  });
  it("bounds queries and pagination", () => {
    expect(catalogQuerySchema.parse({})).toEqual({
      q: "",
      page: 1,
      pageSize: 20,
      locale: "en",
    });
    for (const q of [
      { q: "x".repeat(201) },
      { pageSize: 51 },
      { page: 502 },
      { locale: "fr" },
      { page: 0 },
    ])
      expect(catalogQuerySchema.safeParse(q).success).toBe(false);
  });
});
