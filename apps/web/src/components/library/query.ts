import { libraryQuerySchema } from "@/features/library/contracts";
import type { Locale } from "@/lib/i18n";
export function libraryPageQuery(
  params: Record<string, string | string[] | undefined>,
  locale: Locale,
) {
  if (
    Object.entries(params).some(
      ([key, value]) =>
        !["page", "status", "favorite", "sort"].includes(key) ||
        Array.isArray(value),
    )
  )
    return null;
  const fields = { ...params };
  if (fields.status === "") delete fields.status;
  if (fields.favorite === "") delete fields.favorite;
  const parsed = libraryQuerySchema.safeParse({ ...fields, locale });
  return parsed.success ? parsed.data : null;
}
export function libraryPageHref(
  locale: Locale,
  query: { status?: string; favorite?: boolean; sort: string },
  page: number,
) {
  const search = new URLSearchParams({ page: String(page), sort: query.sort });
  if (query.status) search.set("status", query.status);
  if (query.favorite !== undefined)
    search.set("favorite", String(query.favorite));
  return `/${locale}/library?${search}`;
}
