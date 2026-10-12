import { describe, expect, it } from "vitest";
import {
  LIBRARY_STATUSES,
  READING_SESSION_STATES,
} from "../../packages/database/src/library-types";
import {
  canonicalLibraryCommand,
  canTransitionSession,
  historyQuerySchema,
  libraryAddSchema,
  libraryPatchSchema,
  libraryQuerySchema,
  libraryRemoveSchema,
  readingProgressSchema,
  readingSessionActionSchema,
} from "../../apps/web/src/features/library/contracts";

const workId = "d41e3408-ff4f-4f92-a799-5506f1f79bf1";
const mutationKey = "d41e3408-ff4f-4f92-a799-5506f1f79bf2";
const sessionId = "d41e3408-ff4f-4f92-a799-5506f1f79bf3";
const fence = { revision: 1, mutationKey };
const complete = { ...fence, action: "COMPLETE", sessionId };
const progress = { ...fence, sessionId };
const commands = [
  ["add", libraryAddSchema, { workId, mutationKey }],
  ["remove", libraryRemoveSchema, { ...fence, confirmRemoval: true }],
  ["patch", libraryPatchSchema, { ...fence, patch: { favorite: false } }],
  [
    "progress",
    readingProgressSchema,
    { ...progress, patch: { chapterNumber: 0 } },
  ],
  ["session", readingSessionActionSchema, complete],
] as const;

