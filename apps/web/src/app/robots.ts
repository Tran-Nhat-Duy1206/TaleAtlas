import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/en/admin",
        "/vi/admin",
        "/en/settings",
        "/vi/settings",
        "/en/login",
        "/vi/login",
        "/en/register",
        "/vi/register",
        "/en/forgot-password",
        "/vi/forgot-password",
        "/en/reset-password",
        "/vi/reset-password",
        "/en/verify-email",
        "/vi/verify-email",
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
