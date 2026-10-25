import Link from "next/link";
import type { ReactNode } from "react";
import {
  RELEASE_STATUSES,
  WORK_FORMATS,
} from "@taleatlas/database/catalog-types";
import type {
  AggregateWork,
  CatalogPage,
  ParsedCatalogQuery,
  PublicGenreOptions,
} from "../../features/catalog/contracts";
import type { Locale } from "../../lib/i18n";
import {
  catalogDictionary,
  formatLabels,
  releaseLabels,
} from "../../lib/catalog-i18n";
import { catalogDiscoveryCopy } from "../../lib/catalog-discovery-i18n";
import { requestDictionary } from "../../lib/request-i18n";
import { WorkCard } from "./WorkCard";
import { catalogPageHref, publicCopy } from "./query";
import styles from "./catalog.module.css";
export function PublicCatalog({
  locale,
  query,
  result,
  genreOptions,
  invalidQuery,
  requestPrompt,
}: {
  locale: Locale;
  query: ParsedCatalogQuery;
  result: CatalogPage<AggregateWork>;
  genreOptions: PublicGenreOptions;
  invalidQuery?: boolean;
  requestPrompt?: ReactNode;
}) {
  const t = { ...publicCopy[locale], format: catalogDictionary(locale).format };
  const discovery = catalogDiscoveryCopy[locale];
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const emptyPage = result.total > 0 && result.items.length === 0;
  const restrictive = Boolean(
    query.q.trim() ||
    query.format ||
    query.genre ||
    query.originalLanguage ||
    query.releaseStatus,
  );
  const missingGenre =
    query.genre &&
    !genreOptions.items.some((item) => item.slug === query.genre);
  return (
    <section className={styles.catalog}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>TALEATLAS</p>
        <h1>{t.title}</h1>
        <p>{t.intro}</p>
      </header>
      {invalidQuery && (
        <p role="note" className={styles.notice}>
          {discovery.invalidQuery}
        </p>
      )}
      {/* Rebind committed visible filters, not pagination or result changes. */}
      <form
        key={JSON.stringify([
          locale,
          query.q,
          query.format ?? "",
          query.genre ?? "",
          query.originalLanguage ?? "",
          query.releaseStatus ?? "",
        ])}
        action={`/${locale}/works`}
        method="get"
        className={`feature ${styles.filters}`}
      >
        <label className={styles.search}>
          {t.search}
          <input
            type="search"
            name="q"
            maxLength={200}
            defaultValue={query.q}
          />
        </label>
        <label>
          {t.format}
          <select name="format" defaultValue={query.format ?? ""}>
            <option value="">{t.all}</option>
            {WORK_FORMATS.map((f) => (
              <option key={f} value={f}>
                {formatLabels[locale][f]}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.field}>
          <label htmlFor="catalog-genre">{discovery.genre}</label>
          {genreOptions.overflow ? (
            <>
              <select
                id="catalog-genre"
                disabled
                defaultValue={query.genre ?? ""}
                aria-describedby="catalog-genre-capacity"
              >
                <option value={query.genre ?? ""}>
                  {query.genre
                    ? discovery.selectedGenre(query.genre)
                    : discovery.genresUnavailable}
                </option>
              </select>
              <input type="hidden" name="genre" value={query.genre ?? ""} />
            </>
          ) : (
            <select
              id="catalog-genre"
              name="genre"
              defaultValue={query.genre ?? ""}
            >
              <option value="">{discovery.allGenres}</option>
              {missingGenre && query.genre && (
                <option value={query.genre}>
                  {discovery.selectedGenre(query.genre)}
                </option>
              )}
              {genreOptions.items.map((genre) => (
                <option key={genre.slug} value={genre.slug}>
                  {locale === "vi" ? genre.nameVi : genre.nameEn}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className={styles.field}>
          <label htmlFor="catalog-original-language">
            {discovery.originalLanguage}
          </label>
          <input
            id="catalog-original-language"
            name="originalLanguage"
            type="text"
            maxLength={63}
            pattern="[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*"
            defaultValue={query.originalLanguage ?? ""}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby="catalog-original-language-help"
          />
        </div>
        <label>
          {discovery.releaseStatus}
          <select name="releaseStatus" defaultValue={query.releaseStatus ?? ""}>
            <option value="">{discovery.allStatuses}</option>
            {RELEASE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {releaseLabels[locale][status]}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="pageSize" value={query.pageSize} />
        <button className={`button ${styles.button}`} type="submit">
          {t.apply}
        </button>
        <a className={styles.reset} href={`/${locale}/works`}>
          {t.reset}
        </a>
        {/* Keep descriptions out of bottom-aligned control wrappers. */}
        <div className={styles.filterHelp}>
          <p id="catalog-original-language-help" className={styles.helper}>
            {discovery.originalLanguageHelp}
          </p>
          {genreOptions.overflow && (
            <p id="catalog-genre-capacity" className={styles.helper}>
              {discovery.genreCapacity}
            </p>
          )}
        </div>
      </form>
      <p role="status">
        {new Intl.NumberFormat(locale).format(result.total)} {t.results}
      </p>
      {result.items.length ? (
        <div className={styles.grid}>
          {result.items.map((work) => (
            <WorkCard key={work.id} work={work} locale={locale} />
          ))}
        </div>
      ) : emptyPage ? (
        <section className={`feature ${styles.empty}`}>
          <h2>{discovery.emptyPage}</h2>
          <p>{discovery.emptyPageText}</p>
          <Link
            className={`button ${styles.button}`}
            href={catalogPageHref(locale, query, 1)}
          >
            {discovery.firstPage}
          </Link>
        </section>
      ) : (
        <section
          className={`feature ${styles.empty}`}
          aria-labelledby="catalog-empty-heading"
        >
          <h2 id="catalog-empty-heading">
            {restrictive ? t.empty : t.catalogEmpty}
          </h2>
          <p>{restrictive ? t.emptyText : t.catalogEmptyText}</p>
          <div className={styles.pagination}>
            {restrictive && (
              <a
                className={`button ${styles.button}`}
                href={`/${locale}/works`}
              >
                {t.browseAll}
              </a>
            )}
            {/* Filtered searches retain the existing guarded request prompt below. */}
            {!restrictive && (
              <Link
                className={`button ${styles.button}`}
                href={`/${locale}/requests/new`}
              >
                {requestDictionary(locale).new}
              </Link>
            )}
          </div>
        </section>
      )}
      {requestPrompt}
      {!emptyPage && result.page <= pages && (
        <nav className={styles.pagination} aria-label={t.page}>
          {result.page > 1 && (
            <Link
              className={`button ${styles.button}`}
              href={catalogPageHref(locale, query, result.page - 1)}
            >
              {t.previous}
            </Link>
          )}
          <span>
            {t.page} {result.page} / {pages}
          </span>
          {result.page < pages && result.page * result.pageSize <= 10000 && (
            <Link
              className={`button ${styles.button}`}
              href={catalogPageHref(locale, query, result.page + 1)}
            >
              {t.next}
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
