import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import {
  catalogQuerySchema,
  parseCatalogSearchParams,
  recordedLanguageFilterSchema,
  workInputSchema,
  type PublicGenreOptions,
} from "../../apps/web/src/features/catalog/contracts";
import {
  catalogPageHref,
  publicCatalogQuery,
  publicCatalogQueryState,
} from "../../apps/web/src/components/catalog/query";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  adminList: vi.fn(),
  requireRole: vi.fn(),
  log: vi.fn(),
}));
vi.mock("../../apps/web/src/server/catalog/service", () => ({
  listWorks: mocks.list,
  adminListWorks: mocks.adminList,
  createWork: vi.fn(),
}));
vi.mock("../../apps/web/src/server/env", () => ({
  getAuthEnv: () => ({ APP_ORIGIN: "http://localhost" }),
}));
vi.mock("../../apps/web/src/server/database", () => ({
  getDatabaseConnection: vi.fn(),
}));
vi.mock("../../apps/web/src/server/logger", () => ({
  logServerError: mocks.log,
}));
vi.mock("../../apps/web/src/server/session", () => ({
  requireRole: mocks.requireRole,
  AuthorizationError: class extends Error {},
  AuthenticationUnavailableError: class extends Error {},
}));
import { GET as publicGET } from "../../apps/web/src/app/api/catalog/works/route";
import { GET as adminGET } from "../../apps/web/src/app/api/admin/catalog/works/route";

const knownFields = [
  "q",
  "page",
  "pageSize",
  "format",
  "genre",
  "originalLanguage",
  "releaseStatus",
] as const;
const defaults = { q: "", page: 1, pageSize: 20, locale: "en" };
const language63 = `aa${"-abcdefgh".repeat(6)}-abcdef`;
const parse = (values: Record<string, string>) =>
  parseCatalogSearchParams(new URLSearchParams(values));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({ items: [], total: 0 });
  mocks.adminList.mockResolvedValue({ items: [], total: 0 });
  mocks.requireRole.mockResolvedValue({ user: { id: "admin" } });
});

