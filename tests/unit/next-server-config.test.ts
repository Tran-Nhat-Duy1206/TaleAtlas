import { describe, expect, it } from "vitest";
import config from "../../apps/web/next.config";

describe("server dependency configuration", () => {
  it("externalizes the Node ORM without excluding workspace schema registration", () => {
    expect(config.serverExternalPackages).toEqual([
      "pino",
      "postgres",
      "nodemailer",
      "drizzle-orm",
    ]);
    expect(config.transpilePackages).toEqual(["@taleatlas/database"]);
  });

  it("keeps token-bearing request logging disabled and retains security headers", async () => {
    expect(config.logging).toEqual({ incomingRequests: false });
    expect(config.poweredByHeader).toBe(false);
    const headers = config.headers;
    expect(headers).toBeTypeOf("function");
    if (!headers) throw new Error("Security header configuration is required");
    const rules = await headers();
    expect(rules).toHaveLength(1);
    expect(rules[0]?.source).toBe("/:path*");
    expect(rules[0]?.headers).toEqual(
      expect.arrayContaining([
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Content-Security-Policy",
          value:
            "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
        },
      ]),
    );
  });
});
