import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { suggestionGuard } from "@/server/catalog/suggestion-guard";
import { listEditSuggestions } from "@/server/catalog/edit-suggestions";
import { suggestionCopy } from "@/components/catalog/suggestion-ui";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function MySuggestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = suggestionCopy[locale],
    h = await suggestionGuard(locale);
  if (!h)
    return (
      <section className="auth-page">
        <p role="alert">{t.denied}</p>
      </section>
    );
  const query = await searchParams;
  const n = Number(query.page),
    page = Number.isInteger(n) && n >= 1 && n <= 501 ? n : 1;
  const result = await listEditSuggestions({ page, pageSize: 20 }, h).catch(
    () => null,
  );
  if (!result)
    return (
      <section className="auth-page">
        <p role="alert">{t.unavailable}</p>
      </section>
    );
  return (
    <section className="auth-page">
      <h1>{t.mine}</h1>
      {result.items.length ? (
        <ul>
          {result.items.map((s) => (
            <li key={s.id}>
              <Link href={`/${locale}/edit-suggestions/${s.id}`}>
                {t.heading} · {s.id}
              </Link>
              <p>
                {t.state}: {s.state} · {t.base}: {s.baseWorkRevision}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t.empty}</p>
      )}
      <nav aria-label={t.page}>
        {page > 1 && (
          <Link href={`/${locale}/edit-suggestions?page=${page - 1}`}>
            {t.previous}
          </Link>
        )}{" "}
        <span>
          {t.page} {page}
        </span>{" "}
        {page * 20 < result.total && page < 501 && (
          <Link href={`/${locale}/edit-suggestions?page=${page + 1}`}>
            {t.next}
          </Link>
        )}
      </nav>
    </section>
  );
}
