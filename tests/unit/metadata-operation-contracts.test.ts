import { describe, it, expect } from "vitest";
import {
  submitMetadataProposalSchema as schema,
  canonicalMetadataProposalInput as canonical,
  reviewMetadataProposalSchema as review,
  MAX_METADATA_CANONICAL_BYTES,
  MAX_METADATA_REVISION,
} from "../../apps/web/src/features/catalog/metadata-operations";
import {
  editSuggestionPatchSchema,
  submitEditSuggestionSchema,
  canonicalSuggestionInput,
} from "../../apps/web/src/features/catalog/edit-suggestions";

const id = "12345678-1234-4234-8234-123456789abc";
const otherId = "22345678-1234-4234-8234-123456789abc";
const citation = { label: "Human source", citation: "Inspected text" };
const rights = {
  basis: "ORIGINAL_SUMMARY",
  originalityAcknowledged: true,
  statement: "My original summary",
};
const operations = [
  {
    type: "TITLE_ADD",
    value: { title: "Tiếng Việt 中文", language: "vi-VN", kind: "ALIAS" },
  },
  {
    type: "TITLE_ADD",
    value: { title: "Secondary", language: "en", kind: "PRIMARY" },
  },
  { type: "TITLE_REPLACE", titleId: id, title: "Replacement" },
  { type: "TITLE_REMOVE", titleId: id, reason: "Incorrect assertion" },
  {
    type: "DESCRIPTION_ADD",
    language: "und",
    text: "Original summary",
    rights,
  },
  {
    type: "DESCRIPTION_REPLACE",
    language: "en-US",
    text: "New summary",
    rights,
  },
  { type: "DESCRIPTION_REMOVE", language: "en-us", reason: "Incorrect" },
  { type: "GENRE_ADD_MEMBERSHIP", slug: "science-fiction" },
  {
    type: "GENRE_REMOVE_MEMBERSHIP",
    slug: "science-fiction",
    reason: "Incorrect classification",
  },
];
function proposal(operation: unknown = operations[0]) {
  return {
    version: 1,
    submitKey: id,
    workId: id,
    baseWorkRevision: 1,
    citation,
    operation,
  };
}
function fails(input: unknown) {
  expect(schema.safeParse(input).success).toBe(false);
}
function title(value: string) {
  return proposal({ type: "TITLE_REPLACE", titleId: id, title: value });
}
function description(text: string) {
  return proposal({ type: "DESCRIPTION_ADD", language: "vi", text, rights });
}

