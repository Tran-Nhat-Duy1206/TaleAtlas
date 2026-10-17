import { describe, expect, it } from "vitest";
import {
  metadataTargetSchema,
  metadataSuggestionSchema,
  metadataSuggestionPageSchema,
  metadataSuggestionListSchema,
  metadataHistoryEventSchema,
  metadataEvidenceSchema,
  metadataSuggestionDetailSchema,
  metadataAdminSuggestionDetailSchema,
} from "../../apps/web/src/features/catalog/metadata-suggestion-contracts";
import {
  canonicalMetadataProposalInput,
  MAX_METADATA_CANONICAL_BYTES,
  submitMetadataProposalSchema,
} from "../../apps/web/src/features/catalog/metadata-operations";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-01-02T03:04:05.123Z";
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function proposal() {
  return {
    version: 1,
    submitKey: id(2),
    workId: id(1),
    baseWorkRevision: 1,
    operation: {
      type: "TITLE_ADD",
      value: { title: "Added alias", language: "en", kind: "ALIAS" },
    },
    citation: { label: "Synthetic source", citation: "Synthetic citation" },
  };
}
function target() {
  return {
    work: {
      id: id(1),
      slug: "synthetic-work",
      primaryTitle: "Synthetic Work",
      primaryTitleLanguage: "en",
      revision: 1,
      visibility: "PUBLISHED",
    },
    titles: [
      {
        id: id(3),
        workId: id(1),
        title: "Synthetic Work",
        language: "en",
        kind: "PRIMARY",
      },
    ],
    descriptions: [
      { workId: id(1), language: "en", text: "Synthetic original summary" },
    ],
    genreMemberships: [{ workId: id(1), slug: "fantasy" }],
    genreOptions: [{ slug: "fantasy", nameEn: "Fantasy", nameVi: "Ky ao" }],
  };
}
function suggestion(
  state: "SUBMITTED" | "APPROVED" | "REJECTED" = "SUBMITTED",
) {
  return {
    id: id(4),
    workId: id(1),
    baseWorkRevision: 1,
    revision: state === "SUBMITTED" ? 1 : 2,
    state,
    appliedWorkRevision: state === "APPROVED" ? 2 : null,
    createdAt: at,
    updatedAt: at,
    contentState: "ACTIVE",
    proposal: proposal(),
    reviewReason: state === "SUBMITTED" ? null : "Synthetic review",
    reasonRedacted: false,
  };
}
function event(state: "SUBMITTED" | "APPROVED" | "REJECTED" = "SUBMITTED") {
  return {
    revision: state === "SUBMITTED" ? 1 : 2,
    fromState: state === "SUBMITTED" ? null : "SUBMITTED",
    toState: state,
    createdAt: at,
    reasonRedacted: false,
    metadataReviewAcknowledged: state === "APPROVED" ? true : null,
    publicationReviewAcknowledged: state === "APPROVED" ? true : null,
    rightsReviewAcknowledged: state === "APPROVED" ? true : null,
  };
}
function evidence() {
  return {
    id: id(5),
    auditEventId: id(6),
    workRevision: 2,
    operationType: "TITLE_ADD",
    titleId: id(7),
    descriptionLanguage: null,
    genreSlug: null,
    beforePresent: false,
    afterPresent: true,
    beforeTitle: null,
    afterTitle: "Added alias",
    titleLanguage: "en",
    titleKind: "ALIAS",
    beforeDescription: null,
    afterDescription: null,
    rightsBasis: null,
    originalityAcknowledged: null,
    rightsReviewAcknowledged: null,
  };
}
function detail(state: "SUBMITTED" | "APPROVED" | "REJECTED" = "SUBMITTED") {
  return {
    suggestion: suggestion(state),
    current: target(),
    history: state === "SUBMITTED" ? [event()] : [event(), event(state)],
    evidence: state === "APPROVED" ? evidence() : null,
  };
}
const acknowledgments = [
  "metadataReviewAcknowledged",
  "publicationReviewAcknowledged",
  "rightsReviewAcknowledged",
] as const;

