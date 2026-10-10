import { describe, expect, it } from "vitest";
import { requestSignInReturn } from "../../apps/web/src/lib/request-return";

describe("bounded same-locale request sign-in continuation", () => {
  it("preserves encoded multilingual title and format", () => {
    const destination = `/vi/requests/new?q=${encodeURIComponent("Đường về nhà")}&format=UNKNOWN`;
    expect(requestSignInReturn(destination, "vi")).toBe(destination);
    expect(requestSignInReturn("/en/requests", "en")).toBe("/en/requests");
  });
  it.each([
    null,
    "https://evil.example/en/requests",
    "//evil.example/en/requests",
    "/vi/requests/new",
    "/en/requests/../../admin",
    "/en/requests/new%2f..%2fadmin",
    "/en/requests\\evil",
    "/en/requests\n/new",
    "/en/requests-other",
    "/en/requests/new/extra",
    "/en/requests/new?q=" + "x".repeat(2000),
  ])("rejects invalid continuation %s", (value) => {
    expect(requestSignInReturn(value, "en")).toBe("/en/settings");
  });
});
