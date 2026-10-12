import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  // Auth callback query strings can contain verification/reset tokens, including in development.
  logging: { incomingRequests: false },
  transpilePackages: ["@taleatlas/database"],
  // Multi-page workflows should not continuously evict/recompile inactive dev routes.
  // This affects development compilation only, not data caching or production behavior.
  onDemandEntries: { maxInactiveAge: 300_000, pagesBufferLength: 32 },
  // Keep the server-only ORM and its subpaths in Node, alongside the SQL driver.
  // Database workspace TypeScript and complete schema registration still transpile.
  serverExternalPackages: ["pino", "postgres", "nodemailer", "drizzle-orm"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
          },
        ],
      },
    ];
  },
};
export default config;
