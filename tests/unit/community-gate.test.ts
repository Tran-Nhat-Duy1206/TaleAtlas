import { describe, expect, it } from "vitest";
import { HttpError } from "../../apps/web/src/server/http";
import {
  isCommunityEnabled,
  requireCommunityEnabled,
} from "../../apps/web/src/server/community/gate";
describe("V4 exact opt-in adversarial matrix", () => {
  it.each([
    undefined,
    "false",
    "FALSE",
    "TRUE",
    "1",
    "0",
    " true",
    "true ",
    "true\n",
    "",
    "yes",
    "True",
    "null",
  ])("fails closed for server value %j", (value) => {
    const environment = {
      V4_COMMUNITIES_ENABLED: value,
      NEXT_PUBLIC_V4_COMMUNITIES_ENABLED: "true",
    };
    expect(isCommunityEnabled(environment)).toBe(false);
    expect(() => requireCommunityEnabled(environment)).toThrow(HttpError);
    try {
      requireCommunityEnabled(environment);
    } catch (error) {
      expect(error).toMatchObject({
        status: 404,
        code: "COMMUNITY_UNAVAILABLE",
      });
    }
  });
  it("ignores client-only opt-in even with absent server flag", () => {
    expect(
      isCommunityEnabled({ NEXT_PUBLIC_V4_COMMUNITIES_ENABLED: "true" }),
    ).toBe(false);
  });
});

describe("V4 default-off server gate", () => {
  it("enables only exact server true; invalid/absent/client flags fail closed", () => {
    expect(isCommunityEnabled({ V4_COMMUNITIES_ENABLED: "true" })).toBe(true);
    expect(() =>
      requireCommunityEnabled({ V4_COMMUNITIES_ENABLED: "true" }),
    ).not.toThrow();
    for (const value of [
      undefined,
      "false",
      "TRUE",
      "1",
      " true",
      "true ",
      "",
      "yes",
    ]) {
      const environment = {
        V4_COMMUNITIES_ENABLED: value,
        NEXT_PUBLIC_V4_COMMUNITIES_ENABLED: "true",
      };
      expect(isCommunityEnabled(environment)).toBe(false);
      try {
        requireCommunityEnabled(environment);
        throw new Error("unexpected enablement");
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect(error).toMatchObject({
          status: 404,
          code: "COMMUNITY_UNAVAILABLE",
        });
      }
    }
  });
  it("prevents payload/storage work when used as first service guard", () => {
    let touched = false;
    expect(() => {
      requireCommunityEnabled({});
      touched = true;
    }).toThrow("COMMUNITY_UNAVAILABLE");
    expect(touched).toBe(false);
  });
});