describe("V5A pure metadata operation contracts", () => {
  it("accepts exactly the approved single operations without implying trusted-context approval", () => {
    for (const op of operations)
      expect(schema.safeParse(proposal(op)).success).toBe(true);
    for (const op of [
      null,
      undefined,
      [],
      operations,
      {},
      { type: "BATCH", operations },
      ...[
        "TITLE_SET",
        "ORIGINAL_ADD",
        "WORK_PATCH",
        "CREATOR_ADD",
        "GENRE_CREATE",
        "COVER_SET",
      ].map((type) => ({ type })),
    ])
      fails({ ...proposal(), operation: op });
    fails({ ...proposal(), operations });
    fails(title(""));
    fails(title(null as unknown as string));
    fails(
      proposal({
        type: "TITLE_ADD",
        value: { title: "Original", language: "en", kind: "ORIGINAL" },
      }),
    );
  });
  it("rejects unknown keys and authority/prototype injection at every object boundary", () => {
    for (const key of [
      "actorId",
      "role",
      "ownerUserId",
      "slug",
      "visibility",
      "patch",
      "sourceId",
      "__proto__",
      "constructor",
      "prototype",
    ]) {
      const extra = JSON.parse(`{"${key}":"injected"}`) as Record<
        string,
        unknown
      >;
      fails({ ...proposal(), ...extra });
      fails(proposal({ ...operations[0], ...extra }));
      fails(
        proposal({
          type: "TITLE_ADD",
          value: { title: "Safe", language: "en", kind: "ALIAS", ...extra },
        }),
      );
      fails({ ...proposal(), citation: { ...citation, ...extra } });
      fails(
        proposal({
          type: "DESCRIPTION_ADD",
          language: "en",
          text: "Safe",
          rights: { ...rights, ...extra },
        }),
      );
    }
    for (const op of operations) fails(proposal({ ...op, extra: true }));
  });
  it("enforces exact versions, UUIDs and PostgreSQL integer bounds", () => {
    for (const version of [undefined, null, 0, 2, "1", 1.1])
      fails({ ...proposal(), version });
    for (const field of ["submitKey", "workId"])
      for (const value of [null, "invalid", "", 1])
        fails({ ...proposal(), [field]: value });
    fails(proposal({ type: "TITLE_REMOVE", titleId: "bad", reason: "Reason" }));
    for (const value of [
      0,
      -1,
      1.1,
      MAX_METADATA_REVISION + 1,
      Infinity,
      "1",
      null,
    ])
      fails({ ...proposal(), baseWorkRevision: value });
    expect(
      schema.parse({ ...proposal(), baseWorkRevision: MAX_METADATA_REVISION })
        .baseWorkRevision,
    ).toBe(MAX_METADATA_REVISION);
    expect(
      schema.parse({
        ...proposal(),
        workId: id.toUpperCase(),
        submitKey: id.toUpperCase(),
      }).workId,
    ).toBe(id);
    expect(
      schema.parse(
        proposal({
          type: "TITLE_REPLACE",
          titleId: id.toUpperCase(),
          title: "Safe",
        }),
      ).operation,
    ).toEqual({ type: "TITLE_REPLACE", titleId: id, title: "Safe" });
  });
  it("preserves exact language representation and existing grammar", () => {
    for (const language of [
      "und",
      "en",
      "vie",
      "en-US",
      "en-us",
      "zh-Hant-TW",
      `en-${"a".repeat(8)}-${"b".repeat(8)}-${"c".repeat(8)}-abcde`,
    ])
      expect(
        schema.parse(
          proposal({ type: "DESCRIPTION_REMOVE", language, reason: "Reason" }),
        ).operation,
      ).toEqual({ type: "DESCRIPTION_REMOVE", language, reason: "Reason" });
    for (const language of [
      "EN",
      "e",
      "english",
      "en_US",
      " en",
      "en-a",
      "en-abcdefghi",
      "en-",
      `en-${"aa-".repeat(11)}aa`,
    ])
      fails(
        proposal({ type: "DESCRIPTION_REMOVE", language, reason: "Reason" }),
      );
  });
  it("bounds titles by UTF16 and their nonempty normalized search representation", () => {
    expect(schema.safeParse(title("字".repeat(500))).success).toBe(true);
    fails(title("字".repeat(501)));
    fails(title("😀".repeat(251)));
    fails(title("!!!"));
    // U+FDFA expands to more than 1000 normalized UTF16 units within 500 raw units.
    fails(title("\ufdfa".repeat(100)));
    expect(schema.safeParse(title("\ufdfa".repeat(20))).success).toBe(true);
    expect(schema.parse(title("  Đời e\u0301 中文  ")).operation).toEqual({
      type: "TITLE_REPLACE",
      titleId: id,
      title: "Đời e\u0301 中文",
    });
  });
  it("rejects malformed UTF16, C0/C1 and bidi overrides/isolates before trimming", () => {
    const unsafe = [
      "\ud800",
      "\udfff",
      "\ud800x",
      ...Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)),
      ...Array.from({ length: 33 }, (_, i) => String.fromCharCode(0x7f + i)),
      ...Array.from({ length: 5 }, (_, i) => String.fromCharCode(0x202a + i)),
      ...Array.from({ length: 4 }, (_, i) => String.fromCharCode(0x2066 + i)),
    ];
    for (const char of unsafe) {
      fails(title(`${char}Safe`));
      fails({ ...proposal(), citation: { ...citation, label: `Safe${char}` } });
      if (!["\t", "\n", "\r"].includes(char)) {
        fails(description(`Safe${char}`));
        fails(
          proposal({
            type: "TITLE_REMOVE",
            titleId: id,
            reason: `${char}Safe`,
          }),
        );
        fails({
          ...proposal(),
          citation: { ...citation, citation: `Safe${char}` },
        });
        fails(
          proposal({
            type: "DESCRIPTION_ADD",
            language: "en",
            text: "Safe",
            rights: { ...rights, statement: `Safe${char}` },
          }),
        );
      }
    }
    expect(schema.safeParse(description("中文 😀 Tiếng Việt")).success).toBe(
      true,
    );
  });
  it("rejects Unicode line/paragraph separators only in single-line fields", () => {
    for (const separator of ["\u2028", "\u2029"]) {
      const value = `A${separator}B`;
      fails(title(value));
      fails({ ...proposal(), citation: { ...citation, label: value } });
      fails({
        ...proposal(),
        citation: { ...citation, url: `https://example.org/${value}` },
      });
      expect(schema.parse(description(value)).operation).toMatchObject({
        text: value,
      });
      expect(
        schema.parse({
          ...proposal(),
          citation: { ...citation, citation: value },
        }).citation.citation,
      ).toBe(value);
      expect(
        schema.parse(
          proposal({ type: "TITLE_REMOVE", titleId: id, reason: value }),
        ).operation,
      ).toMatchObject({ reason: value });
      expect(
        schema.parse(
          proposal({
            type: "DESCRIPTION_ADD",
            language: "en",
            text: "Safe",
            rights: { ...rights, statement: value },
          }),
        ).operation,
      ).toMatchObject({ rights: { statement: value } });
    }
  });
  it("normalizes multiline CRLF/CR only, trims ends and never NFC/case/accent folds", () => {
    const raw = "  A\r\nB\rC\tD e\u0301  ";
    const normalized = "A\nB\nC\tD e\u0301";
    const result = schema.parse({
      ...description(raw),
      citation: { label: " Label ", citation: raw },
    });
    expect(result.citation).toEqual({ label: "Label", citation: normalized });
    expect(result.operation).toMatchObject({ text: normalized });
    expect(
      schema.parse(proposal({ type: "TITLE_REMOVE", titleId: id, reason: raw }))
        .operation,
    ).toMatchObject({ reason: normalized });
    expect(
      schema.parse(
        proposal({
          type: "DESCRIPTION_ADD",
          language: "en",
          text: "Safe",
          rights: { ...rights, statement: raw },
        }),
      ).operation,
    ).toMatchObject({ rights: { statement: normalized } });
    expect(canonical(title("é"))).not.toBe(canonical(title("e\u0301")));
    expect(canonical(title("A"))).not.toBe(canonical(title("a")));
  });
  it("enforces original-summary-only attestation, reasons, source and taxonomy bounds", () => {
    for (const badRights of [
      null,
      {},
      { ...rights, basis: "LICENSED" },
      { ...rights, basis: "PUBLIC_DOMAIN" },
      { ...rights, originalityAcknowledged: false },
      { ...rights, originalityAcknowledged: "true" },
      { ...rights, statement: " " },
      { ...rights, statement: "a".repeat(2001) },
      { ...rights, licenseUrl: "https://example.org" },
    ])
      fails(
        proposal({
          type: "DESCRIPTION_ADD",
          language: "en",
          text: "Safe",
          rights: badRights,
        }),
      );
    for (const text of ["", " ", "a".repeat(20001)]) fails(description(text));
    expect(schema.safeParse(description("a".repeat(20000))).success).toBe(true);
    for (const reason of ["", " ", "a".repeat(2001), null])
      fails(proposal({ type: "DESCRIPTION_REMOVE", language: "en", reason }));
    expect(
      schema.safeParse(
        proposal({
          type: "DESCRIPTION_REMOVE",
          language: "en",
          reason: "a".repeat(2000),
        }),
      ).success,
    ).toBe(true);
    for (const [field, max] of [
      ["label", 200],
      ["citation", 4000],
    ] as const) {
      expect(
        schema.safeParse({
          ...proposal(),
          citation: { ...citation, [field]: "a".repeat(max) },
        }).success,
      ).toBe(true);
      for (const value of ["", " ", "a".repeat(max + 1), null])
        fails({ ...proposal(), citation: { ...citation, [field]: value } });
    }
    for (const slug of ["Upper", "a_b", "-a", "a--b", "", "a".repeat(101)])
      fails(proposal({ type: "GENRE_ADD_MEMBERSHIP", slug }));
    expect(
      schema.safeParse(
        proposal({ type: "GENRE_ADD_MEMBERSHIP", slug: "a".repeat(100) }),
      ).success,
    ).toBe(true);
    for (const url of [
      "http://example.org",
      "https://localhost",
      "https://127.0.0.1",
      "https://[::1]",
      "https://user:pass@example.org",
      "https://a.local",
      "javascript:alert(1)",
      "https://example.org/" + "a".repeat(2000),
    ])
      fails({ ...proposal(), citation: { ...citation, url } });
    expect(
      schema.safeParse({
        ...proposal(),
        citation: {
          ...citation,
          url: "https://example.org/source",
          consultedAt: "2026-01-02T03:04:05+07:00",
        },
      }).success,
    ).toBe(true);
    fails({
      ...proposal(),
      citation: { ...citation, consultedAt: "2026-01-02T03:04:05" },
    });
  });
  it("applies new Unicode safety to URL spelling without changing the existing URL policy", () => {
    for (const value of [
      "\u0000",
      "\t",
      "\n",
      "\r",
      "\u007f",
      "\u0085",
      "\u202e",
      "\u2066",
      "\ud800",
      "\udfff",
    ]) {
      fails({
        ...proposal(),
        citation: { ...citation, url: `https://example.org/a${value}b` },
      });
    }
    for (const url of [
      "https://example.org/中文",
      "https://example.test:8443/path",
    ]) {
      expect(
        schema.parse({ ...proposal(), citation: { ...citation, url } }).citation
          .url,
      ).toBe(url);
    }
  });
  it("enforces canonical UTF8 size including JSON escaping without recursive parsing", () => {
    for (const text of [
      "a".repeat(20000),
      "字".repeat(19000),
      "字".repeat(20000),
      "\t".repeat(19998) + "x",
      "😀".repeat(10000),
    ]) {
      const input = description(text);
      const parsed = schema.safeParse(input);
      if (parsed.success)
        expect(
          new TextEncoder().encode(canonical(input)).byteLength,
        ).toBeLessThanOrEqual(MAX_METADATA_CANONICAL_BYTES);
      else expect(() => canonical(input)).toThrow();
    }
    expect(schema.safeParse(description("字".repeat(19000))).success).toBe(
      true,
    );
    fails(description("字".repeat(20000)));
    fails({
      ...description("字".repeat(19000)),
      citation: { ...citation, citation: "字".repeat(4000) },
    });
  });
  it("canonicalizes a fixed whitelist/order, excluding delivery keys but including every semantic field", () => {
    const input = {
      ...description("Summary"),
      citation: {
        ...citation,
        url: "https://example.org",
        consultedAt: "2026-01-01T00:00:00Z",
      },
    };
    const expected = JSON.stringify({
      domain: "TALEATLAS_METADATA_PROPOSAL_V1",
      version: 1,
      workId: id,
      baseWorkRevision: 1,
      operation: {
        type: "DESCRIPTION_ADD",
        language: "vi",
        text: "Summary",
        rights,
      },
      citation: input.citation,
    });
    expect(canonical(input)).toBe(expected);
    const reorder = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reorder)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([key, item]) => [key, reorder(item)]),
            )
          : value;
    for (const op of operations)
      expect(canonical(reorder(proposal(op)))).toBe(canonical(proposal(op)));
    expect(canonical({ ...input, submitKey: otherId })).toBe(expected);
    expect(
      canonical({
        ...input,
        submitKey: id.toUpperCase(),
        workId: id.toUpperCase(),
      }),
    ).toBe(expected);
    for (const changed of [
      { ...input, workId: otherId },
      { ...input, baseWorkRevision: 2 },
      ...["label", "citation", "url", "consultedAt"].map((key) => ({
        ...input,
        citation: {
          ...input.citation,
          [key]:
            key === "url"
              ? "https://example.org/other"
              : key === "consultedAt"
                ? "2026-01-02T00:00:00Z"
                : "Changed",
        },
      })),
      ...[
        {
          type: "DESCRIPTION_REPLACE",
          language: "vi",
          text: "Summary",
          rights,
        },
        { type: "DESCRIPTION_ADD", language: "en", text: "Summary", rights },
        { type: "DESCRIPTION_ADD", language: "vi", text: "Changed", rights },
        {
          type: "DESCRIPTION_ADD",
          language: "vi",
          text: "Summary",
          rights: { ...rights, statement: "Changed" },
        },
      ].map((operation) => ({ ...input, operation })),
    ])
      expect(canonical(changed)).not.toBe(expected);
    for (const [a, b] of [
      [title("A"), title("B")],
      [
        proposal(operations[2]),
        proposal({ ...operations[2], titleId: otherId }),
      ],
      [
        proposal(operations[3]),
        proposal({ ...operations[3], reason: "Changed" }),
      ],
      [
        proposal(operations[7]),
        proposal({ ...operations[7], slug: "fantasy" }),
      ],
      [
        proposal(operations[0]),
        proposal({
          type: "TITLE_ADD",
          value: {
            title: "Tiếng Việt 中文",
            language: "vi-VN",
            kind: "PRIMARY",
          },
        }),
      ],
    ])
      expect(canonical(a)).not.toBe(canonical(b));
    expect(() => canonical({ ...input, version: 2 })).toThrow();
    expect(() => canonical({ ...input, domain: "OTHER" })).toThrow();
  });
  it("requires strict review envelopes and all three literal-true approvals", () => {
    const reject = {
      version: 1,
      suggestionId: id,
      revision: 1,
      baseWorkRevision: 1,
      reason: "Reviewed",
      decision: "REJECT",
    };
    const approve = {
      ...reject,
      decision: "APPROVE",
      metadataReviewAcknowledged: true,
      publicationReviewAcknowledged: true,
      rightsReviewAcknowledged: true,
    };
    expect(review.safeParse(reject).success).toBe(true);
    expect(review.safeParse(approve).success).toBe(true);
    expect(
      review.parse({ ...reject, suggestionId: id.toUpperCase() }).suggestionId,
    ).toBe(id);
    for (const key of [
      "metadataReviewAcknowledged",
      "publicationReviewAcknowledged",
      "rightsReviewAcknowledged",
    ]) {
      for (const value of [undefined, false, "true", 1, null])
        expect(review.safeParse({ ...approve, [key]: value }).success).toBe(
          false,
        );
      expect(review.safeParse({ ...reject, [key]: true }).success).toBe(false);
    }
    for (const extra of [
      { actorId: id },
      { role: "ADMIN" },
      { decision: "PARTIAL" },
      { version: 2 },
      { suggestionId: "bad" },
      { reason: " " },
      { reason: "a".repeat(2001) },
      { reason: "x\u202ey" },
      { revision: 0 },
      { revision: MAX_METADATA_REVISION + 1 },
      { baseWorkRevision: 1.5 },
    ])
      expect(review.safeParse({ ...reject, ...extra }).success).toBe(false);
    for (const key of ["__proto__", "constructor", "prototype"])
      expect(
        review.safeParse({ ...reject, ...JSON.parse(`{"${key}":true}`) })
          .success,
      ).toBe(false);
  });
  it("leaves the legacy six-field schema and canonical wire unchanged", () => {
    for (const op of operations) {
      expect(editSuggestionPatchSchema.safeParse(op).success).toBe(false);
      expect(submitEditSuggestionSchema.safeParse(proposal(op)).success).toBe(
        false,
      );
    }
    const legacy = submitEditSuggestionSchema.parse({
      submitKey: id,
      baseWorkRevision: 1,
      patch: {
        primaryTitle: " A ",
        primaryTitleLanguage: "en-US",
        releaseStatus: "UNKNOWN",
        publicationYear: 2026,
        publicationLabel: "Edition",
        originalLanguage: "vi",
      },
      citation,
    });
    expect(canonicalSuggestionInput(id, legacy)).toBe(
      JSON.stringify({
        workId: id,
        baseWorkRevision: 1,
        patch: {
          primaryTitle: "A",
          primaryTitleLanguage: "en-US",
          releaseStatus: "UNKNOWN",
          publicationYear: 2026,
          publicationLabel: "Edition",
          originalLanguage: "vi",
        },
        citation,
      }),
    );
    expect(
      editSuggestionPatchSchema.safeParse({ operation: operations[0] }).success,
    ).toBe(false);
  });
});
