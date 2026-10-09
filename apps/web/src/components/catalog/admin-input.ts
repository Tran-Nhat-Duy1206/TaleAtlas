import type { AdminWork, WorkInputPayload } from "@/features/catalog/contracts";
export function adminInput(work: AdminWork): WorkInputPayload {
  const source = work.source as {
    label: string;
    citation: string;
    url?: string | null;
    consultedAt?: string | null;
  };
  return {
    primaryTitle: work.primaryTitle,
    primaryTitleLanguage: work.primaryTitleLanguage,
    format: work.format,
    visibility: work.visibility,
    // A persisted work never carries forward acknowledgment for a new command.
    publicationReviewAcknowledged: false,
    releaseStatus: work.releaseStatus,
    originalLanguage: work.originalLanguage ?? undefined,
    country: work.country ?? undefined,
    publicationYear: work.publicationYear ?? undefined,
    publicationLabel: work.publicationLabel ?? undefined,
    source: {
      label: source.label,
      citation: source.citation,
      url: source.url ?? undefined,
      consultedAt: source.consultedAt ?? undefined,
    },
    // The canonical title is edited in the basic fields and persisted by the repository.
    // Duplicating it in advanced JSON makes ordinary retitles conflict with their old value.
    titles: work.titles
      .filter(
        (t) =>
          !(
            t.kind === "PRIMARY" &&
            t.title === work.primaryTitle &&
            t.language === work.primaryTitleLanguage
          ),
      )
      .map(({ title, language, kind }) => ({ title, language, kind })),
    descriptions: work.descriptions.map(({ language, text }) => ({
      language,
      text,
    })),
    editions: work.editions.map(
      ({
        id,
        title,
        language,
        publisher,
        format,
        publicationYear,
        publicationLabel,
        isbn,
      }) => ({
        id,
        title,
        language,
        publisher,
        format,
        publicationYear,
        publicationLabel,
        isbn,
      }),
    ),
    creators: work.creators.map(
      ({ id, name, role, editionId, editionIndex, displayOrder }) => ({
        id,
        name,
        role,
        editionId,
        editionIndex,
        displayOrder,
      }),
    ),
    genres: work.genres.map(({ slug, nameEn, nameVi }) => ({
      slug,
      nameEn,
      nameVi,
    })),
    cover: work.cover
      ? {
          assetPath: work.cover.assetPath,
          rights: work.cover.rights,
          credit: work.cover.credit,
          rightsStatement: work.cover.rightsStatement,
          licenseUrl: work.cover.licenseUrl,
        }
      : { rights: "UNKNOWN" },
    identifiers: work.identifiers.map(({ namespace, value }) => ({
      namespace,
      value,
    })),
    relations: work.relations.map(({ toWorkId, type }) => ({ toWorkId, type })),
  };
}
