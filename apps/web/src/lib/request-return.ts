import type { Locale } from "./i18n";

// This continuation is deliberately restricted to request screens, not a
// general redirect target. Absolute/protocol-relative and encoded traversal
// destinations never become sign-in callbacks.
export function requestSignInReturn(
  value: string | null,
  locale: Locale,
): string {
  const fallback = `/${locale}/settings`;
  if (
    !value ||
    value.length > 2000 ||
    !value.startsWith(`/${locale}/requests`) ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  )
    return fallback;
  try {
    const parsed = new URL(value, "https://taleatlas.example.invalid");
    if (parsed.origin !== "https://taleatlas.example.invalid") return fallback;
    const base = `/${locale}/requests`;
    if (
      parsed.pathname !== base &&
      parsed.pathname !== `${base}/new` &&
      !new RegExp(
        `^${base}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
        "i",
      ).test(parsed.pathname)
    )
      return fallback;
    return parsed.pathname + parsed.search;
  } catch {
    return fallback;
  }
}
