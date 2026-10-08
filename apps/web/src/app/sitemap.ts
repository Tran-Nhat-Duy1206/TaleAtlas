import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  return ["en", "vi"].map((locale) => ({
    url: `${origin}/${locale}`,
    alternates: { languages: { en: `${origin}/en`, vi: `${origin}/vi` } },
  }));
}