describe("V5B private DTO allowlists and lifecycle", () => {
  it("accepts frozen valid target, lifecycle, list and detail fixtures without mutating input", () => {
    const t = freeze(target());
    const tBefore = JSON.stringify(t);
    expect(metadataTargetSchema.parse(t)).toEqual(t);
    for (const state of ["SUBMITTED", "APPROVED", "REJECTED"] as const) {
      const d = freeze(detail(state));
      const before = JSON.stringify(d);
      expect(metadataSuggestionSchema.parse(d.suggestion)).toEqual(
        d.suggestion,
      );
      expect(metadataSuggestionDetailSchema.parse(d)).toEqual(d);
      expect(JSON.stringify(d)).toBe(before);
    }
    const list = freeze({
      items: [suggestion()],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(metadataSuggestionListSchema.parse(list)).toEqual(list);
    expect(JSON.stringify(t)).toBe(tBefore);
  });

  it("rejects foreign Work handles and duplicate title/locale/membership/taxonomy identities", () => {
    for (const key of ["titles", "descriptions", "genreMemberships"] as const) {
      const t = target();
      t[key][0]!.workId = id(99);
      expect(metadataTargetSchema.safeParse(freeze(t)).success, key).toBe(
        false,
      );
    }
    for (const key of [
      "titles",
      "descriptions",
      "genreMemberships",
      "genreOptions",
    ] as const) {
      const t = target();
      const rows = t[key];
      const duplicate = structuredClone(rows[0]!);
      const invalid = { ...t, [key]: [...rows, duplicate] };
      expect(metadataTargetSchema.safeParse(freeze(invalid)).success, key).toBe(
        false,
      );
    }
  });

  it("uses actual DB genre-name bounds and bounds each private target collection/scalar", () => {
    const t = target();
    t.genreOptions[0]!.nameEn = "e".repeat(200);
    t.genreOptions[0]!.nameVi = "v".repeat(200);
    expect(metadataTargetSchema.safeParse(freeze(t)).success).toBe(true);
    for (const field of ["nameEn", "nameVi"] as const) {
      const invalid = target();
      invalid.genreOptions[0]![field] = "x".repeat(201);
      expect(metadataTargetSchema.safeParse(invalid).success).toBe(false);
    }
    for (const invalid of [
      {
        ...target(),
        work: { ...target().work, primaryTitle: "x".repeat(501) },
      },
      { ...target(), work: { ...target().work, revision: 2147483648 } },
      { ...target(), work: { ...target().work, visibility: "DRAFT" } },
      {
        ...target(),
        titles: Array.from({ length: 32 }, (_, n) => ({
          ...target().titles[0]!,
          id: id(100 + n),
        })),
      },
      {
        ...target(),
        descriptions: Array.from({ length: 31 }, (_, n) => ({
          ...target().descriptions[0]!,
          language: `en-${n}`,
        })),
      },
      {
        ...target(),
        descriptions: [
          { ...target().descriptions[0]!, text: "x".repeat(20001) },
        ],
      },
      {
        ...target(),
        genreMemberships: Array.from({ length: 11 }, (_, n) => ({
          workId: id(1),
          slug: `genre-${n}`,
        })),
      },
      {
        ...target(),
        genreOptions: Array.from({ length: 211 }, (_, n) => ({
          slug: `genre-${n}`,
          nameEn: "Name",
          nameVi: "Ten",
        })),
      },
    ])
      expect(metadataTargetSchema.safeParse(freeze(invalid)).success).toBe(
        false,
      );
  });

  it("rejects actor/source/library leakage rather than silently stripping unknown nested keys", () => {
    for (const field of [
      "actorUserId",
      "ownerUserId",
      "actorSnapshot",
      "sourceId",
      "source",
      "libraryEntry",
      "readingProgress",
      "rightsStatement",
    ]) {
      expect(
        metadataTargetSchema.safeParse({ ...target(), [field]: "PRIVATE" })
          .success,
        field,
      ).toBe(false);
      expect(
        metadataSuggestionSchema.safeParse({
          ...suggestion(),
          [field]: "PRIVATE",
        }).success,
        field,
      ).toBe(false);
      expect(
        metadataSuggestionListSchema.safeParse({
          items: [suggestion()],
          total: 1,
          page: 1,
          pageSize: 20,
          [field]: "PRIVATE",
        }).success,
        field,
      ).toBe(false);
      expect(
        metadataSuggestionDetailSchema.safeParse({
          ...detail(),
          [field]: "PRIVATE",
        }).success,
        field,
      ).toBe(false);
      expect(
        metadataTargetSchema.safeParse({
          ...target(),
          work: { ...target().work, [field]: "PRIVATE" },
        }).success,
        field,
      ).toBe(false);
      expect(
        metadataTargetSchema.safeParse({
          ...target(),
          titles: [{ ...target().titles[0]!, [field]: "PRIVATE" }],
        }).success,
        field,
      ).toBe(false);
      expect(
        metadataTargetSchema.safeParse({
          ...target(),
          descriptions: [{ ...target().descriptions[0]!, [field]: "PRIVATE" }],
        }).success,
        field,
      ).toBe(false);
      expect(
        metadataTargetSchema.safeParse({
          ...target(),
          genreMemberships: [
            { ...target().genreMemberships[0]!, [field]: "PRIVATE" },
          ],
        }).success,
        field,
      ).toBe(false);
      expect(
        metadataTargetSchema.safeParse({
          ...target(),
          genreOptions: [{ ...target().genreOptions[0]!, [field]: "PRIVATE" }],
        }).success,
        field,
      ).toBe(false);
      expect(
        metadataHistoryEventSchema.safeParse({ ...event(), [field]: "PRIVATE" })
          .success,
        field,
      ).toBe(false);
      expect(
        metadataEvidenceSchema.safeParse({ ...evidence(), [field]: "PRIVATE" })
          .success,
        field,
      ).toBe(false);
    }
  });

  it("bounds and strictly whitelists private pagination/list fields", () => {
    expect(metadataSuggestionPageSchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(
      metadataSuggestionPageSchema.parse({ page: "501", pageSize: "50" }),
    ).toEqual({ page: 501, pageSize: 50 });
    for (const invalid of [
      { page: 0 },
      { page: 502 },
      { page: 1.5 },
      { pageSize: 0 },
      { pageSize: 51 },
      { ownerUserId: id(99) },
    ])
      expect(metadataSuggestionPageSchema.safeParse(invalid).success).toBe(
        false,
      );
    for (const invalid of [
      { items: [], total: -1, page: 1, pageSize: 20 },
      { items: [], total: 1.5, page: 1, pageSize: 20 },
      {
        items: Array.from({ length: 51 }, () => suggestion()),
        total: 51,
        page: 1,
        pageSize: 50,
      },
      { items: [], total: 0, page: 502, pageSize: 20 },
      { items: [], total: 0, page: 1, pageSize: 51 },
      {
        items: [{ ...suggestion(), sourceId: id(99) }],
        total: 1,
        page: 1,
        pageSize: 20,
      },
    ])
      expect(metadataSuggestionListSchema.safeParse(invalid).success).toBe(
        false,
      );
  });

  it("binds active payload Work/base and enforces exact submitted/approved/rejected revisions", () => {
    for (const invalid of [
      { ...suggestion(), proposal: null },
      { ...suggestion(), proposal: { ...proposal(), workId: id(99) } },
      { ...suggestion(), proposal: { ...proposal(), baseWorkRevision: 2 } },
      { ...suggestion(), revision: 2 },
      { ...suggestion(), appliedWorkRevision: 2 },
      { ...suggestion(), reviewReason: "not reviewed" },
      { ...suggestion("APPROVED"), revision: 1 },
      { ...suggestion("APPROVED"), appliedWorkRevision: null },
      { ...suggestion("APPROVED"), appliedWorkRevision: 3 },
      { ...suggestion("REJECTED"), appliedWorkRevision: 2 },
      { ...suggestion("REJECTED"), reviewReason: null },
      { ...suggestion("REJECTED"), reviewReason: "x".repeat(2001) },
      { ...suggestion("REJECTED"), reasonRedacted: true },
    ])
      expect(metadataSuggestionSchema.safeParse(freeze(invalid)).success).toBe(
        false,
      );
  });

  it("accepts irreversible erasure/redaction but refuses retained text or unredacted reviewed tombstones", () => {
    for (const state of ["SUBMITTED", "APPROVED", "REJECTED"] as const) {
      const erased = {
        ...suggestion(state),
        contentState: "ERASED",
        proposal: null,
        reviewReason: null,
        reasonRedacted: true,
      };
      expect(metadataSuggestionSchema.safeParse(freeze(erased)).success).toBe(
        true,
      );
      expect(
        metadataSuggestionSchema.safeParse({ ...erased, proposal: proposal() })
          .success,
      ).toBe(false);
      expect(
        metadataSuggestionSchema.safeParse({
          ...erased,
          reviewReason: "restored narrative",
        }).success,
      ).toBe(false);
      if (state !== "SUBMITTED")
        expect(
          metadataSuggestionSchema.safeParse({
            ...erased,
            reasonRedacted: false,
          }).success,
        ).toBe(false);
    }
    expect(
      metadataSuggestionSchema.safeParse({
        ...suggestion("REJECTED"),
        reviewReason: null,
        reasonRedacted: true,
      }).success,
    ).toBe(true);
  });

  it("binds detail Work/revision/history and requires approval evidence only for approvals", () => {
    const foreign = target();
    foreign.work.id = id(99);
    for (const rows of [
      foreign.titles,
      foreign.descriptions,
      foreign.genreMemberships,
    ]) {
      for (const row of rows) row.workId = id(99);
    }
    expect(metadataTargetSchema.safeParse(foreign).success).toBe(true);
    for (const invalid of [
      { ...detail(), current: foreign },
      { ...detail(), history: [] },
      { ...detail(), history: [event(), event("REJECTED")] },
      { ...detail("APPROVED"), history: [event("APPROVED"), event()] },
      { ...detail("APPROVED"), history: [event(), event("REJECTED")] },
      { ...detail("APPROVED"), evidence: { ...evidence(), workRevision: 3 } },
      { ...detail("REJECTED"), evidence: evidence() },
      { ...detail(), evidence: evidence() },
    ])
      expect(
        metadataSuggestionDetailSchema.safeParse(freeze(invalid)).success,
      ).toBe(false);
    expect(
      metadataSuggestionDetailSchema.safeParse({ ...detail(), current: null })
        .success,
    ).toBe(true);
    // Common owner detail deliberately filters administrator-only evidence.
    // Role-context completeness belongs to the explicit admin DTO, not auth
    // inference in a generic pure validator. Service authorization is SQL-tested.
    const ownerApproved = freeze({ ...detail("APPROVED"), evidence: null });
    expect(
      metadataSuggestionDetailSchema.safeParse(ownerApproved).success,
    ).toBe(true);
    expect(
      metadataAdminSuggestionDetailSchema.safeParse(ownerApproved).success,
    ).toBe(false);
    expect(
      metadataAdminSuggestionDetailSchema.safeParse(freeze(detail("APPROVED")))
        .success,
    ).toBe(true);
    for (const state of ["SUBMITTED", "REJECTED"] as const) {
      expect(
        metadataAdminSuggestionDetailSchema.safeParse(freeze(detail(state)))
          .success,
      ).toBe(true);
    }
  });

  it("requires all three review acknowledgments only on APPROVED history transitions", () => {
    for (const key of acknowledgments) {
      for (const invalidValue of [null, false]) {
        const bad = { ...event("APPROVED"), [key]: invalidValue };
        expect(
          metadataHistoryEventSchema.safeParse(bad).success,
          `${key}=${invalidValue}`,
        ).toBe(false);
        expect(
          metadataSuggestionDetailSchema.safeParse({
            ...detail("APPROVED"),
            history: [event(), bad],
          }).success,
        ).toBe(false);
      }
      for (const state of ["SUBMITTED", "REJECTED"] as const) {
        const bad = { ...event(state), [key]: true };
        expect(
          metadataHistoryEventSchema.safeParse(bad).success,
          `${state}:${key}`,
        ).toBe(false);
        const history = state === "SUBMITTED" ? [bad] : [event(), bad];
        expect(
          metadataSuggestionDetailSchema.safeParse({
            ...detail(state),
            history,
          }).success,
        ).toBe(false);
      }
    }
    expect(
      metadataHistoryEventSchema.safeParse({
        ...event(),
        fromState: "REJECTED",
      }).success,
    ).toBe(false);
    expect(
      metadataHistoryEventSchema.safeParse({
        ...event("APPROVED"),
        fromState: null,
      }).success,
    ).toBe(false);
  });
});

describe("accepted V5A canonical byte identity (not SQL raw-byte identity)", () => {
  function description(text: string) {
    return {
      ...proposal(),
      operation: {
        type: "DESCRIPTION_REPLACE",
        language: "en",
        text,
        rights: {
          basis: "ORIGINAL_SUMMARY",
          originalityAcknowledged: true,
          statement: "r".repeat(2000),
        },
      },
      citation: {
        label: "l".repeat(200),
        citation: "c".repeat(4000),
        url: `https://example.invalid/${"u".repeat(1000)}`,
        consultedAt: `2026-01-02T03:04:05.${"1".repeat(100)}Z`,
      },
    };
  }
  it("accepts exactly 60000 canonical UTF8 bytes and rejects the otherwise-valid 60001-byte input", () => {
    const baseline = description("a");
    const baselineBytes = bytes(
      canonicalMetadataProposalInput(freeze(baseline)),
    );
    const delta = MAX_METADATA_CANONICAL_BYTES - baselineBytes;
    const text =
      "a" + "界".repeat(Math.floor(delta / 3)) + "a".repeat(delta % 3);
    expect(text.length).toBeLessThanOrEqual(20000);
    const exact = freeze(description(text));
    const before = JSON.stringify(exact);
    const parsed = submitMetadataProposalSchema.parse(exact);
    const canonical = canonicalMetadataProposalInput(parsed);
    expect(bytes(canonical)).toBe(60000);
    expect(MAX_METADATA_CANONICAL_BYTES).toBe(60000);
    expect(bytes(text)).toBeGreaterThan(text.length);
    expect(JSON.stringify(exact)).toBe(before);
    const overflow = freeze(description(text + "a"));
    const expectedCanonical = canonical.replace(text, text + "a");
    expect(bytes(expectedCanonical)).toBe(60001);
    const overflowResult = submitMetadataProposalSchema.safeParse(overflow);
    expect(overflowResult.success).toBe(false);
    if (!overflowResult.success) {
      expect(overflowResult.error.issues.map((issue) => issue.message)).toEqual(
        ["Canonical metadata proposal exceeds byte limit"],
      );
    }
    expect(() => canonicalMetadataProposalInput(overflow)).toThrow();
    // SQL sums typed raw scalar bytes; it omits canonical keys, punctuation,
    // domain, version etc. Its ceiling is not proof of canonical JSON equality.
    const rawPayloadBytes =
      bytes(text) +
      bytes(exact.operation.rights.statement) +
      bytes(exact.citation.label) +
      bytes(exact.citation.citation) +
      bytes(exact.citation.url) +
      bytes(exact.citation.consultedAt);
    expect(rawPayloadBytes).toBeLessThan(bytes(canonical));
  });
  it("excludes only delivery key from identity while binding Work/base and preserving frozen inputs", () => {
    const first = freeze(proposal());
    const second = freeze({ ...proposal(), submitKey: id(98) });
    const before = JSON.stringify([first, second]);
    expect(first.submitKey).not.toBe(second.submitKey);
    expect(canonicalMetadataProposalInput(first)).toBe(
      canonicalMetadataProposalInput(second),
    );
    expect(canonicalMetadataProposalInput(first)).not.toContain("submitKey");
    expect(
      canonicalMetadataProposalInput({ ...proposal(), workId: id(99) }),
    ).not.toBe(canonicalMetadataProposalInput(first));
    expect(
      canonicalMetadataProposalInput({ ...proposal(), baseWorkRevision: 2 }),
    ).not.toBe(canonicalMetadataProposalInput(first));
    expect(JSON.stringify([first, second])).toBe(before);
  });
  it("accepts >64-character datetime and URL lexical forms without promising PostgreSQL publication representability", () => {
    const consultedAt = `2026-01-02T03:04:05.${"1".repeat(100)}Z`;
    expect(consultedAt.length).toBeGreaterThan(64);
    for (const url of [
      "HTTPS://EXAMPLE.INVALID/path",
      " https://example.invalid/path ",
    ]) {
      const value = freeze({
        ...proposal(),
        citation: { ...proposal().citation, url, consultedAt },
      });
      const before = JSON.stringify(value);
      const parsed = submitMetadataProposalSchema.parse(value);
      expect(parsed.citation.url).toBe(url);
      expect(parsed.citation.consultedAt).toBe(consultedAt);
      expect(canonicalMetadataProposalInput(value)).toContain(
        JSON.stringify(url),
      );
      expect(bytes(canonicalMetadataProposalInput(value))).toBeLessThan(60000);
      expect(JSON.stringify(value)).toBe(before);
    }
    // Pure V5A URL parsing uses URL semantics; neither this contract nor this test
    // asserts acceptance by frozen catalog_sources SQL or timestamp precision.
    // The server's pre-write representability check may reject publication with 400.
  });
});
