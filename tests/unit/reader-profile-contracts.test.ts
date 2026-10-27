import { describe, expect, it } from "vitest";
import {
  boundedReaderProfileText,
  createReaderProfileContracts,
  readerProfileAccountIdSchema,
  readerProfilePlainDataSchema,
  type ReservedHandlePolicy,
} from "../../apps/web/src/features/reader-profile/contracts";

const contracts = createReaderProfileContracts({
  reservedHandles: ["admin"],
  reservedPrefixes: ["staff_"],
});
const createInput = { handle: "Reader_1", displayName: " Reader " };
const snapshotInput = {
  publicId: "AAAAAAAA-AAAA-4AAA-AAAA-AAAAAAAAAAAA",
  ownerAccountId: "AuthProvider|CaseSensitive-ID",
  handle: "Reader_1",
  displayName: " Reader ",
  interests: ["science-fiction"],
  visibility: "PRIVATE",
  revision: 1,
  state: "ACTIVE",
};
const commandCases = [
  ["create", contracts.create, createInput],
  [
    "edit",
    contracts.edit,
    { expectedRevision: 1, patch: { displayName: "Reader" } },
  ],
  [
    "publish",
    contracts.publish,
    { intent: "PUBLISH", expectedRevision: 1, acknowledgePublicProfile: true },
  ],
  ["hide", contracts.hide, { intent: "HIDE", expectedRevision: 1 }],
  ["snapshot", contracts.snapshot, snapshotInput],
] as const;

// Synthetic pure-validation fixtures only; no runtime sessions, DB, or E2E claims.
describe("reader-profile identifiers and required caller policy", () => {
  it.each([
    "AuthProvider|CaseSensitive-ID",
    "CASE",
    "case",
    "  opaque  ",
    "x".repeat(4096),
  ])("preserves opaque account ID %s verbatim", (value) => {
    expect(readerProfileAccountIdSchema.parse(value)).toBe(value);
    expect(contracts.accountId.parse(value)).toBe(value);
    expect(
      contracts.snapshot.parse({ ...snapshotInput, ownerAccountId: value })
        .ownerAccountId,
    ).toBe(value);
  });
  it.each(["", null, undefined, 12])(
    "rejects invalid account ID %j",
    (value) => {
      expect(contracts.accountId.safeParse(value).success).toBe(false);
    },
  );
  it("uses UUIDs only for profile public IDs", () => {
    expect(contracts.publicId.parse(snapshotInput.publicId)).toBe(
      snapshotInput.publicId.toLowerCase(),
    );
    expect(
      contracts.publicId.safeParse(snapshotInput.ownerAccountId).success,
    ).toBe(false);
  });
  it("canonicalizes ASCII handles only after raw validation", () => {
    expect(contracts.handle.parse("ReAdEr_123")).toBe("reader_123");
    expect(contracts.handle.parse("a".repeat(24))).toHaveLength(24);
  });
  it.each([
    "ab",
    "a".repeat(25),
    "1abc",
    "_abc",
    " abc",
    "abc ",
    "a-b",
    "Kelvin",
    "Ｒeader",
    "réader",
    "a\nxx",
    "ADMIN",
    "Staff_member",
  ])("rejects invalid/reserved handle %j", (value) => {
    expect(contracts.handle.safeParse(value).success).toBe(false);
  });
  it.each(["\n", "\r", "\r\n", "\u2028", "\u2029"])(
    "rejects a trailing line terminator in every ASCII key: %j",
    (suffix) => {
      expect(contracts.handle.safeParse(`reader${suffix}`).success).toBe(false);
      expect(contracts.interests.safeParse([`fantasy${suffix}`]).success).toBe(
        false,
      );
      expect(() =>
        createReaderProfileContracts({
          reservedHandles: [`admin${suffix}`],
          reservedPrefixes: [],
        }),
      ).toThrow();
      expect(() =>
        createReaderProfileContracts({
          reservedHandles: [],
          reservedPrefixes: [`staff_${suffix}`],
        }),
      ).toThrow();
    },
  );
  it("matches reserved exact handles and literal prefixes, not substrings", () => {
    expect(contracts.handle.parse("administrator")).toBe("administrator");
    expect(contracts.handle.parse("mystaff_user")).toBe("mystaff_user");
    expect(contracts.handle.safeParse("staff_").success).toBe(false);
  });
  it("snapshots policy without mutating or retaining caller-owned arrays", () => {
    const policy = { reservedHandles: ["admin"], reservedPrefixes: ["staff_"] };
    const original = structuredClone(policy);
    const local = createReaderProfileContracts(policy);
    expect(policy).toEqual(original);
    policy.reservedHandles[0] = "reader";
    policy.reservedPrefixes[0] = "new_";
    expect(local.handle.safeParse("admin").success).toBe(false);
    expect(local.handle.safeParse("staff_reader").success).toBe(false);
    expect(local.handle.parse("reader")).toBe("reader");
    expect(local.handle.parse("new_reader")).toBe("new_reader");
  });
  it.each([
    undefined,
    null,
    {},
    { reservedHandles: [] },
    { reservedHandles: [], reservedPrefixes: [], extra: true },
    ...["Admin", "ab", "a".repeat(25), "a-b", "Kelvin"].map((value) => ({
      reservedHandles: [value],
      reservedPrefixes: [],
    })),
    ...["", "A", "1abc", ".*", "a|b", "a-b", "a".repeat(25)].map((value) => ({
      reservedHandles: [],
      reservedPrefixes: [value],
    })),
    { reservedHandles: new Array(1), reservedPrefixes: [] },
  ])("rejects malformed required policy %j", (policy) => {
    expect(() =>
      createReaderProfileContracts(policy as ReservedHandlePolicy),
    ).toThrow();
  });
  it("accepts explicitly empty policy and frozen readonly configuration", () => {
    const local = createReaderProfileContracts(
      Object.freeze({
        reservedHandles: Object.freeze([]),
        reservedPrefixes: Object.freeze([]),
      }),
    );
    expect(local.handle.parse("ADMIN")).toBe("admin");
  });
});