describe("catalog discovery read contract", () => {
  it("retains old defaults and exposes the shared genre result shape", () => {
    expect(catalogQuerySchema.parse({})).toEqual(defaults);
    expect(parseCatalogSearchParams(new URLSearchParams())).toEqual(defaults);
    expectTypeOf<PublicGenreOptions>().toEqualTypeOf<{
      items: Array<{ slug: string; nameEn: string; nameVi: string }>;
      overflow: boolean;
    }>();
  });

  it("preserves q punctuation, accents and case, trimming only edges", () => {
    const q = "Đường—đến: 日本! O'Neil & C++ / 100%? #1 = Café";
    expect(parse({ q: `  ${q}  ` }).q).toBe(q);
    expect(publicCatalogQuery({ q }, "vi").q).toBe(q);
    expect(parse({ q: "x".repeat(200) }).q).toHaveLength(200);
    expect(() => parse({ q: "x".repeat(201) })).toThrow(z.ZodError);
  });

  it("keeps coerced numeric boundaries and the exact offset cap", () => {
    expect(parse({ pageSize: "50" }).pageSize).toBe(50);
    expect(parse({ page: "10001", pageSize: "1" }).page).toBe(10001);
    expect(parse({ page: "201", pageSize: "50" }).page).toBe(201);
    const invalidQueries: Record<string, string>[] = [
      { pageSize: "51" },
      { page: "10002", pageSize: "1" },
      { page: "202", pageSize: "50" },
      { page: "0" },
      { page: "1.5" },
      { pageSize: "0" },
      { page: "NaN" },
    ];
    for (const values of invalidQueries)
      expect(() => parse(values)).toThrow(z.ZodError);
  });

  it("accepts recorded tags exactly, including DB-only forms and 63 chars", () => {
    expect(language63).toHaveLength(63);
    for (const originalLanguage of [
      "en",
      "EN",
      "und",
      "zh-Hant",
      "abcdefgh-A-12345678",
      language63,
    ]) {
      expect(recordedLanguageFilterSchema.parse(originalLanguage)).toBe(
        originalLanguage,
      );
      expect(parse({ originalLanguage }).originalLanguage).toBe(
        originalLanguage,
      );
    }
    for (const originalLanguage of [
      `${language63}g`,
      "e",
      "abcdefghi",
      "en-",
      "en_Us",
      "en-123456789",
      " en",
      "en ",
      "en\n",
      "en\r",
      "en\u2028",
      "日本",
    ])
      expect(
        recordedLanguageFilterSchema.safeParse(originalLanguage).success,
      ).toBe(false);
    expect(`${language63}g`).toHaveLength(64);
  });

  it("does not relax the separate write-language validator", () => {
    const input = {
      primaryTitle: "Synthetic",
      format: "NOVEL",
      visibility: "DRAFT",
      releaseStatus: "UNKNOWN",
      source: { label: "Synthetic", citation: "Invented fixture" },
    };
    expect(workInputSchema.parse(input).primaryTitleLanguage).toBe("und");
    expect(
      workInputSchema.safeParse({ ...input, originalLanguage: "en" }).success,
    ).toBe(true);
    for (const originalLanguage of ["EN", "en-A", language63])
      expect(
        workInputSchema.safeParse({ ...input, originalLanguage }).success,
      ).toBe(false);
  });

  it("accepts only exact release-status enums without inferring a language", () => {
    for (const releaseStatus of [
      "UNKNOWN",
      "ANNOUNCED",
      "ONGOING",
      "COMPLETED",
      "HIATUS",
      "CANCELLED",
    ])
      expect(parse({ releaseStatus })).toEqual({ ...defaults, releaseStatus });
    for (const releaseStatus of ["ongoing", "COMPLETED ", "FINISHED", ""])
      expect(() => parse({ releaseStatus })).toThrow(z.ZodError);
    expect(parse({ format: "MANGA", locale: "vi" })).not.toHaveProperty(
      "originalLanguage",
    );
  });

  it.each([...knownFields, "locale"])(
    "rejects duplicate API scalar %s before coercion, even identical or blank",
    (key) => {
      for (const values of [
        ["1", "2"],
        ["1", "1"],
        ["", ""],
      ]) {
        const params = new URLSearchParams();
        for (const value of values) params.append(key, value);
        expect(() => parseCatalogSearchParams(params)).toThrow(z.ZodError);
        expect(() => parseCatalogSearchParams(params)).toThrow(
          "Duplicate query parameter",
        );
      }
    },
  );
});

