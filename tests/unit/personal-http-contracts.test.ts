import { describe, expect, expectTypeOf, it } from "vitest";
import type { LibraryEntryDetail } from "../../apps/web/src/server/library/service";
import {
  canonicalLibraryCommand,
  libraryPatchSchema,
} from "../../apps/web/src/features/library/contracts";
import {
  personalHttpDetailsSchema,
  personalHttpMutationResponseSchema,
  personalHttpPatchSchema,
  personalHttpEntry,
  type PersonalHttpDetails,
} from "../../apps/web/src/features/library/personal-http-contracts";

const id = "d41e3408-ff4f-4f92-a799-5506f1f79bf1";
const mutationKey = "d41e3408-ff4f-4f92-a799-5506f1f79bf2";
const fence = { revision: 1, mutationKey };
const detail: LibraryEntryDetail = {
  id,
  workId: id,
  status: "WANT_TO_READ",
  favorite: false,
  ratingHalfStars: null,
  notes: "",
  revision: 1,
  archived: false,
  createdAt: null,
  updatedAt: null,
  work: { available: false, id },
  currentSession: null,
  hasCompletedRead: false,
};

describe("V3D private ENTRY HTTP contracts", () => {
  it("projects exactly six fields and leaves optional rating unset", () => {
    const raw = {
      ...detail,
      userId: "PRIVATE",
      mutationKey,
      requestHash: "PRIVATE",
      snapshot: { notes: "PRIVATE" },
    };
    const projected = personalHttpEntry(raw);
    expectTypeOf(projected).toEqualTypeOf<PersonalHttpDetails>();
    expect(projected).toEqual({
      id,
      workId: id,
      revision: 1,
      ratingHalfStars: null,
      notes: "",
      archived: false,
    });
    expect(Object.keys(projected)).toEqual([
      "id",
      "workId",
      "revision",
      "ratingHalfStars",
      "notes",
      "archived",
    ]);
    expect(personalHttpDetailsSchema.parse(projected)).toEqual(projected);
    expect(personalHttpMutationResponseSchema).toBe(personalHttpDetailsSchema);
    expect(raw).toEqual({
      ...detail,
      userId: "PRIVATE",
      mutationKey,
      requestHash: "PRIVATE",
      snapshot: { notes: "PRIVATE" },
    });
  });

  it.each(Array.from({ length: 9 }, (_, i) => i + 2))(
    "accepts explicit rating half-stars %i without inventing a default",
    (ratingHalfStars) => {
      const command = { ...fence, patch: { ratingHalfStars } };
      expect(personalHttpPatchSchema.parse(command)).toEqual(
        libraryPatchSchema.parse(command),
      );
      expect(
        personalHttpDetailsSchema.safeParse({
          ...personalHttpEntry(detail),
          ratingHalfStars,
        }).success,
      ).toBe(true);
    },
  );

  it("preserves explicit null rating, empty-note clearing, Unicode plain text and the4000 boundary", () => {
    for (const patch of [
      { ratingHalfStars: null },
      { notes: "" },
      { notes: " Tiếng Việt 📚\n\tPlain <text> " },
      { notes: "界".repeat(4000) },
    ]) {
      const command = { ...fence, patch };
      expect(personalHttpPatchSchema.parse(command)).toEqual(
        libraryPatchSchema.parse(command),
      );
    }
    expect(
      personalHttpPatchSchema.parse({ ...fence, patch: { notes: "  " } }).patch
        .notes,
    ).toBe("");
    expect(
      personalHttpDetailsSchema.parse({
        ...personalHttpEntry(detail),
        notes: "\n\tPlain ",
      }).notes,
    ).toBe("\n\tPlain ");
    expect(
      personalHttpPatchSchema.safeParse({
        ...fence,
        patch: { notes: "界".repeat(4001) },
      }).success,
    ).toBe(false);
    expect(
      personalHttpPatchSchema.safeParse({ ...fence, patch: { notes: null } })
        .success,
    ).toBe(false);
  });

  it.each([
    0,
    1,
    11,
    2.5,
    "8",
    true,
    {},
    [],
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects invalid or coerced rating %j", (ratingHalfStars) => {
    expect(
      personalHttpPatchSchema.safeParse({
        ...fence,
        patch: { ratingHalfStars },
      }).success,
    ).toBe(false);
  });

  it.each([
    "\u0000",
    "\u0008",
    "\u000b",
    "\u000c",
    "\u001f",
    "\u007f",
    "\u0085",
    "\u009f",
    "\u202a",
    "\u202e",
    "\u2066",
    "\u2069",
  ])("rejects unsafe note controls before trimming", (control) => {
    expect(
      personalHttpPatchSchema.safeParse({
        ...fence,
        patch: { notes: `${control}Plain${control}` },
      }).success,
    ).toBe(false);
    expect(
      personalHttpDetailsSchema.safeParse({
        ...personalHttpEntry(detail),
        notes: control,
      }).success,
    ).toBe(false);
  });

  it("rejects every out-of-scope root/patch field and empty changes", () => {
    for (const key of [
      "status",
      "favorite",
      "chapterNumber",
      "progressNotes",
      "sessionId",
      "rating",
      "stars",
      "ownerId",
      "userId",
      "snapshot",
    ])
      expect(
        personalHttpPatchSchema.safeParse({
          ...fence,
          patch: { [key]: key === "favorite" ? true : "PRIVATE" },
        }).success,
      ).toBe(false);
    for (const key of [
      "acknowledgeReread",
      "userId",
      "ownerId",
      "admin",
      "sessionId",
      "requestHash",
      "snapshot",
      "confirmCompletion",
    ])
      expect(
        personalHttpPatchSchema.safeParse({
          ...fence,
          [key]: true,
          patch: { notes: "plain" },
        }).success,
      ).toBe(false);
    for (const patch of [{}, { notes: undefined }, null, [], "plain"])
      expect(
        personalHttpPatchSchema.safeParse({ ...fence, patch }).success,
      ).toBe(false);
  });

  it("normalizes UUIDs and remains canonically identical to the frozen service command", () => {
    const command = {
      revision: 1,
      mutationKey: mutationKey.toUpperCase(),
      patch: { notes: "  plain  ", ratingHalfStars: 7 },
    };
    const parsed = personalHttpPatchSchema.parse(command);
    expect(parsed).toEqual(libraryPatchSchema.parse(command));
    expect(canonicalLibraryCommand(parsed)).toBe(
      canonicalLibraryCommand(libraryPatchSchema.parse(command)),
    );
    expect(parsed.mutationKey).toBe(mutationKey);
    for (const revision of [0, 10001, 1.5, "1"])
      expect(
        personalHttpPatchSchema.safeParse({ ...command, revision }).success,
      ).toBe(false);
    expect(
      personalHttpPatchSchema.safeParse({ ...command, mutationKey: "bad" })
        .success,
    ).toBe(false);
  });

  it("strictly rejects reading/Work/internal fields and malformed response identities", () => {
    const projected = personalHttpEntry(detail);
    for (const key of [
      "work",
      "status",
      "favorite",
      "currentSession",
      "readingSession",
      "hasCompletedRead",
      "userId",
      "mutationKey",
      "requestHash",
      "snapshot",
      "progressNotes",
    ])
      expect(
        personalHttpDetailsSchema.safeParse({ ...projected, [key]: {} })
          .success,
      ).toBe(false);
    for (const invalid of [
      { ...projected, id: "bad" },
      { ...projected, workId: "bad" },
      { ...projected, revision: 10001 },
      { ...projected, notes: null },
      { ...projected, archived: "false" },
    ])
      expect(personalHttpDetailsSchema.safeParse(invalid).success).toBe(false);
  });
});