describe("V3A strict private library commands", () => {
  it.each(commands)(
    "accepts the bounded %s command",
    (_name, schema, input) => {
      expect(schema.safeParse(input).success).toBe(true);
    },
  );

  it.each([
    ...commands,
    [
      "start read",
      readingSessionActionSchema,
      { ...fence, action: "START_READ" },
    ],
    [
      "start reread",
      readingSessionActionSchema,
      { ...fence, action: "START_REREAD", acknowledgeReread: true },
    ],
    [
      "resume",
      readingSessionActionSchema,
      { ...fence, action: "RESUME", sessionId },
    ],
  ] as const)(
    "normalizes all %s UUIDs before comparison and canonical serialization",
    (_name, schema, input) => {
      const uppercase: Record<string, unknown> = { ...input };
      for (const field of ["mutationKey", "workId", "sessionId"])
        if (typeof uppercase[field] === "string")
          uppercase[field] = uppercase[field].toUpperCase();
      const lowerParsed = schema.parse(input);
      const upperParsed = schema.parse(uppercase);
      expect(upperParsed).toEqual(lowerParsed);
      expect(upperParsed.mutationKey).toBe(mutationKey);
      expect(canonicalLibraryCommand(upperParsed)).toBe(
        canonicalLibraryCommand(lowerParsed),
      );
    },
  );
  it("normalizes progress session/Edition/mutation UUIDs without changing null or omission", () => {
    const lower = readingProgressSchema.parse({
      ...progress,
      patch: { editionId: workId },
    });
    const upper = readingProgressSchema.parse({
      revision: 1,
      mutationKey: mutationKey.toUpperCase(),
      sessionId: sessionId.toUpperCase(),
      patch: { editionId: workId.toUpperCase() },
    });
    expect(upper).toEqual(lower);
    expect(upper.mutationKey).toBe(mutationKey);
    expect(upper.sessionId).toBe(sessionId);
    expect(upper.patch.editionId).toBe(workId);
    expect(canonicalLibraryCommand(upper)).toBe(canonicalLibraryCommand(lower));
    expect(
      readingProgressSchema.parse({ ...progress, patch: { editionId: null } })
        .patch.editionId,
    ).toBeNull();
    expect(
      readingProgressSchema.parse({ ...progress, patch: { chapterNumber: 0 } })
        .patch,
    ).not.toHaveProperty("editionId");
  });

  it.each([
    "userId",
    "user_id",
    "ownerId",
    "ownerUserId",
    "actorId",
    "role",
    "roles",
    "admin",
    "visibility",
    "providerId",
    "entryId",
    "unknown",
    "__proto__",
    "constructor",
    "prototype",
  ])("rejects client identity/privilege/unknown field %s everywhere", (key) => {
    for (const [, schema, input] of commands)
      expect(schema.safeParse({ ...input, [key]: workId }).success).toBe(false);
    for (const schema of [libraryQuerySchema, historyQuerySchema])
      expect(schema.safeParse({ [key]: workId }).success).toBe(false);
    for (const [schema, base, patch] of [
      [libraryPatchSchema, fence, { favorite: false }],
      [readingProgressSchema, progress, { chapterNumber: 0 }],
    ] as const)
      expect(
        schema.safeParse({ ...base, patch: { ...patch, [key]: workId } })
          .success,
      ).toBe(false);
  });

  it.each([0, -1, 10001, 1.5, "1", null, true, Infinity, NaN])(
    "rejects invalid command revision %s",
    (revision) => {
      for (const [, schema, input] of commands)
        expect(schema.safeParse({ ...input, revision }).success).toBe(false);
    },
  );
  it("permits initial add without revision and exact bounded restore revision", () => {
    expect(libraryAddSchema.parse({ workId, mutationKey })).not.toHaveProperty(
      "revision",
    );
    for (const revision of [1, 10000])
      for (const [, schema, input] of commands)
        expect(schema.safeParse({ ...input, revision }).success).toBe(true);
    for (const [, schema, input] of commands.slice(1)) {
      const { revision: _revision, ...withoutRevision } = input as Record<
        string,
        unknown
      >;
      expect(schema.safeParse(withoutRevision).success).toBe(false);
    }
  });
  it.each([undefined, null, "not-a-uuid", "1", 42])(
    "rejects invalid/missing UUID %s",
    (value) => {
      for (const [, schema, input] of commands)
        expect(schema.safeParse({ ...input, mutationKey: value }).success).toBe(
          false,
        );
      expect(
        libraryAddSchema.safeParse({ workId: value, mutationKey }).success,
      ).toBe(false);
      expect(
        readingProgressSchema.safeParse({
          ...progress,
          sessionId: value,
          patch: { chapterNumber: 0 },
        }).success,
      ).toBe(false);
      for (const action of ["RESUME", "COMPLETE"])
        expect(
          readingSessionActionSchema.safeParse({
            ...fence,
            action,
            sessionId: value,
          }).success,
        ).toBe(false);
    },
  );
  it.each([undefined, null, false, "true", "false", 1])(
    "requires literal removal and reread acknowledgment, not %s",
    (acknowledgment) => {
      expect(
        libraryRemoveSchema.safeParse({
          ...fence,
          confirmRemoval: acknowledgment,
        }).success,
      ).toBe(false);
      expect(
        readingSessionActionSchema.safeParse({
          ...fence,
          action: "START_REREAD",
          acknowledgeReread: acknowledgment,
        }).success,
      ).toBe(false);
      if (acknowledgment !== undefined)
        expect(
          libraryPatchSchema.safeParse({
            ...fence,
            acknowledgeReread: acknowledgment,
            patch: { status: "READING" },
          }).success,
        ).toBe(false);
    },
  );

  it("accepts every shared status and literal reread acknowledgment", () => {
    for (const status of LIBRARY_STATUSES)
      expect(
        libraryPatchSchema.parse({
          ...fence,
          acknowledgeReread: true,
          patch: { status },
        }).patch.status,
      ).toBe(status);
    expect(
      readingSessionActionSchema.safeParse({
        ...fence,
        action: "START_REREAD",
        acknowledgeReread: true,
      }).success,
    ).toBe(true);
    expect(
      libraryPatchSchema.safeParse({ ...fence, patch: { status: "ACTIVE" } })
        .success,
    ).toBe(false);
    for (const favorite of ["true", "false", 0, null])
      expect(
        libraryPatchSchema.safeParse({ ...fence, patch: { favorite } }).success,
      ).toBe(false);
  });
  it.each([{}, { notes: undefined }, { chapterNumber: undefined }])(
    "requires an actual nonempty patch %j",
    (patch) => {
      expect(libraryPatchSchema.safeParse({ ...fence, patch }).success).toBe(
        false,
      );
      expect(
        readingProgressSchema.safeParse({ ...progress, patch }).success,
      ).toBe(false);
    },
  );
  it.each([null, 2, 3, 4, 5, 6, 7, 8, 9, 10])(
    "accepts clear/half-star rating %s",
    (ratingHalfStars) => {
      expect(
        libraryPatchSchema.parse({ ...fence, patch: { ratingHalfStars } }).patch
          .ratingHalfStars,
      ).toBe(ratingHalfStars);
    },
  );
  it.each([0, 1, 11, -2, 2.5, "5", NaN, Infinity])(
    "rejects invalid half-star rating %s",
    (ratingHalfStars) => {
      expect(
        libraryPatchSchema.safeParse({ ...fence, patch: { ratingHalfStars } })
          .success,
      ).toBe(false);
    },
  );
  it("distinguishes omitted, null clears, false, zero and empty text", () => {
    const parsed = readingProgressSchema.parse({
      ...progress,
      patch: {
        chapterNumber: 0,
        chapterLabel: null,
        volumeNumber: 0,
        volumeLabel: "  ",
        editionId: null,
        personalChapterTotal: null,
        progressNotes: null,
      },
    });
    expect(parsed.patch).toEqual({
      chapterNumber: 0,
      chapterLabel: null,
      volumeNumber: 0,
      volumeLabel: "",
      editionId: null,
      personalChapterTotal: null,
      progressNotes: null,
    });
    expect(
      readingProgressSchema.parse({
        ...progress,
        patch: { progressNotes: "  " },
      }).patch,
    ).toEqual({ progressNotes: "" });
    expect(
      libraryPatchSchema.parse({
        ...fence,
        patch: { favorite: false, ratingHalfStars: null, notes: "  " },
      }).patch,
    ).toEqual({ favorite: false, ratingHalfStars: null, notes: "" });
    expect(
      libraryPatchSchema.safeParse({ ...fence, patch: { notes: null } })
        .success,
    ).toBe(false);
    expect(
      readingProgressSchema.parse({
        ...progress,
        patch: { chapterNumber: null },
      }).patch,
    ).not.toHaveProperty("editionId");
  });
  it.each([
    ["chapterNumber", 0, 1000000],
    ["volumeNumber", 0, 100000],
    ["personalChapterTotal", 1, 1000000],
  ] as const)("bounds personal %s", (field, minimum, maximum) => {
    for (const value of [null, minimum, maximum])
      expect(
        readingProgressSchema.safeParse({
          ...progress,
          patch: { [field]: value },
        }).success,
      ).toBe(true);
    for (const value of [minimum - 1, maximum + 1, 1.5, "1", true])
      expect(
        readingProgressSchema.safeParse({
          ...progress,
          patch: { [field]: value },
        }).success,
      ).toBe(false);
  });
  it("requires optional Edition to be a UUID, never a global progress fact", () => {
    expect(
      readingProgressSchema.parse({ ...progress, patch: { editionId: workId } })
        .patch.editionId,
    ).toBe(workId);
    expect(
      readingProgressSchema.safeParse({
        ...progress,
        patch: { editionId: "x" },
      }).success,
    ).toBe(false);
    for (const field of [
      "percentage",
      "chapterTotal",
      "globalChapterTotal",
      "communityRating",
      "finishedOn",
      "readingDuration",
      "editionWorkId",
    ])
      expect(
        readingProgressSchema.safeParse({ ...progress, patch: { [field]: 10 } })
          .success,
      ).toBe(false);
  });
});

