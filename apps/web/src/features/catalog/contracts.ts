import { z } from "zod";
import {
  WORK_FORMATS,
  WORK_VISIBILITIES,
  RELEASE_STATUSES,
  CREATOR_ROLES,
  TITLE_KINDS,
  COVER_RIGHTS,
  RELATION_TYPES,
} from "@taleatlas/database/catalog-types";
export function normalizeTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[Đđ]/g, "d")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
const text = (max: number) => z.string().trim().min(1).max(max);
const language = z
  .string()
  .regex(/^(?:und|[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/)
  .max(35);
export const informationalUrlSchema = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      const u = new URL(value);
      const h = u.hostname.toLowerCase();
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !h.includes(":") &&
        !/^\[/.test(h) &&
        !/^\d+(\.\d+){3}$/.test(h) &&
        h !== "localhost" &&
        !h.endsWith(".localhost") &&
        !h.endsWith(".local") &&
        h.includes(".")
      );
    } catch {
      return false;
    }
  }, "Use a public HTTPS informational URL");
export const sourceSchema = z
  .object({
    label: text(200),
    citation: text(4000),
    url: informationalUrlSchema.optional(),
    consultedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
const year = z.number().int().min(1).max(9999);
const coverSchema = z
  .object({
    assetPath: z
      .string()
      .max(500)
      .regex(
        /^\/covers\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:png|jpg|jpeg|webp|avif)$/,
      )
      .optional(),
    rights: z.enum(COVER_RIGHTS),
    credit: text(500).optional(),
    rightsStatement: text(2000).optional(),
    licenseUrl: informationalUrlSchema.optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.rights !== "UNKNOWN" &&
      (!v.assetPath || !v.rightsStatement || !v.credit)
    )
      c.addIssue({
        code: "custom",
        message:
          "Approved covers require local asset, credit and rights citation",
      });
  });