describe("bounded literal Unicode profile text", () => {
  it("trims and NFC-normalizes without interpreting HTML or URLs", () => {
    expect(contracts.displayName.parse("  Cafe\u0301  ")).toBe("Café");
    const literal = "<script>alert(1)</script> https://example.invalid/";
    expect(contracts.biography.parse(literal)).toBe(literal);
    expect(contracts.biography.parse("\tfirst\r\nsecond\t")).toBe(
      "first\r\nsecond",
    );
  });
  it("counts UTF-16 units including surrogate-pair emoji", () => {
    expect(contracts.displayName.parse("😀".repeat(40))).toHaveLength(80);
    expect(contracts.displayName.safeParse("😀".repeat(40) + "a").success).toBe(
      false,
    );
    expect(contracts.biography.parse("😀".repeat(250))).toHaveLength(500);
    expect(contracts.biography.safeParse("😀".repeat(251)).success).toBe(false);
    expect(contracts.biography.parse("")).toBe("");
    expect(contracts.displayName.safeParse(" ").success).toBe(false);
  });
  it.each([" ".repeat(81), "a".repeat(80) + " ", "e\u0301".repeat(41)])(
    "enforces raw display bounds before trim/NFC %j",
    (value) => {
      expect(contracts.displayName.safeParse(value).success).toBe(false);
    },
  );
  it("enforces raw biography bounds before trim/NFC", () => {
    expect(contracts.biography.safeParse(" ".repeat(501)).success).toBe(false);
    expect(contracts.biography.safeParse("e\u0301".repeat(251)).success).toBe(
      false,
    );
  });
  it("enforces post-NFC growth, not merely raw length", () => {
    // Leading U+0344 decomposes without a preceding base that can recompose.
    // A trailing mark after x would partly compose to U+1E8D, not overflow.
    const display = "\u0344" + "x".repeat(79);
    const biography = "\u0344" + "x".repeat(499);
    expect(display).toHaveLength(80);
    expect(display.normalize("NFC")).toHaveLength(81);
    expect(biography).toHaveLength(500);
    expect(biography.normalize("NFC")).toHaveLength(501);
    expect(contracts.displayName.safeParse(display).success).toBe(false);
    expect(contracts.biography.safeParse(biography).success).toBe(false);
  });
  it("exercises independent raw and normalized UTF-8 byte budgets", () => {
    // Production 4x UTF-16 caps cannot independently fail for valid Unicode.
    const tight = boundedReaderProfileText({
      minUnits: 0,
      maxUnits: 20,
      maxBytes: 4,
      multiline: false,
    });
    expect(tight.parse("😀")).toBe("😀");
    expect(tight.safeParse("😀a").success).toBe(false);
    expect(tight.safeParse("e\u0301  ").success).toBe(false); // Would fit after trim/NFC.
    const growth = boundedReaderProfileText({
      minUnits: 0,
      maxUnits: 20,
      maxBytes: 2,
      multiline: false,
    });
    expect(growth.safeParse("\u0344").success).toBe(false); // 2 raw bytes, 4 NFC bytes.
  });
  it.each([
    { minUnits: -1, maxUnits: 2, maxBytes: 8, multiline: false },
    { minUnits: 3, maxUnits: 2, maxBytes: 8, multiline: false },
    { minUnits: 0, maxUnits: 2.5, maxBytes: 8, multiline: false },
    { minUnits: 0, maxUnits: 2, maxBytes: -1, multiline: false },
    { minUnits: 0, maxUnits: 2, maxBytes: Infinity, multiline: false },
    { minUnits: 0, maxUnits: 2, maxBytes: 8, multiline: "yes" },
  ])("rejects invalid helper configuration %j", (config) => {
    expect(() =>
      boundedReaderProfileText(
        config as Parameters<typeof boundedReaderProfileText>[0],
      ),
    ).toThrow();
  });
  const controls = [
    ...Array.from({ length: 32 }, (_, i) => i),
    ...Array.from({ length: 33 }, (_, i) => 0x7f + i),
    0x061c,
    0x200e,
    0x200f,
    ...Array.from({ length: 5 }, (_, i) => 0x202a + i),
    ...Array.from({ length: 4 }, (_, i) => 0x2066 + i),
  ];
  it.each(controls)("rejects unsafe control U+%s before trim", (code) => {
    const character = String.fromCharCode(code);
    expect(contracts.displayName.safeParse(character + "Reader").success).toBe(
      false,
    );
    expect(contracts.biography.safeParse(character + "bio").success).toBe(
      [9, 10, 13].includes(code),
    );
  });
  it.each(["\ud800", "\udfff", "a\ud800b", "\udc00\ud800"])(
    "rejects unpaired surrogate %j",
    (value) => {
      expect(contracts.displayName.safeParse(value).success).toBe(false);
      expect(contracts.biography.safeParse(value).success).toBe(false);
    },
  );
  it.each(["\n", "\r", "\t", "\u2028", "\u2029"])(
    "forbids display line breaks/control %j",
    (value) => {
      expect(
        contracts.displayName.safeParse("first" + value + "last").success,
      ).toBe(false);
    },
  );
});

