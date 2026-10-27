import { describe, expect, it, vi } from "vitest";
import { createReaderProfileProjector } from "../../apps/web/src/features/reader-profile/projection";

// Synthetic caller facts only: these tests do not authenticate actual sessions.
const policy = {
  reservedHandles: ["reserved_reader"],
  reservedPrefixes: ["staff_"],
};
const project = createReaderProfileProjector(policy);
const ownerAccountId = "Case:AuthOwner/not-a-uuid";
const profile = {
  publicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ownerAccountId,
  handle: "reader_one",
  displayName: "Reader One",
  biography: "I enjoy stories.",
  interests: ["fantasy", "science-fiction"],
  visibility: "PUBLIC",
  revision: 3,
  state: "ACTIVE",
};
const anonymous = {
  viewer: { kind: "ANONYMOUS" },
  blockedByOwner: false,
  blockedByViewer: false,
};
const authenticated = (
  accountId: unknown = ownerAccountId,
  role: unknown = "user",
) => ({
  ...anonymous,
  viewer: { kind: "AUTHENTICATED", accountId, role },
});
const publicDTO = {
  publicId: profile.publicId,
  handle: profile.handle,
  displayName: profile.displayName,
  biography: profile.biography,
  interests: profile.interests,
};
const unavailable = { kind: "UNAVAILABLE" };

function omit(field: string): Record<string, unknown> {
  const result: Record<string, unknown> = { ...profile };
  delete result[field];
  return result;
}

describe("reader profile caller-fact projection", () => {
  it.each(["PRIVATE", "PUBLIC"])(
    "returns exact owner-only fields for an active %s profile",
    (visibility) => {
      expect(project({ ...profile, visibility }, authenticated())).toEqual({
        kind: "OWNER",
        profile: { ...publicDTO, visibility, revision: 3 },
      });
    },
  );

  it.each(["user", "moderator", "admin"])(
    "%s has no ownership override and sees only ordinary public fields",
    (role) => {
      expect(project(profile, authenticated("another-owner", role))).toEqual({
        kind: "PUBLIC",
        profile: publicDTO,
      });
      expect(
        project(
          { ...profile, visibility: "PRIVATE" },
          authenticated("another-owner", role),
        ),
      ).toEqual(unavailable);
    },
  );

  it("allows anonymous public access without claiming logout circumvention prevention", () => {
    expect(project(profile, anonymous)).toEqual({
      kind: "PUBLIC",
      profile: publicDTO,
    });
    expect(project({ ...profile, visibility: "PRIVATE" }, anonymous)).toEqual(
      unavailable,
    );
  });

  it.each([
    ownerAccountId.toLowerCase(),
    ownerAccountId.toUpperCase(),
    ` ${ownerAccountId}`,
  ])("compares opaque owner IDs exactly: %s", (accountId) => {
    expect(project(profile, authenticated(accountId)).kind).toBe("PUBLIC");
    expect(
      project({ ...profile, visibility: "PRIVATE" }, authenticated(accountId)),
    ).toEqual(unavailable);
  });

  it.each([
    [true, false],
    [false, true],
    [true, true],
  ])(
    "fails closed for block flags %s/%s in either direction",
    (blockedByOwner, blockedByViewer) => {
      for (const context of [
        anonymous,
        authenticated(),
        authenticated("other", "admin"),
      ]) {
        expect(
          project(profile, { ...context, blockedByOwner, blockedByViewer }),
        ).toEqual(unavailable);
      }
    },
  );

  it.each([null, { ...profile, state: "REMOVED" }])(
    "returns the same generic unavailable result for absent/removed profiles",
    (source) => {
      for (const context of [
        anonymous,
        authenticated(),
        authenticated("other", "admin"),
      ])
        expect(project(source, context)).toEqual(unavailable);
    },
  );

  it("resolves session infrastructure unavailability before touching any profile", () => {
    const touched = vi.fn(() => {
      throw new Error("SECRET_PROFILE_ERROR");
    });
    const source = new Proxy(
      {},
      { getPrototypeOf: touched, getOwnPropertyDescriptor: touched },
    );
    for (const value of [null, profile, source]) {
      expect(
        project(value, {
          ...anonymous,
          viewer: { kind: "UNAVAILABLE" },
          blockedByOwner: true,
        }),
      ).toEqual({ kind: "SESSION_UNAVAILABLE" });
    }
    expect(touched).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { viewer: { kind: "ANONYMOUS" } },
    { ...anonymous, blockedByOwner: "false" },
    { ...anonymous, blockedByViewer: null },
    { ...anonymous, unexpected: true },
    { ...anonymous, viewer: { kind: "ANONYMOUS", accountId: ownerAccountId } },
    { ...anonymous, viewer: { kind: "UNAVAILABLE", reason: "SECRET" } },
    { ...anonymous, viewer: { kind: "UNKNOWN" } },
    authenticated(ownerAccountId, "superadmin"),
    {
      ...anonymous,
      viewer: { kind: "AUTHENTICATED", accountId: ownerAccountId },
    },
    authenticated(42),
    authenticated(null),
    authenticated(""),
    {
      ...authenticated(),
      viewer: {
        kind: "AUTHENTICATED",
        accountId: ownerAccountId,
        role: "user",
        session: "SECRET",
      },
    },
    Object.create({ ...anonymous }),
  ])("rejects malformed context without exposing a profile: %j", (context) => {
    expect(project(profile, context)).toEqual(unavailable);
  });

  it("rejects context accessors, cycles, and throwing proxies without reading getters", () => {
    const getter = vi.fn(() => "SECRET");
    for (const field of ["viewer", "blockedByOwner", "blockedByViewer"]) {
      const context = { ...anonymous };
      Object.defineProperty(context, field, { get: getter });
      expect(project(profile, context)).toEqual(unavailable);
    }
    const viewer = { kind: "AUTHENTICATED", role: "user" };
    Object.defineProperty(viewer, "accountId", { get: getter });
    expect(project(profile, { ...anonymous, viewer })).toEqual(unavailable);
    const cyclic: Record<string, unknown> = { ...anonymous };
    cyclic.extra = cyclic;
    expect(project(profile, cyclic)).toEqual(unavailable);
    expect(
      project(
        profile,
        new Proxy(
          {},
          {
            getPrototypeOf() {
              throw new Error("SECRET_CONTEXT_ERROR");
            },
          },
        ),
      ),
    ).toEqual(unavailable);
    expect(getter).not.toHaveBeenCalled();
  });
});

