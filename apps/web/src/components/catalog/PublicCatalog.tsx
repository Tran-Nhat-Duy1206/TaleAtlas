import Link from "next/link";
import type { ReactNode } from "react";
import { WORK_FORMATS } from "@taleatlas/database/catalog-types";
import type {
  AggregateWork,
  CatalogPage,
  ParsedCatalogQuery,
} from "../../features/catalog/contracts";
import type { Locale } from "../../lib/i18n";
import { catalogDictionary, formatLabels } from "../../lib/catalog-i18n";
import { WorkCard } from "./WorkCard";
import { catalogPageHref, publicCopy } from "./query";
import styles from "./catalog.module.css";
export function PublicCatalog({
  locale,
  query,
  result,
  requestPrompt,
}: {
  locale: Locale;
  query: ParsedCatalogQuery;
  result: CatalogPage<AggregateWork>;
  requestPrompt?: ReactNode;
}) {
  const t = { ...publicCopy[locale], format: catalogDictionary(locale).format };
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <section className={styles.catalog}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>TALEATLAS</p>
        <h1>{t.title}</h1>
        <p>{t.intro}</p>
      </header>
      <form
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
        <label>
          {t.genre}
          <input
            name="genre"
            maxLength={100}
            pattern="[a-z0-9-]+"
            defaultValue={query.genre ?? ""}
          />
        </label>
        <input type="hidden" name="pageSize" value={query.pageSize} />
        <button className={`button ${styles.button}`} type="submit">
          {t.apply}
        </button>
        <Link className={styles.reset} href={`/${locale}/works`}>
          {t.reset}
        </Link>
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
      ) : (
        <section className={`feature ${styles.empty}`}>
          <h2>{t.empty}</h2>
          <p>{t.emptyText}</p>
        </section>
      )}
      {requestPrompt}
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
    </section>
  );
}
