import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getReaderProfileAvailability,
  isReaderProfileOwnerEnabled,
  isReaderProfilePublicEnabled,
} from "../../apps/web/src/server/reader-profile/availability";

const effects = vi.hoisted(() => ({
  auth: vi.fn(),
  session: vi.fn(),
  database: vi.fn(),
  http: vi.fn(),
}));
// These are import-time tripwires, not fabricated signed-session acceptance.
vi.mock("../../apps/web/src/server/auth", () => {
  effects.auth();
  throw new Error("Disabled foundation imported authentication");
});
vi.mock("../../apps/web/src/server/session", () => {
  effects.session();
  throw new Error("Disabled foundation imported sessions");
});
vi.mock("../../apps/web/src/server/database", () => {
  effects.database();
  throw new Error("Disabled foundation imported database access");
});
vi.mock("../../apps/web/src/server/http", () => {
  effects.http();
  throw new Error("Disabled foundation imported HTTP infrastructure");
});
import {
  assertReaderProfilePrincipalCurrent,
  lockReaderProfilePrincipal,
  readReaderProfileFoundationJson,
  readerProfileFoundationJson,
  requireReaderProfilePrincipal,
  type ReaderProfileAuthorityTransaction,
  type ReaderProfilePrincipal,
} from "../../apps/web/src/server/reader-profile/authority";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("reader-profile configuration contracts, not live route enforcement", () => {
  for (const owner of [undefined, "false", "true"])
    for (const publicProfile of [undefined, "false", "true"])
      it(`interprets explicit owner=${owner} public=${publicProfile}`, () => {
        const environment = {
          V6B_PROFILE_OWNER_ENABLED: owner,
          V6B_PROFILE_PUBLIC_ENABLED: publicProfile,
        };
        const expected = {
          owner: owner === "true" && publicProfile !== "true",
          public: owner === "true" && publicProfile === "true",
        };
        if (owner === "true") expected.owner = true;
        expect(getReaderProfileAvailability(environment)).toEqual(expected);
        expect(isReaderProfileOwnerEnabled(environment)).toBe(expected.owner);
        expect(isReaderProfilePublicEnabled(environment)).toBe(expected.public);
      });

  for (const invalid of ["", "TRUE", "False", " true", "true ", "1", "0"])
    for (const key of [
      "V6B_PROFILE_OWNER_ENABLED",
      "V6B_PROFILE_PUBLIC_ENABLED",
    ])
      it(`fails both capabilities closed for ${key}=${JSON.stringify(invalid)}`, () => {
        expect(
          getReaderProfileAvailability({
            V6B_PROFILE_OWNER_ENABLED: "true",
            V6B_PROFILE_PUBLIC_ENABLED: "true",
            [key]: invalid,
          }),
        ).toEqual({ owner: false, public: false });
      });

  it("does not coerce malformed non-string configuration", () => {
    for (const invalid of [true, false, null, 1, {}, []])
      expect(
        getReaderProfileAvailability({
          V6B_PROFILE_OWNER_ENABLED: invalid,
          V6B_PROFILE_PUBLIC_ENABLED: "true",
        } as unknown as Record<string, string>),
      ).toEqual({ owner: false, public: false });
  });

  it("defaults disabled without relying on a browser or V4 flag", () => {
    vi.stubEnv("V6B_PROFILE_OWNER_ENABLED", undefined);
    vi.stubEnv("V6B_PROFILE_PUBLIC_ENABLED", undefined);
    vi.stubEnv("V4_COMMUNITIES_ENABLED", "true");
    expect(getReaderProfileAvailability()).toEqual({
      owner: false,
      public: false,
    });
  });
});

describe("disabled foundation entrypoints, with no routes registered", () => {
  for (const [owner, publicProfile] of [
    [undefined, undefined],
    ["false", "false"],
    ["false", "true"],
    ["true", "TRUE"],
  ])
    it(`short-circuits all IO for owner=${owner} public=${publicProfile}`, async () => {
      vi.stubEnv("V6B_PROFILE_OWNER_ENABLED", owner);
      vi.stubEnv("V6B_PROFILE_PUBLIC_ENABLED", publicProfile);
      const touched = vi.fn(() => {
        throw new Error("Disabled input was inspected");
      });
      const request = new Proxy({}, { get: touched }) as Request;
      const headers = new Proxy({}, { get: touched }) as Headers;
      const execute = vi.fn();
      const tx = { execute } as unknown as ReaderProfileAuthorityTransaction;
      const principal = Object.freeze({}) as ReaderProfilePrincipal;
      const unavailable = { status: 404, code: "PROFILE_UNAVAILABLE" };
      await expect(
        requireReaderProfilePrincipal(headers),
      ).rejects.toMatchObject(unavailable);
      await expect(
        lockReaderProfilePrincipal(tx, principal),
      ).rejects.toMatchObject(unavailable);
      await expect(
        assertReaderProfilePrincipalCurrent(tx, principal),
      ).rejects.toMatchObject(unavailable);
      await expect(
        readReaderProfileFoundationJson(request),
      ).rejects.toMatchObject(unavailable);
      const run = vi.fn();
      const response = await readerProfileFoundationJson(run);
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "PROFILE_UNAVAILABLE" });
      expect(run).not.toHaveBeenCalled();
      expect(touched).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
      for (const effect of Object.values(effects))
        expect(effect).not.toHaveBeenCalled();
    });
});