describe("strict explicit profile commands and snapshots", () => {
  it("defaults create to private, with no automatic interests", () => {
    expect(contracts.create.parse(createInput)).toEqual({
      handle: "reader_1",
      displayName: "Reader",
      interests: [],
      visibility: "PRIVATE",
    });
    expect(
      contracts.create.safeParse({ ...createInput, visibility: "PUBLIC" })
        .success,
    ).toBe(false);
    expect(contracts.create.safeParse({ handle: "reader" }).success).toBe(
      false,
    );
    expect(contracts.create.safeParse({ displayName: "Reader" }).success).toBe(
      false,
    );
    expect(
      contracts.create.safeParse({ ...createInput, biography: null }).success,
    ).toBe(false);
    expect(
      contracts.create.parse({ ...createInput, biography: "" }).biography,
    ).toBe("");
  });
  it("requires a defined edit patch and allows explicit biography clear", () => {
    for (const patch of [
      {},
      { displayName: undefined },
      { biography: undefined },
      { interests: undefined },
    ])
      expect(
        contracts.edit.safeParse({ expectedRevision: 1, patch }).success,
      ).toBe(false);
    for (const biography of [null, "", "new biography"])
      expect(
        contracts.edit.parse({ expectedRevision: 1, patch: { biography } })
          .patch.biography,
      ).toBe(biography);
    expect(
      contracts.edit.parse({ expectedRevision: 1, patch: { interests: [] } })
        .patch.interests,
    ).toEqual([]);
    expect(
      contracts.edit.safeParse({
        expectedRevision: 1,
        patch: { displayName: null },
      }).success,
    ).toBe(false);
    for (const field of [
      "handle",
      "visibility",
      "ownerAccountId",
      "actorId",
      "revision",
    ])
      expect(
        contracts.edit.safeParse({
          expectedRevision: 1,
          patch: { displayName: "Reader", [field]: "injected" },
        }).success,
      ).toBe(false);
  });
  it("requires separate deliberate public intent and acknowledgement", () => {
    for (const input of [
      { expectedRevision: 1 },
      { intent: "PUBLISH", expectedRevision: 1 },
      {
        intent: "PUBLISH",
        expectedRevision: 1,
        acknowledgePublicProfile: false,
      },
      { intent: "HIDE", expectedRevision: 1, acknowledgePublicProfile: true },
    ])
      expect(contracts.publish.safeParse(input).success).toBe(false);
    expect(contracts.hide.safeParse({ expectedRevision: 1 }).success).toBe(
      false,
    );
    expect(
      contracts.hide.safeParse({ intent: "PUBLISH", expectedRevision: 1 })
        .success,
    ).toBe(false);
  });
  it.each([0, -1, 1.5, 2_147_483_648, "1", null, undefined, NaN, Infinity])(
    "rejects revision %j without coercion",
    (expectedRevision) => {
      expect(contracts.revision.safeParse(expectedRevision).success).toBe(
        false,
      );
      expect(
        contracts.edit.safeParse({
          expectedRevision,
          patch: { biography: null },
        }).success,
      ).toBe(false);
      expect(
        contracts.publish.safeParse({
          intent: "PUBLISH",
          expectedRevision,
          acknowledgePublicProfile: true,
        }).success,
      ).toBe(false);
      expect(
        contracts.hide.safeParse({ intent: "HIDE", expectedRevision }).success,
      ).toBe(false);
      expect(
        contracts.snapshot.safeParse({
          ...snapshotInput,
          revision: expectedRevision,
        }).success,
      ).toBe(false);
    },
  );
  it("accepts inclusive revision bounds", () => {
    expect(contracts.revision.parse(1)).toBe(1);
    expect(contracts.revision.parse(2_147_483_647)).toBe(2_147_483_647);
  });
  // Keep schema objects out of parameterized title data: only scalar case
  // labels belong in reporter names, never a recursive validator structure.
  for (const [name, schema, input] of commandCases) {
    it(`accepts valid strict ${name}`, () => {
      expect(schema.safeParse(input).success).toBe(true);
    });
    it.each([
      "actorId",
      "accountId",
      "ownerId",
      "role",
      "privateNotes",
      "chapterHistory",
      "inferredGenres",
      "enroll",
      "unexpected",
    ])(`rejects injected ${name} field %s`, (field) => {
      expect(schema.safeParse({ ...input, [field]: "private" }).success).toBe(
        false,
      );
    });
  }
  it("requires every snapshot field except biography and omits cleared biography", () => {
    for (const key of Object.keys(snapshotInput)) {
      const input: Record<string, unknown> = { ...snapshotInput };
      delete input[key];
      expect(contracts.snapshot.safeParse(input).success).toBe(false);
    }
    expect(contracts.snapshot.parse(snapshotInput)).not.toHaveProperty(
      "biography",
    );
    expect(
      contracts.snapshot.parse({ ...snapshotInput, biography: "  " }),
    ).not.toHaveProperty("biography");
    expect(
      contracts.snapshot.parse({ ...snapshotInput, biography: " bio " })
        .biography,
    ).toBe("bio");
    expect(
      contracts.snapshot.safeParse({ ...snapshotInput, biography: null })
        .success,
    ).toBe(false);
    for (const visibility of ["PUBLIC", "PRIVATE"])
      for (const state of ["ACTIVE", "REMOVED"])
        expect(
          contracts.snapshot.safeParse({ ...snapshotInput, visibility, state })
            .success,
        ).toBe(true);
    expect(
      contracts.snapshot.safeParse({ ...snapshotInput, visibility: "public" })
        .success,
    ).toBe(false);
    expect(
      contracts.snapshot.safeParse({ ...snapshotInput, state: "DELETED" })
        .success,
    ).toBe(false);
  });
});

