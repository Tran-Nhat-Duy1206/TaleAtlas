import { describe, expect, it } from "vitest";
import {
  preflightMetadataProposal as check,
  type MetadataOperationContext,
} from "../../apps/web/src/features/catalog/metadata-operation-safety";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const workId = id(1);
const title = (
  n: number,
  value = `Alias ${n}`,
  language = "en",
  kind: "PRIMARY" | "ORIGINAL" | "ALIAS" = "ALIAS",
) => ({ id: id(n), workId, title: value, language, kind });
function context(): MetadataOperationContext {
  return {
    work: {
      id: workId,
      slug: "work",
      primaryTitle: "Canonical",
      primaryTitleLanguage: "en",
      revision: 3,
      visibility: "PUBLISHED",
    },
    titles: [
      title(2, "Canonical", "en", "PRIMARY"),
      title(3),
      title(4, "Original", "ja", "ORIGINAL"),
      title(5, "Second", "vi", "PRIMARY"),
    ],
    descriptions: [
      { workId, language: "en", text: "Existing summary" },
      { workId, language: "vi", text: "Other summary" },
    ],
    genreMemberships: [{ workId, slug: "fantasy" }],
    existingGenreSlugs: ["fantasy", "mystery"],
  };
}
const rights = {
  basis: "ORIGINAL_SUMMARY",
  originalityAcknowledged: true,
  statement: "I wrote this summary independently.",
};
const proposal = (operation: unknown) => ({
  version: 1,
  submitKey: id(90),
  workId,
  baseWorkRevision: 3,
  citation: { label: "Bibliography", citation: "Reviewed record" },
  operation,
});
const add = {
  type: "TITLE_ADD",
  value: { title: "New title", language: "en", kind: "ALIAS" },
};
const accepted = [
  add,
  {
    type: "TITLE_ADD",
    value: { title: "French", language: "fr", kind: "PRIMARY" },
  },
  { type: "TITLE_REPLACE", titleId: id(3), title: "Changed" },
  { type: "TITLE_REPLACE", titleId: id(5), title: "Secondary correction" },
  { type: "TITLE_REMOVE", titleId: id(3), reason: "Incorrect assertion" },
  { type: "TITLE_REMOVE", titleId: id(5), reason: "Incorrect assertion" },
  { type: "DESCRIPTION_ADD", language: "fr", text: "Fresh summary", rights },
  {
    type: "DESCRIPTION_REPLACE",
    language: "en",
    text: "Corrected summary",
    rights,
  },
  { type: "DESCRIPTION_REMOVE", language: "en", reason: "Incorrect" },
  { type: "GENRE_ADD_MEMBERSHIP", slug: "mystery" },
  { type: "GENRE_REMOVE_MEMBERSHIP", slug: "fantasy", reason: "Misclassified" },
];
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const denied = (op: unknown, code: string, c = context()) =>
  expect(check(proposal(op), c)).toEqual({ ok: false, code });