describe("private plain text", () => {
  const textCases = [
    [libraryPatchSchema, fence, "notes", 4000, true],
    [readingProgressSchema, progress, "progressNotes", 2000, true],
    [readingProgressSchema, progress, "chapterLabel", 200, true],
    [readingProgressSchema, progress, "volumeLabel", 200, true],
    [readingSessionActionSchema, complete, "notes", 2000, false],
  ] as const;
  it.each(textCases)(
    "bounds and trims %s/%s/%s/%s",
    (schema, base, field, max, nested) => {
      const input = (text: string) => ({
        ...base,
        ...(nested ? { patch: { [field]: text } } : { [field]: text }),
      });
      expect(schema.safeParse(input("界".repeat(max))).success).toBe(true);
      expect(schema.safeParse(input("界".repeat(max + 1))).success).toBe(false);
      const parsed = schema.parse(
        input("  Đường về\n日本\t<script>x</script>  "),
      );
      const output = nested ? (parsed as { patch: unknown }).patch : parsed;
      expect(output).toHaveProperty(
        field,
        "Đường về\n日本\t<script>x</script>",
      );
    },
  );
  it.each([
    "\u0000",
    "\u0001",
    "\u0008",
    "\u000B",
    "\u000C",
    "\u001F",
    "\u007F",
    "\u0085",
    "\u009F",
    "\u202E",
    "\u2066",
  ])("rejects unsafe controls even at trim boundaries %j", (control) => {
    for (const [schema, base, field, , nested] of textCases)
      for (const text of [control, `${control}text`, `text${control}`])
        expect(
          schema.safeParse({
            ...base,
            ...(nested ? { patch: { [field]: text } } : { [field]: text }),
          }).success,
        ).toBe(false);
  });
});