describe("reader profile explicit privacy allowlists", () => {
  it("omits all account, session, library, and Work metadata for public and owner DTOs", () => {
    const secrets = {
      email: "NEVER_EMAIL",
      authEmail: "NEVER_AUTH_EMAIL",
      authName: "NEVER_AUTH_NAME",
      image: "NEVER_IMAGE",
      role: "NEVER_ROLE",
      session: "NEVER_SESSION",
      sessionVerification: "NEVER_VERIFICATION",
      createdAt: "NEVER_TIMESTAMP",
      libraryHistory: "NEVER_HISTORY",
      notes: "NEVER_NOTES",
      ratings: "NEVER_RATINGS",
      collections: "NEVER_COLLECTIONS",
      favorites: "NEVER_FAVORITES",
      counts: "NEVER_COUNTS",
      hiddenWork: { title: "NEVER_HIDDEN_WORK_TITLE" },
      auth: {
        email: "NEVER_NESTED_EMAIL",
        name: "NEVER_NESTED_NAME",
        image: "NEVER_NESTED_IMAGE",
      },
    };
    for (const context of [
      anonymous,
      authenticated(),
      authenticated("other", "admin"),
    ]) {
      const result = project({ ...profile, ...secrets }, context);
      expect(["OWNER", "PUBLIC"]).toContain(result.kind);
      if (result.kind !== "PUBLIC" && result.kind !== "OWNER")
        throw new Error("Expected DTO");
      expect(Object.keys(result.profile).sort()).toEqual(
        [
          "publicId",
          "handle",
          "displayName",
          "biography",
          "interests",
          ...(result.kind === "OWNER" ? ["visibility", "revision"] : []),
        ].sort(),
      );
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("NEVER_");
      expect(serialized).not.toContain(ownerAccountId);
      expect(result.profile).not.toHaveProperty("state");
    }
  });

  it("ignores unknown accessor canaries, even nested sensitive objects, without reading them", () => {
    const getter = vi.fn(() => {
      throw new Error("NEVER_GETTER");
    });
    const source = {
      ...profile,
      auth: Object.defineProperty({}, "name", { get: getter }),
    };
    Object.defineProperty(source, "email", { get: getter, enumerable: true });
    Object.defineProperty(source, "libraryHistory", { get: getter });
    expect(project(source, anonymous)).toEqual({
      kind: "PUBLIC",
      profile: publicDTO,
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it("never falls back to auth name/image or inferred library interests", () => {
    expect(
      project(
        {
          ...omit("displayName"),
          auth: { name: "Fallback", image: "Fallback" },
        },
        anonymous,
      ),
    ).toEqual(unavailable);
    expect(
      project(
        { ...omit("interests"), library: [{ genre: "fantasy" }] },
        anonymous,
      ),
    ).toEqual(unavailable);
  });

  it.each([
    "publicId",
    "ownerAccountId",
    "handle",
    "displayName",
    "biography",
    "interests",
    "visibility",
    "revision",
    "state",
  ])("rejects a known %s getter without invoking it", (field) => {
    const getter = vi.fn(() => "SECRET");
    const source = { ...profile };
    Object.defineProperty(source, field, { get: getter });
    expect(project(source, anonymous)).toEqual(unavailable);
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([
    { publicId: "not-a-uuid" },
    { ownerAccountId: 1 },
    { ownerAccountId: "" },
    { displayName: "\ud800" },
    { displayName: "\u202eHidden" },
    { biography: "\udfff" },
    { handle: "reserved_reader" },
    { handle: "staff_reader" },
    { interests: ["Not A Slug"] },
    { interests: Array(6).fill("fantasy") },
    { interests: null },
    { revision: 0 },
    { revision: 2147483648 },
    { visibility: "FRIENDS" },
    { state: "UNKNOWN" },
  ])("fails closed on invalid known snapshot data %j", (patch) => {
    expect(project({ ...profile, ...patch }, anonymous)).toEqual(unavailable);
  });

  it("uses the supplied reserved-handle policy rather than bypassing snapshot validation", () => {
    const custom = createReaderProfileProjector({
      reservedHandles: [profile.handle],
      reservedPrefixes: [],
    });
    expect(custom(profile, anonymous)).toEqual(unavailable);
  });

  it("accepts plain null-prototype rows and contexts but rejects inherited fields and arrays", () => {
    expect(
      project(
        Object.assign(Object.create(null), profile),
        Object.assign(Object.create(null), anonymous),
      ).kind,
    ).toBe("PUBLIC");
    expect(project(Object.create(profile), anonymous)).toEqual(unavailable);
    expect(project(Object.assign([], profile), anonymous)).toEqual(unavailable);
  });

  it("catches descriptor/proxy failures without returning raw errors", () => {
    const source = new Proxy(
      { ...profile },
      {
        getOwnPropertyDescriptor() {
          throw new Error("SECRET_DESCRIPTOR_ERROR");
        },
      },
    );
    expect(project(source, anonymous)).toEqual(unavailable);
    const badInterests = {
      ...profile,
      interests: Object.defineProperty([], "0", {
        get() {
          throw new Error("SECRET_ARRAY_GETTER");
        },
      }),
    };
    expect(project(badInterests, anonymous)).toEqual(unavailable);
  });

  it("omits undefined biography and never aliases input or output across calls", () => {
    for (const context of [anonymous, authenticated()]) {
      const source = {
        ...omit("biography"),
        interests: [...profile.interests],
      };
      const before = JSON.stringify(source);
      const first = project(source, context);
      const second = project(source, context);
      expect(first).toEqual(second);
      expect(first).not.toBe(second);
      if (
        (first.kind !== "PUBLIC" && first.kind !== "OWNER") ||
        (second.kind !== "PUBLIC" && second.kind !== "OWNER")
      )
        throw new Error("Expected DTOs");
      expect(first.profile).not.toHaveProperty("biography");
      expect(first.profile).not.toBe(second.profile);
      expect(first.profile.interests).not.toBe(source.interests);
      expect(first.profile.interests).not.toBe(second.profile.interests);
      expect(JSON.stringify(source)).toBe(before);
      (first.profile.interests as string[]).push("mystery");
      expect(source.interests).toEqual(profile.interests);
      expect(second.profile.interests).toEqual(profile.interests);
      source.interests.push("romance");
      expect(second.profile.interests).toEqual(profile.interests);
    }
    expect(project({ ...profile, biography: undefined }, anonymous)).toEqual({
      kind: "PUBLIC",
      profile: {
        publicId: profile.publicId,
        handle: profile.handle,
        displayName: profile.displayName,
        interests: profile.interests,
      },
    });
  });
});
