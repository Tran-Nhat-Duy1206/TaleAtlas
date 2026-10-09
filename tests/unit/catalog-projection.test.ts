import { it, expect } from "vitest";
import { adminInput } from "../../apps/web/src/components/catalog/admin-input";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import {
  projectWork,
  type PersistedWork,
} from "../../apps/web/src/server/catalog/projection";
const data: PersistedWork = {
  work: {
    id: "id",
    slug: "slug",
    primaryTitle: "Canonical",
    primaryTitleLanguage: "en",
    format: "MANGA",
    releaseStatus: "UNKNOWN",
    originalLanguage: "ja",
    country: null,
    publicationYear: null,
    publicationLabel: null,
    visibility: "HIDDEN",
    revision: 7,
    actorUserId: "secret",
    searchText: "secret",
  },
  source: {
    id: "source-id",
    label: "Publisher",
    citation: "record",
    createdAt: "private",
  },
  titles: [
    { title: "Tiếng Việt", language: "vi", kind: "ALIAS", sourceId: "private" },
    { title: "日本語", language: "ja", kind: "ORIGINAL" },
  ],
  descriptions: [],
  editions: [],
  creators: [
    {
      id: "creator",
      name: "Person",
      role: "AUTHOR",
      displayOrder: 0,
      sourceId: "private",
    },
  ],
  genres: [],
  cover: {
    rights: "UNKNOWN",
    assetPath: "/covers/private.jpg",
    sourceId: "private",
  },
  identifiers: [],
  relations: [],
};
it("projects only explicitly public fields and uses actual selected language", () => {
  const p = projectWork(data, "vi");
  expect(p.displayTitle).toBe("Tiếng Việt");
  expect(p.displayTitleLanguage).toBe("vi");
  for (const key of [
    "visibility",
    "revision",
    "actorUserId",
    "searchText",
    "createdAt",
  ])
    expect(p).not.toHaveProperty(key);
  expect(p.source).toEqual({ label: "Publisher", citation: "record" });
  expect(p.titles[0]).not.toHaveProperty("sourceId");
  expect(p.cover).toEqual({ rights: "UNKNOWN" });
});
it("prefers canonical locale, then original, then canonical fallback", () => {
  expect(projectWork(data, "en").displayTitle).toBe("Canonical");
  expect(projectWork(data, "fr").displayTitleLanguage).toBe("ja");
  expect(projectWork({ ...data, titles: [] }, "vi").displayTitleLanguage).toBe(
    "en",
  );
});
it("does not duplicate the editable canonical title in advanced metadata", () => {
  const admin = projectWork(
    {
      ...data,
      titles: [
        { title: "Canonical", language: "en", kind: "PRIMARY" },
        ...data.titles,
      ],
    },
    "en",
    true,
  ) as AdminWork;
  const input = adminInput(admin);
  expect(input.primaryTitle).toBe("Canonical");
  expect(input.titles).toEqual(
    data.titles.map(({ title, language, kind }) => ({ title, language, kind })),
  );
  expect(
    (input.titles ?? []).some(
      (t) => t.kind === "PRIMARY" && t.language === input.primaryTitleLanguage,
    ),
  ).toBe(false);
  expect(
    (input.titles ?? []).some(
      (t) => t.kind === "ORIGINAL" && t.title === "日本語",
    ),
  ).toBe(true);
});
it("adds only revision and visibility for admin", () => {
  expect(projectWork(data, "en", true)).toMatchObject({
    revision: 7,
    visibility: "HIDDEN",
  });
  expect(projectWork(data, "en", true)).not.toHaveProperty("actorUserId");
});
