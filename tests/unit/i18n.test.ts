import { describe, expect, it } from "vitest";
import { dictionary, isLocale, locales } from "../../apps/web/src/lib/i18n";

describe("locale routing", () => {
  it("supports exactly the public English and Vietnamese routes", () => {
    expect(locales).toEqual(["en", "vi"]);
    for (const locale of locales) expect(isLocale(locale)).toBe(true);
  });
  it.each([
    "",
    "fr",
    "EN",
    "VI",
    "en-US",
    "vi-VN",
    "../en",
    "en/settings",
    "undefined",
  ])("rejects unsupported or malformed locale %j", (locale) => {
    expect(isLocale(locale)).toBe(false);
  });
});

describe("complete localized interface dictionaries", () => {
  it("provides identical translation keys in both languages", () => {
    expect(Object.keys(dictionary("vi")).sort()).toEqual(
      Object.keys(dictionary("en")).sort(),
    );
  });
  it.each(locales)("has no empty or placeholder strings in %s", (locale) => {
    for (const [key, value] of Object.entries(dictionary(locale))) {
      expect(typeof value, key).toBe("string");
      expect(value.trim().length, key).toBeGreaterThan(0);
      expect(value, key).not.toMatch(/\b(?:TODO|lorem ipsum)\b/i);
    }
  });
  it.each([
    ["en", "Loading…", "Checking your session…"],
    ["vi", "Đang tải…", "Đang kiểm tra phiên đăng nhập…"],
  ] as const)(
    "keeps %s route loading separate from existing auth loading",
    (locale, route, session) => {
      expect(dictionary(locale).routeLoading).toBe(route);
      expect(dictionary(locale).loading).toBe(session);
    },
  );
  it("localizes account actions, validation, and theme controls", () => {
    const en = dictionary("en"),
      vi = dictionary("vi");
    for (const key of [
      "login",
      "register",
      "settings",
      "weak",
      "mismatch",
      "invalidToken",
      "theme",
      "light",
      "dark",
      "system",
      "sessionError",
    ] as const) {
      expect(vi[key], key).not.toBe(en[key]);
    }
  });
});
