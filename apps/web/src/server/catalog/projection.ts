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
function compareCodepoints(a: string, b: string): number {
  const left = Array.from(a, (character) => character.codePointAt(0)!);
  const right = Array.from(b, (character) => character.codePointAt(0)!);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return left.length - right.length;
}

export function selectDisplayTitle(
  work: {
    primaryTitle: string;
    primaryTitleLanguage: string;
    originalLanguage?: string | null;
    titles: readonly WorkInput["titles"][number][];
  },
  locale: string,
): Pick<AggregateWork, "displayTitle" | "displayTitleLanguage"> {
  const canonical = {
    displayTitle: work.primaryTitle,
    displayTitleLanguage: work.primaryTitleLanguage,
  };
  if (work.primaryTitleLanguage === locale) return canonical;

  const compareTitles = (
    a: WorkInput["titles"][number],
    b: WorkInput["titles"][number],
  ) =>
    compareCodepoints(a.language, b.language) ||
    compareCodepoints(a.title, b.title);
  const primary = work.titles
    .filter((title) => title.kind === "PRIMARY" && title.language === locale)
    .sort(compareTitles)[0];
  const original = work.titles
    .filter((title) => title.kind === "ORIGINAL")
    .sort(
      (a, b) =>
        Number(b.language === work.originalLanguage) -
          Number(a.language === work.originalLanguage) || compareTitles(a, b),
    )[0];
  const selected = primary ?? original;
  return selected
    ? { displayTitle: selected.title, displayTitleLanguage: selected.language }
    : canonical;
}

export function projectWork(
  data: PersistedWork,
  locale: string,
  admin = false,
): AggregateWork | AdminWork {
  const w = data.work;
  const titles = data.titles.map((t) =>
    pick<WorkInput["titles"][number]>(t, ["title", "language", "kind"]),
  );
  const display = selectDisplayTitle(
    {
      primaryTitle: String(w.primaryTitle),
      primaryTitleLanguage: String(w.primaryTitleLanguage),
      originalLanguage: w.originalLanguage as string | null,
      titles,
    },
    locale,
  );
  const result: AggregateWork = {
    id: String(w.id),
    slug: String(w.slug),
    primaryTitle: String(w.primaryTitle),
    primaryTitleLanguage: String(w.primaryTitleLanguage),
    ...display,
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
          !admin && data.cover.rights === "UNKNOWN"
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
