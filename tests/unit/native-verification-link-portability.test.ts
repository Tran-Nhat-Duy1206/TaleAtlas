import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sources = [
  "../e2e/catalog.spec.ts",
  "../e2e/ingestion.spec.ts",
  "../e2e/foundation.spec.ts",
  "../e2e/requests.spec.ts",
  "../helpers/verified-browser-account.ts",
] as const;
const approvedLiteral = String.raw`/https?:\/\/127\.0\.0\.1:\d+\/api\/auth\/verify-email[^\s<>]+/`;

for (const file of sources) {
  describe(`actual verification matcher: ${file}`, () => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const matcher = new RegExp(approvedLiteral.slice(1, -1));

    it("contains exactly the approved matcher and retains exact selected-origin assertion", () => {
      expect(source.split(approvedLiteral)).toHaveLength(2);
      expect(source).toContain("expect(new URL(link!).origin).toBe(baseURL)");
    });
    for (const protocol of ["http", "https"] as const) {
      it(`matches only the existing loopback verification shape with ${protocol}`, () => {
        const origin = `${protocol}://127.0.0.1:3110`;
        const link = `${origin}/api/auth/verify-email?token=synthetic-only&callbackURL=%2Fen`;
        expect(`Synthetic mail ${link}\n`.match(matcher)?.[0]).toBe(link);
        expect(new URL(link).origin).toBe(origin);
      });
    }
    for (const invalid of [
      "https://example.invalid:3110/api/auth/verify-email?token=synthetic-only",
      "https://127.0.0.2:3110/api/auth/verify-email?token=synthetic-only",
      "https://127.0.0.1/api/auth/verify-email?token=synthetic-only",
      "https://127.0.0.1:3110/api/auth/other?token=synthetic-only",
      "https://127.0.0.1:3110/api/auth/verify-email ",
    ]) {
      it("rejects changes outside the approved original host/port/path/token shape", () => {
        expect(invalid.match(matcher)).toBeNull();
      });
    }
    it("does not swallow markup or whitespace and does not relax selected origin", () => {
      const origin = "https://127.0.0.1:3110";
      const link = `${origin}/api/auth/verify-email?token=synthetic-only`;
      expect(`${link}<extra>`.match(matcher)?.[0]).toBe(link);
      expect(`${link} extra`.match(matcher)?.[0]).toBe(link);
      expect(new URL(link).origin === "http://127.0.0.1:3110").toBe(false);
      expect(new URL(link).origin === "https://127.0.0.1:3111").toBe(false);
    });
  });
}