describe("explicit personal session actions and Gregorian dates", () => {
  it.each(["START_READ", "START_REREAD", "RESUME", "COMPLETE"])(
    "permits only explicit %s action",
    (action) => {
      const input = {
        ...fence,
        action,
        ...(action === "START_REREAD" ? { acknowledgeReread: true } : {}),
        ...(["RESUME", "COMPLETE"].includes(action) ? { sessionId } : {}),
      };
      expect(readingSessionActionSchema.parse(input)).toEqual(input);
      expect(
        readingSessionActionSchema.safeParse({ ...input, action: "PAUSE" })
          .success,
      ).toBe(false);
      if (["START_READ", "START_REREAD"].includes(action)) {
        expect(
          readingSessionActionSchema.safeParse({ ...input, sessionId }).success,
        ).toBe(false);
        expect(
          readingSessionActionSchema.safeParse({ ...input, finishedOn: null })
            .success,
        ).toBe(false);
      }
    },
  );
  it("never edits dates on RESUME or accepts an implicit reread acknowledgment", () => {
    for (const field of ["startedOn", "finishedOn", "acknowledgeReread"])
      expect(
        readingSessionActionSchema.safeParse({
          ...fence,
          action: "RESUME",
          sessionId,
          [field]: null,
        }).success,
      ).toBe(false);
  });
  it.each([
    "0001-01-01",
    "0004-02-29",
    "0099-12-31",
    "0400-02-29",
    "2000-02-29",
    "2024-02-29",
    "9999-12-31",
    null,
  ])("accepts exact valid/clear Gregorian date %s", (date) => {
    expect(
      readingSessionActionSchema.safeParse({
        ...fence,
        action: "START_READ",
        startedOn: date,
      }).success,
    ).toBe(true);
    for (const field of ["startedOn", "finishedOn"])
      expect(
        readingSessionActionSchema.parse({ ...complete, [field]: date }),
      ).toHaveProperty(field, date);
  });
  it.each([
    "0000-01-01",
    "10000-01-01",
    "0100-02-29",
    "1900-02-29",
    "2023-02-29",
    "2024-04-31",
    "2024-00-01",
    "2024-13-01",
    "2024-01-00",
    "2024-01-32",
    "2024-1-01",
    "24-01-01",
    "2024-01-01T00:00:00Z",
    " 2024-01-01",
    "2024-01-01\n",
    "",
    20240101,
  ])("rejects invalid/non-exact Gregorian date %s", (date) => {
    for (const field of ["startedOn", "finishedOn"])
      expect(
        readingSessionActionSchema.safeParse({ ...complete, [field]: date })
          .success,
      ).toBe(false);
  });
  it.each([
    ["0001-01-01", "9999-12-31", true],
    ["2024-02-29", "2024-02-29", true],
    ["2024-03-01", "2024-02-29", false],
    ["9999-12-31", "0001-01-01", false],
    [null, "0001-01-01", true],
    ["9999-12-31", null, true],
    [null, null, true],
  ])(
    "checks only supplied chronology %s -> %s",
    (startedOn, finishedOn, valid) => {
      expect(
        readingSessionActionSchema.safeParse({
          ...complete,
          startedOn,
          finishedOn,
        }).success,
      ).toBe(valid);
    },
  );
  it("preserves omitted dates rather than inventing historical activity", () => {
    const parsed = readingSessionActionSchema.parse(complete);
    expect(parsed).not.toHaveProperty("startedOn");
    expect(parsed).not.toHaveProperty("finishedOn");
  });
});

