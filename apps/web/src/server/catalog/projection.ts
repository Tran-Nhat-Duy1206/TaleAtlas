import "server-only";
import type {
  AggregateWork,
  AdminWork,
  WorkInput,
} from "../../features/catalog/contracts";
type Row = Record<string, unknown>;
function pick<T>(row: Row, keys: string[]): T {
  return Object.fromEntries(
    keys
      .filter((k) => row[k] !== null && row[k] !== undefined)
      .map((k) => [k, row[k]]),
  ) as T;
}
export type PersistedWork = {
  work: Row;
  source: Row;
  titles: Row[];
  descriptions: Row[];
  editions: Row[];
  creators: Row[];
  genres: Row[];
  cover: Row | null;
  identifiers: Row[];
  relations: Row[];
};
export function projectWork(
  data: PersistedWork,
  locale: string,
  admin = false,
): AggregateWork | AdminWork {
  const w = data.work;
  const titles = data.titles.map((t) =>
    pick<WorkInput["titles"][number]>(t, ["title", "language", "kind"]),
  );
  const preferred =
    titles.find((t) => t.language === locale) ??
    titles.find((t) => t.language === w.originalLanguage);
  const result: AggregateWork = {
    id: String(w.id),
    slug: String(w.slug),
    primaryTitle: String(w.primaryTitle),
    primaryTitleLanguage: String(w.primaryTitleLanguage),
    displayTitle:
      w.primaryTitleLanguage === locale
        ? String(w.primaryTitle)
        : (preferred?.title ?? String(w.primaryTitle)),
    displayTitleLanguage:
      w.primaryTitleLanguage === locale
        ? locale
        : (preferred?.language ?? String(w.primaryTitleLanguage)),
    format: w.format as WorkInput["format"],
    releaseStatus: w.releaseStatus as WorkInput["releaseStatus"],
    originalLanguage: w.originalLanguage as string | null,
    country: w.country as string | null,
    publicationYear: w.publicationYear as number | null,
    publicationLabel: w.publicationLabel as string | null,
    source: pick(
      {
        ...data.source,
        consultedAt:
          data.source.consultedAt instanceof Date
            ? data.source.consultedAt.toISOString()
            : data.source.consultedAt,
      },
      ["label", "citation", "url", "consultedAt"],
    ),
    titles,
    descriptions: data.descriptions.map((r) => pick(r, ["language", "text"])),
    editions: data.editions.map((r) =>
      pick(r, [
        "id",
        "title",
        "language",
        "publisher",
        "format",
        "publicationYear",
        "publicationLabel",
        "isbn",
      ]),
    ),
    creators: data.creators.map((r) =>
      pick(r, ["id", "name", "role", "editionId", "displayOrder"]),
    ),
    genres: data.genres.map((r) => pick(r, ["slug", "nameEn", "nameVi"])),
    cover: data.cover
      ? pick(
          data.cover,
          data.cover.rights === "UNKNOWN"
            ? ["rights", "credit", "rightsStatement", "licenseUrl"]
            : [
                "assetPath",
                "rights",
                "credit",
                "rightsStatement",
                "licenseUrl",
              ],
        )
      : null,
    identifiers: data.identifiers.map((r) => pick(r, ["namespace", "value"])),
    relations: data.relations.map((r) =>
      pick(r, [
        "toWorkId",
        "type",
        "slug",
        "displayTitle",
        "displayTitleLanguage",
      ]),
    ),
  };
  return admin
    ? {
        ...result,
        visibility: w.visibility as WorkInput["visibility"],
        revision: Number(w.revision),
      }
    : result;
}
