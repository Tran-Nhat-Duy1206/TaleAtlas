import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { suggestionGuard } from "@/server/catalog/suggestion-guard";
import { listEditSuggestions } from "@/server/catalog/edit-suggestions";
import { adminGetWork } from "@/server/catalog/service";
import { EditSuggestionReview } from "@/components/catalog/EditSuggestionReview";
import { suggestionCopy } from "@/components/catalog/suggestion-ui";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function AdminSuggestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = suggestionCopy[locale],
    h = await suggestionGuard(locale, true);
  if (!h)
    return (
      <section className="auth-page">
        <p role="alert">{t.denied}</p>
      </section>
    );
  const query = await searchParams;
  const n = Number(query.page),
    page = Number.isInteger(n) && n >= 1 && n <= 501 ? n : 1;
  const result = await listEditSuggestions(
    { page, pageSize: 20 },
    h,
    true,
  ).catch(() => null);
  if (!result)
    return (
      <section className="auth-page">
        <p role="alert">{t.unavailable}</p>
      </section>
    );
  const items = await Promise.all(
    result.items.map(async (suggestion) => {
      const work = await adminGetWork(suggestion.workId, h).catch(() => null);
      const current =
        work && "revision" in work && "visibility" in work ? work : null;
      return { suggestion, current };
    }),
  );
  return (
    <section className="auth-page" style={{ width: "100%", maxWidth: "70rem" }}>
      <h1>{t.review}</h1>
      {items.length ? (
        items.map(({ suggestion, current }) => (
          <EditSuggestionReview
            key={`${suggestion.id}:${suggestion.revision}`}
            locale={locale}
            suggestion={suggestion}
            current={current}
          />
        ))
      ) : (
        <p>{t.empty}</p>
      )}
      <nav aria-label={t.page}>
        {page > 1 && (
          <Link href={`/${locale}/admin/edit-suggestions?page=${page - 1}`}>
            {t.previous}
          </Link>
        )}{" "}
        <span>
          {t.page} {page}
        </span>{" "}
        {page * 20 < result.total && page < 501 && (
          <Link href={`/${locale}/admin/edit-suggestions?page=${page + 1}`}>
            {t.next}
          </Link>
        )}
      </nav>
    </section>
  );
}