describe("bounded owner-only list and history queries", () => {
  it("injects fixed limits, default locale/page/sort without client control", () => {
    expect(libraryQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 50,
      locale: "en",
      sort: "UPDATED_DESC",
    });
    expect(historyQuerySchema.parse({})).toEqual({ locale: "en", limit: 50 });
    for (const schema of [libraryQuerySchema, historyQuerySchema])
      for (const field of ["pageSize", "limit", "offset", "q", "user", "role"])
        expect(schema.safeParse({ [field]: 50 }).success).toBe(false);
  });
  it.each([1, "1", 400, "400"])("accepts bounded page %s", (page) => {
    expect(libraryQuerySchema.parse({ page }).page).toBe(Number(page));
  });
  it.each([0, 401, -1, 1.1, true, null, "", "0", "401", "1.0", "1e2", []])(
    "rejects malformed/unbounded page %s",
    (page) =>
      expect(libraryQuerySchema.safeParse({ page }).success).toBe(false),
  );
  it.each([
    [true, true],
    [false, false],
    ["true", true],
    ["false", false],
  ])("coerces favorite %s safely to %s", (favorite, expected) => {
    expect(libraryQuerySchema.parse({ favorite }).favorite).toBe(expected);
  });
  it.each(["TRUE", "FALSE", "0", "1", "", 0, 1, null, []])(
    "rejects unsafe favorite coercion %s",
    (favorite) =>
      expect(libraryQuerySchema.safeParse({ favorite }).success).toBe(false),
  );
  it("validates status, locale, sort, and exclusive exact timeline bounds", () => {
    for (const locale of ["en", "vi"])
      for (const schema of [libraryQuerySchema, historyQuerySchema])
        expect(schema.parse({ locale }).locale).toBe(locale);
    for (const status of LIBRARY_STATUSES)
      expect(libraryQuerySchema.parse({ status }).status).toBe(status);
    for (const sort of [
      "ADDED_DESC",
      "UPDATED_DESC",
      "TITLE_ASC",
      "RATING_DESC",
    ])
      expect(libraryQuerySchema.parse({ sort }).sort).toBe(sort);
    for (const value of [
      { locale: "fr" },
      { sort: "POPULARITY" },
      { status: "ACTIVE" },
    ])
      expect(libraryQuerySchema.safeParse(value).success).toBe(false);
    for (const [field, max] of [
      ["beforeRevision", 10001],
      ["beforeSequence", 1001],
    ] as const) {
      for (const value of [1, max, String(max)])
        expect(historyQuerySchema.parse({ [field]: value })).toHaveProperty(
          field,
          Number(value),
        );
      for (const value of [0, max + 1, 1.1, "", null, true])
        expect(historyQuerySchema.safeParse({ [field]: value }).success).toBe(
          false,
        );
    }
    expect(
      historyQuerySchema.safeParse({ beforeRevision: 1, beforeSequence: 1 })
        .success,
    ).toBe(false);
    expect(historyQuerySchema.safeParse({ locale: "fr" }).success).toBe(false);
  });
});

