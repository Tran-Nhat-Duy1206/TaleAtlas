import type { Metadata } from "next";
import { dictionary, type Locale } from "./i18n";
export function privateMetadata(
  locale: Locale,
  route:
    | "login"
    | "register"
    | "forgot-password"
    | "reset-password"
    | "verify-email"
    | "settings",
): Metadata {
  const t = dictionary(locale);
  const title =
    route === "forgot-password"
      ? t.forgotTitle
      : route === "reset-password"
        ? t.resetTitle
        : route === "verify-email"
          ? t.verifyTitle
          : t[route];
  return {
    title,
    robots: { index: false, follow: false },
    alternates: {
      canonical: `/${locale}/${route}`,
      languages: { en: `/en/${route}`, vi: `/vi/${route}` },
    },
  };
}