export const workInputSchema = z
  .object({
    primaryTitle: text(500),
    primaryTitleLanguage: language.default("und"),
    format: z.enum(WORK_FORMATS),
    visibility: z.enum(WORK_VISIBILITIES),
    publicationReviewAcknowledged: z.boolean().optional(),
    releaseStatus: z.enum(RELEASE_STATUSES),
    originalLanguage: language.optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    publicationYear: year.optional(),
    publicationLabel: text(200).optional(),
    source: sourceSchema,
    titles: z
      .array(
        z
          .object({ title: text(500), language, kind: z.enum(TITLE_KINDS) })
          .strict(),
      )
      .max(30)
      .default([]),
    descriptions: z
      .array(z.object({ language, text: text(20000) }).strict())
      .max(30)
      .default([]),
    editions: z
      .array(
        z
          .object({
            id: z.string().uuid().optional(),
            title: text(500).optional(),
            language: language.optional(),
            publisher: text(300).optional(),
            format: text(100).optional(),
            publicationYear: year.optional(),
            publicationLabel: text(200).optional(),
            isbn: text(32)
              .transform((v) => v.replace(/[ -]/g, "").toUpperCase())
              .pipe(z.string().regex(/^(?:[0-9]{9}[0-9X]|[0-9]{13})$/))
              .optional(),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    creators: z
      .array(
        z
          .object({
            id: z.string().uuid().optional(),
            name: text(300),
            role: z.enum(CREATOR_ROLES),
            editionIndex: z.number().int().min(0).optional(),
            editionId: z.string().uuid().optional(),
            displayOrder: z.number().int().min(0).max(10000),
          })
          .strict(),
      )
      .max(30)
      .default([]),
    genres: z
      .array(
        z
          .object({
            slug: z
              .string()
              .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
              .max(100),
            nameEn: text(100),
            nameVi: text(100),
          })
          .strict(),
      )
      .max(10)
      .default([]),
    cover: coverSchema.optional(),
    identifiers: z
      .array(
        z
          .object({
            namespace: text(50).transform((v) => {
              const lower = v.toLowerCase();
              const compact = lower.replace(/[-_ ]/g, "");
              return ["openlibrary", "wikidata", "mangadex", "isbn"].includes(
                compact,
              )
                ? compact
                : lower;
            }),
            value: text(200),
          })
          .strict()
          .transform((i) => ({
            ...i,
            value:
              i.namespace === "openlibrary" || i.namespace === "wikidata"
                ? i.value.toUpperCase()
                : i.namespace === "mangadex"
                  ? i.value.toLowerCase()
                  : i.value,
          })),
      )
      .max(10)
      .default([]),
    relations: z
      .array(
        z
          .object({ toWorkId: z.string().uuid(), type: z.enum(RELATION_TYPES) })
          .strict(),
      )
      .max(10)
      .default([]),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.visibility === "PUBLISHED" &&
      v.publicationReviewAcknowledged !== true
    )
      c.addIssue({
        code: "custom",
        path: ["publicationReviewAcknowledged"],
        message: "Publication review acknowledgment is required",
      });
    if (
      !normalizeTitle(v.primaryTitle) ||
      v.titles.some((t) => !normalizeTitle(t.title))
    )
      c.addIssue({
        code: "custom",
        message: "Titles must contain letters or numbers",
      });
    const primaryLanguages = [
      v.primaryTitleLanguage,
      ...v.titles
        .filter(
          (t) =>
            t.kind === "PRIMARY" &&
            !(
              t.title === v.primaryTitle &&
              t.language === v.primaryTitleLanguage
            ),
        )
        .map((t) => t.language),
    ];
    if (
      new Set(primaryLanguages).size !== primaryLanguages.length ||
      v.titles.filter((t) => t.kind === "ORIGINAL").length > 1
    )
      c.addIssue({
        code: "custom",
        message: "Duplicate primary language or original title",
      });
    if (
      normalizeTitle(
        [
          v.primaryTitle,
          ...v.titles.map((t) => t.title),
          ...v.descriptions.map((d) => d.text),
          ...v.creators.map((c) => c.name),
          ...v.genres.flatMap((g) => [g.nameEn, g.nameVi]),
        ].join(" "),
      ).length > 100000
    )
      c.addIssue({ code: "custom", message: "Search document too large" });
    for (const creator of v.creators)
      if (
        (creator.editionIndex !== undefined &&
          (creator.editionIndex >= v.editions.length ||
            creator.editionId !== undefined)) ||
        (creator.editionId &&
          !v.editions.some((e) => e.id === creator.editionId))
      )
        c.addIssue({
          code: "custom",
          message: "Creator edition must reference an included edition",
        });
    for (const i of v.identifiers) {
      const ns = i.namespace.replace(/[-_ ]/g, "");
      if (
        ns === "isbn" ||
        (ns === "openlibrary" && !/^OL[1-9]\d*W$/i.test(i.value)) ||
        (ns === "wikidata" && !/^Q[1-9]\d*$/i.test(i.value)) ||
        (ns === "mangadex" && !z.string().uuid().safeParse(i.value).success)
      )
        c.addIssue({
          code: "custom",
          message: "Invalid work identifier (ISBN belongs to an edition)",
        });
    }
    for (const values of [
      v.descriptions.map((x) => x.language),
      v.genres.map((x) => x.slug),
      v.editions.flatMap((x) => (x.id ? [x.id] : [])),
      v.identifiers.map((x) => `${x.namespace}:${x.value}`),
      v.relations.map((x) => `${x.toWorkId}:${x.type}`),
    ])
      if (new Set(values).size !== values.length)
        c.addIssue({ code: "custom", message: "Duplicate child entry" });
  });
export type WorkInput = z.infer<typeof workInputSchema>;
export const updateWorkSchema = workInputSchema.safeExtend({
  revision: z.number().int().positive(),
});
export const visibilityInputSchema = z
  .object({
    revision: z.number().int().positive(),
    visibility: z.enum(WORK_VISIBILITIES),
    publicationReviewAcknowledged: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.visibility !== "PUBLISHED" || v.publicationReviewAcknowledged === true,
    {
      path: ["publicationReviewAcknowledged"],
      message: "Publication review acknowledgment is required",
    },
  );
export const catalogQuerySchema = z
  .object({
    q: z.string().trim().max(200).default(""),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    format: z.enum(WORK_FORMATS).optional(),
    genre: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(100)
      .optional(),
    locale: z.enum(["en", "vi"]).default("en"),
  })
  .strict()
  .refine((v) => (v.page - 1) * v.pageSize <= 10000, "Offset exceeds limit");
export type CatalogQuery = z.input<typeof catalogQuerySchema>;
export type ParsedCatalogQuery = z.output<typeof catalogQuerySchema>;
export type WorkInputPayload = z.input<typeof workInputSchema>;
export type AggregateWork = {
  id: string;
  slug: string;
  primaryTitle: string;
  primaryTitleLanguage: string;
  displayTitle: string;
  displayTitleLanguage: string;
  format: WorkInput["format"];
  releaseStatus: WorkInput["releaseStatus"];
  originalLanguage: string | null;
  country: string | null;
  publicationYear: number | null;
  publicationLabel: string | null;
  source: WorkInput["source"];
  titles: WorkInput["titles"];
  descriptions: WorkInput["descriptions"];
  editions: WorkInput["editions"];
  creators: WorkInput["creators"];
  genres: WorkInput["genres"];
  cover: WorkInput["cover"] | null;
  identifiers: WorkInput["identifiers"];
  relations: Array<
    WorkInput["relations"][number] & {
      slug: string;
      displayTitle: string;
      displayTitleLanguage: string;
    }
  >;
};
export type AdminWork = AggregateWork & {
  visibility: WorkInput["visibility"];
  revision: number;
};
export type CatalogPage<T = AggregateWork> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