describe("pure session transitions and canonical mutation binding", () => {
  it.each(READING_SESSION_STATES)(
    "exhaustively fences transitions from %s",
    (from) => {
      for (const to of READING_SESSION_STATES) {
        const expected =
          from === to ||
          ((from === "ACTIVE" || from === "PAUSED") && from !== to);
        expect(canTransitionSession(from, to)).toBe(expected);
      }
    },
  );
  it("sorts recursively while preserving arrays and parsed normalization", () => {
    const one = libraryPatchSchema.parse({
      ...fence,
      patch: { notes: "  private  ", ratingHalfStars: null, favorite: false },
    });
    const two = libraryPatchSchema.parse({
      patch: { favorite: false, ratingHalfStars: null, notes: "private" },
      mutationKey,
      revision: 1,
    });
    expect(canonicalLibraryCommand(one)).toBe(canonicalLibraryCommand(two));
    expect(canonicalLibraryCommand({ z: { b: 2, a: 1 }, a: [2, 1] })).toBe(
      '{"a":[2,1],"z":{"a":1,"b":2}}',
    );
    expect(canonicalLibraryCommand({ "2": true, "10": false })).toBe(
      '{"10":false,"2":true}',
    );
    expect(canonicalLibraryCommand({ notes: undefined })).toBe("{}");
    expect(canonicalLibraryCommand({ notes: '"\n界' })).toBe(
      JSON.stringify({ notes: '"\n界' }),
    );
  });
  it.each([
    [{ favorite: false }, { favorite: true }],
    [{ ratingHalfStars: null }, {}],
    [{ notes: "" }, {}],
    [{ chapterNumber: 0 }, { chapterNumber: null }],
    [{ notes: "a" }, { notes: "b" }],
    [{ revision: 1 }, { revision: 2 }],
    [{ mutationKey }, { mutationKey: sessionId }],
    [{ a: [1, 2] }, { a: [2, 1] }],
  ])("distinguishes changed canonical payload %j vs %j", (one, two) => {
    expect(canonicalLibraryCommand(one)).not.toBe(canonicalLibraryCommand(two));
  });
  it.each([undefined, NaN, Infinity, 1n, new Date(), new Map(), () => 1])(
    "rejects non-JSON canonical value %s",
    (value) => expect(() => canonicalLibraryCommand(value)).toThrow(TypeError),
  );
  it("bounds recursion/node counts and rejects cycles without rejecting shared objects", () => {
    let deep: unknown = null;
    for (let i = 0; i < 16; i++) deep = { nested: deep };
    expect(() => canonicalLibraryCommand(deep)).not.toThrow();
    expect(() => canonicalLibraryCommand({ nested: deep })).toThrow(TypeError);
    expect(() => canonicalLibraryCommand(Array(10000).fill(0))).toThrow(
      TypeError,
    );
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalLibraryCommand(cyclic)).toThrow(TypeError);
    const shared = { a: 1 };
    expect(canonicalLibraryCommand({ x: shared, y: shared })).toBe(
      '{"x":{"a":1},"y":{"a":1}}',
    );
  });
  it("never invokes getters/toJSON or traverses prototypes, rejecting unsafe keys", () => {
    let invoked = false;
    const accessor = Object.defineProperty({}, "notes", {
      enumerable: true,
      get() {
        invoked = true;
        return "secret";
      },
    });
    expect(() => canonicalLibraryCommand(accessor)).toThrow(TypeError);
    expect(invoked).toBe(false);
    for (const key of ["__proto__", "constructor", "prototype"])
      expect(() =>
        canonicalLibraryCommand(JSON.parse(`{"${key}":{}}`)),
      ).toThrow(TypeError);
    expect(() =>
      canonicalLibraryCommand(Object.create({ secret: "inherited" })),
    ).toThrow(TypeError);
    expect(
      canonicalLibraryCommand(Object.assign(Object.create(null), { a: 1 })),
    ).toBe('{"a":1}');
    expect(() =>
      canonicalLibraryCommand({
        toJSON: () => {
          invoked = true;
        },
      }),
    ).toThrow(TypeError);
    expect(invoked).toBe(false);
    expect(() => canonicalLibraryCommand({ [Symbol("secret")]: 1 })).toThrow(
      TypeError,
    );
    expect(() => canonicalLibraryCommand([undefined])).toThrow(TypeError);
    expect(() => canonicalLibraryCommand(Array(1))).toThrow(TypeError);
    expect(() =>
      canonicalLibraryCommand(Object.assign([1], { extra: 2 })),
    ).toThrow(TypeError);
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
});