describe("explicit format-only genre interests", () => {
  it("does not infer or check taxonomy membership", () => {
    expect(
      contracts.interests.parse(["unknown-synthetic-slug", "123"]),
    ).toEqual(["unknown-synthetic-slug", "123"]);
    expect(contracts.interests.parse(["a", "b", "c", "d", "e"])).toHaveLength(
      5,
    );
    expect(contracts.interests.parse(["a".repeat(100)])).toHaveLength(1);
  });
  it.each(
    [
      null,
      "fantasy",
      ["a", "a"],
      ["a", "b", "c", "d", "e", "f"],
      [""],
      ["Fantasy"],
      [" fantasy"],
      ["science_fiction"],
      ["a--b"],
      ["-a"],
      ["a-"],
      ["é"],
      ["a".repeat(101)],
      [undefined],
      new Array(1),
    ].map((value) => ({ value })),
  )("rejects the complete invalid slug/list case %#", ({ value }) => {
    expect(contracts.interests.safeParse(value).success).toBe(false);
  });
});

describe("pre-Zod plain-data guard", () => {
  for (const [name, schema, input] of commandCases) {
    it(`rejects ${name} accessors before getter execution`, () => {
      let calls = 0;
      const value = { ...input };
      Object.defineProperty(value, "displayName", {
        enumerable: true,
        get() {
          calls++;
          return "Reader";
        },
      });
      expect(schema.safeParse(value).success).toBe(false);
      expect(calls).toBe(0);
    });
  }
  it("guards nested getters, arrays, and policy getters without invoking them", () => {
    let calls = 0;
    const getter = {
      enumerable: true,
      get() {
        calls++;
        return "admin";
      },
    };
    const list = ["fantasy"];
    Object.defineProperty(list, "0", getter);
    expect(contracts.interests.safeParse(list).success).toBe(false);
    const patch = {};
    Object.defineProperty(patch, "displayName", getter);
    expect(
      contracts.edit.safeParse({ expectedRevision: 1, patch }).success,
    ).toBe(false);
    const policy = { reservedPrefixes: [] };
    Object.defineProperty(policy, "reservedHandles", getter);
    expect(() =>
      createReaderProfileContracts(policy as unknown as ReservedHandlePolicy),
    ).toThrow();
    expect(calls).toBe(0);
  });
  it("rejects prototypes, symbols, sparse arrays, cycles, hidden fields, and depth", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    let deep: unknown = {};
    for (let i = 0; i < 14; i++) deep = { nested: deep };
    const customArray = ["a"];
    Object.setPrototypeOf(customArray, { 0: "a", length: 1 });
    class CustomArray extends Array<string> {}
    const symbol = { [Symbol("private")]: "hidden" };
    const hidden = Object.defineProperty({}, "hidden", { value: "secret" });
    const extras = Object.assign(["a"], { extra: "x" });
    for (const value of [
      new Date("2026-01-01"),
      new Map(),
      new Set(),
      Object.create({ inherited: true }),
      customArray,
      new CustomArray("a"),
      new Array(1),
      symbol,
      hidden,
      extras,
      cycle,
      deep,
      NaN,
      Infinity,
      () => 1,
      1n,
    ])
      expect(readerProfilePlainDataSchema.safeParse(value).success).toBe(false);
    for (const [, schema, input] of commandCases)
      expect(
        schema.safeParse(
          Object.assign(Object.create({ inherited: true }), input),
        ).success,
      ).toBe(false);
  });
  it("accepts null-prototype records and repeated acyclic references", () => {
    const shared = { value: "text" };
    expect(
      readerProfilePlainDataSchema.safeParse({ first: shared, second: shared })
        .success,
    ).toBe(true);
    expect(
      contracts.create.safeParse(
        Object.assign(Object.create(null), createInput),
      ).success,
    ).toBe(true);
  });
  it("does not mutate frozen command inputs or caller lists while normalizing", () => {
    const input = Object.freeze({
      ...snapshotInput,
      interests: Object.freeze(["fantasy"]),
      biography: " bio ",
    });
    const output = contracts.snapshot.parse(input);
    expect(input.handle).toBe("Reader_1");
    expect(input.displayName).toBe(" Reader ");
    expect(input.biography).toBe(" bio ");
    expect(input.interests).toEqual(["fantasy"]);
    expect(output).toMatchObject({
      handle: "reader_1",
      displayName: "Reader",
      biography: "bio",
    });
    expect(output.interests).not.toBe(input.interests);
  });
});
