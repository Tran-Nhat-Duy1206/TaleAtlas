import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { libraryGuard } from "@/server/library/guard";
import { listLibraryEntries } from "@/server/library/service";
import { libraryCopy, statuses } from "@/components/library/copy";
import { libraryPageHref, libraryPageQuery } from "@/components/library/query";
import { LibraryCover } from "@/components/library/LibraryCover";
import styles from "@/components/library/library.module.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Library",
  robots: { index: false, follow: false },
};
export default async function LibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = libraryCopy[locale],
    raw = await searchParams;
  const suffix = new URLSearchParams();
  for (const [key, value] of Object.entries(raw))
    if (typeof value === "string") suffix.set(key, value);
  const destination = `/${locale}/library${suffix.size ? `?${suffix}` : ""}`;
  const h = await libraryGuard(locale, destination);
  if (!h)
    return (
      <section className={styles.library}>
        <h1 className="page-title">{t.title}</h1>
        <p role="alert">{t.accessUnconfirmed}</p>
        <p>{t.accessGuidance}</p>
        <div className={styles.actions}>
          <a className="button" href={destination}>
            {t.retryLoad}
          </a>
        </div>
      </section>
    );
  const query = libraryPageQuery(raw, locale);
  if (!query)
    return (
      <section className={styles.library}>
        <h1 className="page-title">{t.title}</h1>
        <p role="alert">{t.invalid}</p>
        <Link href={`/${locale}/library`}>{t.reset}</Link>
      </section>
    );
  const input = {
    page: query.page,
    locale,
    status: query.status,
    favorite: query.favorite,
    sort: query.sort,
  };
  const result = await listLibraryEntries(input, h).catch(() => null);
  const restrictive =
    query.status !== undefined || query.favorite !== undefined;
  const emptyPage =
    result !== null && result.total > 0 && result.items.length === 0;
  return (
    <section className={styles.library}>
      <h1 className="page-title">{t.title}</h1>
      <p>{t.private}</p>
      <form
        // Uncontrolled selects must rebind when a reset/new server filter commits.
        // Paging alone keeps this key, and EntryControls is a separate form.
        key={JSON.stringify([
          locale,
          query.status ?? "",
          query.favorite ?? "",
          query.sort,
        ])}
        action={`/${locale}/library`}
        method="get"
        className={styles.controls}
      >
        <label>
          {t.status}
          <select name="status" defaultValue={query.status ?? ""}>
            <option value="">{t.all}</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {t.labels[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.favorite}
          <select
            name="favorite"
            defaultValue={
              query.favorite === undefined ? "" : String(query.favorite)
            }
          >
            <option value="">{t.all}</option>
            <option value="true">{t.yes}</option>
            <option value="false">{t.no}</option>
          </select>
        </label>
        <label>
          {t.sort}
          <select name="sort" defaultValue={query.sort}>
            <option value="UPDATED_DESC">{t.updated}</option>
            <option value="ADDED_DESC">{t.added}</option>
            <option value="TITLE_ASC">{t.alphabetical}</option>
            <option value="RATING_DESC">{t.rating}</option>
          </select>
        </label>
        <button className="button primary">{t.apply}</button>
        {/* Native navigation also clears unsent selections when the URL is already bare. */}
        <a href={`/${locale}/library`}>{t.reset}</a>
      </form>
      {!result ? (
        <>
          <p role="alert">{t.loadError}</p>
          <div className={styles.actions}>
            <a
              className="button"
              href={libraryPageHref(locale, query, query.page)}
            >
              {t.retryLoad}
            </a>
          </div>
        </>
      ) : (
        <>
          {!result.items.length && (
            <section
              className={styles.card}
              aria-labelledby="library-empty-heading"
            >
              <h2 id="library-empty-heading">
                {emptyPage
                  ? t.emptyPage
                  : restrictive
                    ? t.empty
                    : t.emptyLibrary}
              </h2>
              {!emptyPage && !restrictive && <p>{t.emptyLibraryText}</p>}
              <div className={styles.actions}>
                {emptyPage ? (
                  <a
                    className="button"
                    href={libraryPageHref(locale, query, 1)}
                  >
                    {t.firstPage}
                  </a>
                ) : restrictive ? (
                  <a className="button" href={`/${locale}/library`}>
                    {t.showFullLibrary}
                  </a>
                ) : (
                  <a className="button" href={`/${locale}/works`}>
                    {t.browseCatalog}
                  </a>
                )}
              </div>
            </section>
          )}
          <ul className={styles.list}>
            {result.items.map((entry) => (
              <li key={entry.id} className={styles.card}>
                {entry.work.available && (
                  <div className={styles.cover}>
                    <LibraryCover work={entry.work} locale={locale} />
                  </div>
                )}
                <h2>
                  <Link href={`/${locale}/library/${entry.id}`}>
                    {entry.work.available
                      ? entry.work.displayTitle
                      : t.unavailable}
                  </Link>
                </h2>
                <p>
                  {t.labels[entry.status]}
                  {entry.favorite ? ` · ${t.favorite}` : ""}
                </p>
                <Link href={`/${locale}/library/${entry.id}`}>{t.detail}</Link>
                {entry.work.available && (
                  <Link
                    href={`/${locale}/works/${encodeURIComponent(entry.work.slug)}`}
                  >
                    {t.catalog}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <nav className={styles.actions} aria-label={t.page}>
            {query.page > 1 && (
              <Link href={libraryPageHref(locale, query, query.page - 1)}>
                {t.previous}
              </Link>
            )}
            <span>
              {t.page} {result.page} · 50 / {t.page.toLowerCase()}
            </span>
            {result.hasNext && query.page < 400 && (
              <Link href={libraryPageHref(locale, query, query.page + 1)}>
                {t.next}
              </Link>
            )}
          </nav>
        </>
      )}
    </section>
  );
}