describe("catalog page query state and history URLs", () => {
  it("retains old default/fallback behavior and delegates through state", () => {
    expect(publicCatalogQueryState({}, "en")).toEqual({
      query: defaults,
      invalid: false,
    });
    expect(publicCatalogQueryState({ page: "0", q: "valid" }, "vi")).toEqual({
      query: { ...defaults, locale: "vi" },
      invalid: true,
    });
    expect(publicCatalogQuery({ page: "0", q: "valid" }, "vi")).toEqual({
      ...defaults,
      locale: "vi",
    });
  });

  it.each(knownFields)(
    "rejects every known array %s without partial filters",
    (key) => {
      for (const value of [[], [""], ["1"], ["1", "2"]])
        expect(
          publicCatalogQueryState({ q: "valid", [key]: value }, "en"),
        ).toEqual({
          query: defaults,
          invalid: true,
        });
    },
  );

  it("omits known blank strings and ignores unknown page keys, including arrays", () => {
    const params = Object.fromEntries(knownFields.map((key) => [key, " \t "]));
    expect(
      publicCatalogQueryState(
        { ...params, invented: ["1", "2"], locale: ["fr", "vi"] },
        "en",
      ),
    ).toEqual({ query: defaults, invalid: false });
    expect(() => parse({ invented: "1" })).toThrow(z.ZodError);
    expect(() => parse({ page: " " })).toThrow(z.ZodError);
    expect(() => parse({ originalLanguage: " " })).toThrow(z.ZodError);
  });

  it.each([
    { q: "x".repeat(201) },
    { pageSize: "51" },
    { page: "10002", pageSize: "1" },
    { originalLanguage: `${language63}g` },
    { releaseStatus: "ongoing" },
    { format: "manga" },
    { genre: "science fiction" },
  ])("falls back as a whole on invalid known filters: %j", (params) => {
    expect(publicCatalogQueryState({ q: "keep?", ...params }, "en")).toEqual({
      query: defaults,
      invalid: true,
    });
  });

  it("serializes all filters through encoded pagination and history round trips", () => {
    const params = {
      q: "Đường + Café & 日本? / #100% = 'yes'",
      format: "MANGA",
      genre: "science-fiction",
      originalLanguage: "ZH-Hant",
      releaseStatus: "ONGOING",
      pageSize: "50",
      page: "2",
    };
    const { query, invalid } = publicCatalogQueryState(params, "vi");
    expect(invalid).toBe(false);
    const href = catalogPageHref("vi", query, 3);
    expect(href).toMatch(/^\/vi\/works\?/);
    expect(href).toContain("%2B");
    expect(href).toContain("%26");
    expect(href).toContain("%23");
    expect(href).not.toContain("日本");
    const url = new URL(href, "http://localhost");
    const serialized = Object.fromEntries(url.searchParams);
    expect(serialized).toEqual({ ...params, page: "3" });
    // API locale defaults independently; page locale comes from the route.
    expect(parseCatalogSearchParams(url.searchParams)).toEqual({
      ...query,
      locale: "en",
      page: 3,
    });
    expect(publicCatalogQueryState(serialized, "vi")).toEqual({
      query: { ...query, page: 3 },
      invalid: false,
    });
    expect(catalogPageHref("vi", publicCatalogQuery(serialized, "vi"), 2)).toBe(
      catalogPageHref("vi", query, 2),
    );
    expect(catalogPageHref("en", catalogQuerySchema.parse({}), 2)).toBe(
      "/en/works?pageSize=20&page=2",
    );
  });
});

describe("catalog list API validation", () => {
  it("passes exact advanced filters to public and guarded admin reads", async () => {
    const request = new Request(
      "http://localhost/api/catalog/works?originalLanguage=EN-x&releaseStatus=HIATUS&page=2&pageSize=50",
    );
    const query = {
      ...defaults,
      originalLanguage: "EN-x",
      releaseStatus: "HIATUS",
      page: 2,
      pageSize: 50,
    };
    expect((await publicGET(request)).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(query);
    expect((await adminGET(request)).status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith(["admin"], request.headers);
    expect(mocks.adminList).toHaveBeenCalledWith(query, request.headers);
    expect(mocks.requireRole.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.adminList.mock.invocationCallOrder[0],
    );
  });

  it.each([
    "page=1&page=2",
    "pageSize=20&pageSize=20",
    "q=private-value&q=other-private-value",
    "originalLanguage=en&originalLanguage=EN",
    "releaseStatus=ONGOING&releaseStatus=HIATUS",
    "invented=private-value",
    "q=" + "x".repeat(201),
    "pageSize=51",
  ])(
    "returns safe 400 errors without service calls or raw-value logs: %s",
    async (search) => {
      for (const get of [publicGET, adminGET]) {
        const response = await get(
          new Request(`http://localhost/api/catalog/works?${search}`),
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "VALIDATION_ERROR" });
      }
      expect(mocks.list).not.toHaveBeenCalled();
      expect(mocks.adminList).not.toHaveBeenCalled();
      expect(mocks.log).not.toHaveBeenCalled();
    },
  );

  it("keeps admin authorization before query parsing", async () => {
    mocks.requireRole.mockRejectedValueOnce(new Error("synthetic denied"));
    const response = await adminGET(
      new Request("http://localhost/api/admin/catalog/works?page=1&page=2"),
    );
    expect(response.status).toBe(503);
    expect(mocks.requireRole).toHaveBeenCalledOnce();
    expect(mocks.adminList).not.toHaveBeenCalled();
  });
});