describe("read-only metadata operation preflight (not SQL, authority or rights proof)", () => {
  it.each(accepted)(
    "accepts operation without mutating frozen siblings: %j",
    (op) => {
      const c = freeze(context());
      const p = freeze(proposal(op));
      const before = JSON.stringify({ c, p });
      const result = check(p, c);
      expect(result.ok).toBe(true);
      expect(JSON.stringify({ c, p })).toBe(before);
      expect(c.titles[0].id).toBe(id(2));
      expect(c.descriptions[1].language).toBe("vi");
      expect(c.existingGenreSlugs).toEqual(["fantasy", "mystery"]);
      if (result.ok) expect(result.proposal).not.toBe(p);
    },
  );
  it.each(["DRAFT", "HIDDEN"] as const)("denies %s work", (visibility) =>
    denied(add, "WORK_UNAVAILABLE", {
      ...context(),
      work: { ...context().work, visibility },
    }),
  );
  it("checks exact work/revision and overflow", () => {
    expect(check({ ...proposal(add), workId: id(99) }, context())).toEqual({
      ok: false,
      code: "WORK_UNAVAILABLE",
    });
    expect(check({ ...proposal(add), baseWorkRevision: 2 }, context())).toEqual(
      { ok: false, code: "STALE_REVISION" },
    );
    const c = context();
    expect(
      check(
        { ...proposal(add), baseWorkRevision: 2147483647 },
        { ...c, work: { ...c.work, revision: 2147483647 } },
      ),
    ).toEqual({ ok: false, code: "REVISION_OVERFLOW" });
  });
  it.each([id(80), id(81)])(
    "does not distinguish foreign from missing UUID %s",
    (titleId) =>
      denied(
        { type: "TITLE_REMOVE", titleId, reason: "Incorrect" },
        "TARGET_MISSING",
      ),
  );
  it.each([id(2), id(4)])("protects canonical/ORIGINAL UUID %s", (titleId) => {
    denied(
      { type: "TITLE_REPLACE", titleId, title: "Changed" },
      "TARGET_PROTECTED",
    );
    denied(
      { type: "TITLE_REMOVE", titleId, reason: "Incorrect" },
      "TARGET_PROTECTED",
    );
  });
  it("rejects malformed trusted invariants without retrofitting alias collisions", () => {
    const c = context();
    const invalid = [
      { ...c, titles: [...c.titles, c.titles[1]] },
      { ...c, titles: c.titles.slice(1) },
      { ...c, titles: [...c.titles, title(20, "Another", "en", "PRIMARY")] },
      { ...c, titles: [...c.titles, title(20, "Another", "fr", "ORIGINAL")] },
      {
        ...c,
        titles: c.titles.map((t, i) =>
          i === 1 ? { ...t, workId: id(99) } : t,
        ),
      },
      { ...c, descriptions: [...c.descriptions, c.descriptions[0]] },
      { ...c, descriptions: [{ ...c.descriptions[0], workId: id(99) }] },
      {
        ...c,
        genreMemberships: [...c.genreMemberships, c.genreMemberships[0]],
      },
      { ...c, genreMemberships: [{ workId: id(99), slug: "fantasy" }] },
      { ...c, existingGenreSlugs: ["fantasy", "fantasy"] },
      { ...c, work: { ...c.work, id: "not-uuid" } },
    ];
    for (const bad of invalid) denied(add, "INVALID_CONTEXT", bad);
  });
  it("applies 30 EXTRA title limit (31 physical rows)", () => {
    const c = context();
    const full = {
      ...c,
      titles: [
        c.titles[0],
        ...Array.from({ length: 30 }, (_, i) => title(100 + i)),
      ],
    };
    denied(add, "LIMIT_EXCEEDED", full);
    expect(
      check(proposal(add), { ...full, titles: full.titles.slice(0, 30) }).ok,
    ).toBe(true);
    denied(add, "INVALID_CONTEXT", {
      ...full,
      titles: [...full.titles, title(200)],
    });
    expect(
      check(
        proposal({
          type: "TITLE_REMOVE",
          titleId: id(100),
          reason: "Incorrect",
        }),
        full,
      ).ok,
    ).toBe(true);
  });
  it("enforces secondary PRIMARY exact-language uniqueness", () => {
    for (const language of ["en", "vi"])
      denied(
        {
          type: "TITLE_ADD",
          value: { title: "Other", language, kind: "PRIMARY" },
        },
        "CONFLICT",
      );
    expect(
      check(
        proposal({ ...add, value: { ...add.value, title: "Canonical" } }),
        context(),
      ).ok,
    ).toBe(true); // different kind
  });
  it("denies introduced exact/normalized duplicates, but grandfathers unchanged norm collisions", () => {
    const c = {
      ...context(),
      titles: [context().titles[0], title(3, "Café"), title(4, "CAFE")],
    };
    for (const value of ["Café", "cafe", "CAFÉ!"])
      denied({ ...add, value: { ...add.value, title: value } }, "CONFLICT", c);
    expect(
      check(
        proposal({ type: "TITLE_REPLACE", titleId: id(3), title: "café" }),
        c,
      ).ok,
    ).toBe(true);
    denied(
      { type: "TITLE_REPLACE", titleId: id(3), title: "CAFE" },
      "CONFLICT",
      c,
    );
    denied(
      { type: "TITLE_REPLACE", titleId: id(3), title: "Café" },
      "NO_CHANGE",
      c,
    );
    const other = { ...c, titles: [...c.titles, title(5, "Other")] };
    denied(
      { type: "TITLE_REPLACE", titleId: id(5), title: "cafe!" },
      "CONFLICT",
      other,
    );
    const exactLegacy = { ...c, titles: [...c.titles, title(6, "Café")] };
    expect(
      check(
        proposal({ type: "TITLE_REPLACE", titleId: id(3), title: "CAFÉ" }),
        exactLegacy,
      ).ok,
    ).toBe(true);
    expect(
      check(
        proposal({ type: "TITLE_REMOVE", titleId: id(3), reason: "Incorrect" }),
        exactLegacy,
      ).ok,
    ).toBe(true);
    expect(exactLegacy.titles).toHaveLength(4);
  });
  it("uses exact description language natural keys and denies no-op", () => {
    denied(
      { type: "DESCRIPTION_ADD", language: "en", text: "New", rights },
      "CONFLICT",
    );
    denied(
      { type: "DESCRIPTION_REPLACE", language: "fr", text: "New", rights },
      "TARGET_MISSING",
    );
    denied(
      { type: "DESCRIPTION_REMOVE", language: "fr", reason: "Incorrect" },
      "TARGET_MISSING",
    );
    denied(
      {
        type: "DESCRIPTION_REPLACE",
        language: "en",
        text: "Existing summary",
        rights,
      },
      "NO_CHANGE",
    );
    const c = {
      ...context(),
      descriptions: [{ workId, language: "en-US", text: "Summary" }],
    };
    expect(
      check(
        proposal({
          type: "DESCRIPTION_ADD",
          language: "en-us",
          text: "Different exact key",
          rights,
        }),
        c,
      ).ok,
    ).toBe(true);
  });
  it("bounds descriptions at 30 without deleting siblings", () => {
    const c = {
      ...context(),
      descriptions: Array.from({ length: 30 }, (_, i) => ({
        workId,
        language: `en-x${String(i).padStart(2, "0")}`,
        text: "Summary",
      })),
    };
    denied(
      { type: "DESCRIPTION_ADD", language: "fr", text: "New", rights },
      "LIMIT_EXCEEDED",
      c,
    );
    expect(
      check(
        proposal({
          type: "DESCRIPTION_REPLACE",
          language: "en-x00",
          text: "Changed",
          rights,
        }),
        c,
      ).ok,
    ).toBe(true);
    denied(add, "INVALID_CONTEXT", {
      ...c,
      descriptions: [
        ...c.descriptions,
        { workId, language: "fr", text: "Extra" },
      ],
    });
  });
  it("only changes existing taxonomy memberships; no global deletion", () => {
    denied({ type: "GENRE_ADD_MEMBERSHIP", slug: "unknown" }, "TARGET_MISSING");
    denied({ type: "GENRE_ADD_MEMBERSHIP", slug: "fantasy" }, "CONFLICT");
    denied(
      { type: "GENRE_REMOVE_MEMBERSHIP", slug: "mystery", reason: "Incorrect" },
      "TARGET_MISSING",
    );
    const c = {
      ...context(),
      genreMemberships: Array.from({ length: 10 }, (_, i) => ({
        workId,
        slug: `genre-${i}`,
      })),
    };
    denied(
      { type: "GENRE_ADD_MEMBERSHIP", slug: "mystery" },
      "LIMIT_EXCEEDED",
      c,
    );
    expect(
      check(
        proposal({
          type: "GENRE_REMOVE_MEMBERSHIP",
          slug: "genre-0",
          reason: "Incorrect",
        }),
        c,
      ).ok,
    ).toBe(true);
    expect(c.genreMemberships).toHaveLength(10);
    denied(add, "INVALID_CONTEXT", {
      ...c,
      genreMemberships: [...c.genreMemberships, { workId, slug: "extra" }],
    });
  });
  it.each([
    { ...proposal(add), actorId: id(99) },
    { ...proposal(add), role: "ADMIN" },
    proposal({ ...add, actor: { role: "ADMIN" } }),
    proposal({
      type: "TITLE_REPLACE",
      titleId: id(3),
      title: "New",
      language: "fr",
    }),
    proposal({
      type: "TITLE_REPLACE",
      titleId: id(3),
      title: "New",
      kind: "PRIMARY",
    }),
    proposal({ type: "DESCRIPTION_ADD", language: "???", text: "New", rights }),
    proposal({ type: "DESCRIPTION_REPLACE", language: "en", text: "New" }),
    proposal({ type: "DESCRIPTION_REMOVE", language: "en", reason: "" }),
    proposal({
      type: "GENRE_ADD_MEMBERSHIP",
      slug: "mystery",
      nameEn: "Injected",
    }),
    proposal({
      type: "GENRE_REMOVE_MEMBERSHIP",
      slug: "fantasy",
      globalDelete: true,
      reason: "Incorrect",
    }),
    proposal({ ...add, value: { ...add.value, title: "Bad\u202e" } }),
    proposal({ ...add, value: { ...add.value, title: "Bad\ud800" } }),
    null,
  ])("reparses unknown/forged inputs rather than trusting casts: %j", (p) =>
    expect(check(p, context())).toEqual({ ok: false, code: "INVALID_INPUT" }),
  );
  it("returns Unicode as validated by parser without identity folding", () => {
    const p = proposal({
      ...add,
      value: { ...add.value, title: "Đường 日本 e\u0301" },
    });
    const r = check(p, context());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.proposal.operation).toEqual(p.operation);
  });
  it("fails closed for malformed contexts and throwing helper inputs without leaking details", () => {
    for (const c of [
      null,
      {},
      { ...context(), titles: null },
      {
        get work() {
          throw new Error("private-context-detail");
        },
      },
    ]) {
      expect(
        check(proposal(add), c as unknown as MetadataOperationContext),
      ).toEqual({
        ok: false,
        code: "INVALID_CONTEXT",
      });
    }
    const p = {
      get version() {
        throw new Error("private-input-detail");
      },
    };
    expect(check(p, context())).toEqual({ ok: false, code: "INVALID_INPUT" });
  });
});
