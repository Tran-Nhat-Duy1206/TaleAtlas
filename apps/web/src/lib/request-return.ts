import type { Locale } from "./i18n";

// This continuation is deliberately restricted to request/library screens, not a
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
    (!value.startsWith(`/${locale}/requests`) &&
      !value.startsWith(`/${locale}/library`)) ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  )
    return fallback;
  try {
    const parsed = new URL(value, "https://taleatlas.example.invalid");
    if (parsed.origin !== "https://taleatlas.example.invalid") return fallback;
    if (value.split(/[?#]/, 1)[0] !== parsed.pathname) return fallback;
    const library = `/${locale}/library`;
    if (
      parsed.pathname === library ||
      parsed.pathname.startsWith(`${library}/`)
    ) {
      const seen = new Set<string>();
      for (const [key] of parsed.searchParams) {
        if (
          !["page", "status", "favorite", "sort"].includes(key) ||
          seen.has(key)
        )
          return fallback;
        seen.add(key);
      }
    }
    const base = `/${locale}/requests`;
    if (
      parsed.pathname !== base &&
      parsed.pathname !== `${base}/new` &&
      parsed.pathname !== `/${locale}/library` &&
      !new RegExp(
        `^/${locale}/library/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
        "i",
      ).test(parsed.pathname) &&
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
