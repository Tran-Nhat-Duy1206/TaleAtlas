import Link from "next/link";
import { WorkCard } from "./WorkCard";
import { discoveryCopy } from "../../features/catalog/discovery";
import type { Locale } from "../../lib/i18n";
import type {
  recentlyAdded,
  verifiedReleases,
} from "../../server/catalog/discovery";

type Recent = Awaited<ReturnType<typeof recentlyAdded>>;
type Releases = Awaited<ReturnType<typeof verifiedReleases>>;
export function Discovery({
  locale,
  recent,
  releases,
}: {
  locale: Locale;
  recent?: Recent;
  releases?: Releases;
}) {
  const d = discoveryCopy[locale];
  const result = recent ?? releases!;
  const path = recent ? "recently-added" : "releases";
  return (
    <section>
      <h1>{recent ? d.recent : d.releases}</h1>
      <p>{recent ? d.recentNote : d.releaseNote}</p>
      <nav aria-label={locale === "vi" ? "Khám phá" : "Discovery"}>
        <Link href={`/${locale}/recently-added`}>{d.recent}</Link>
        {" · "}
        <Link href={`/${locale}/releases`}>{d.releases}</Link>
        {" · "}
        <Link href={`/${locale}/works`}>
          {locale === "vi" ? "Danh mục" : "Catalog"}
        </Link>
      </nav>
      {!result.items.length && <p>{d.empty}</p>}
      {recent?.items.map(({ work, addedAt }) => (
        <div key={work.id} data-testid="recent-work">
          <WorkCard work={work} locale={locale} />
          <time dateTime={addedAt}>{addedAt.slice(0, 10)}</time>
        </div>
      ))}
      {releases?.items.map(
        ({ id, work, releaseDate, language, label, source, verifiedAt }) => (
          <article key={id} data-testid="verified-release">
            <WorkCard work={work} locale={locale} />
            <h3>{label}</h3>
            <dl>
              <dt>{d.date}</dt>
              <dd>
                <time dateTime={releaseDate}>{releaseDate}</time>
              </dd>
              <dt>{d.language}</dt>
              <dd>{language}</dd>
              <dt>{d.source}</dt>
              <dd>
                {source.label}: {source.citation}
                {source.url && (
                  <>
                    {" · "}
                    <a href={source.url} rel="nofollow noopener noreferrer">
                      {d.source}
                    </a>
                  </>
                )}
              </dd>
              <dt>{d.verified}</dt>
              <dd>
                <time dateTime={verifiedAt}>{verifiedAt.slice(0, 10)}</time>
              </dd>
            </dl>
          </article>
        ),
      )}
      <nav aria-label={locale === "vi" ? "Phân trang" : "Pagination"}>
        {result.page > 1 && (
          <Link href={`/${locale}/${path}?page=${result.page - 1}`}>
            {d.previous}
          </Link>
        )}{" "}
        {result.page * result.pageSize < result.total && (
          <Link href={`/${locale}/${path}?page=${result.page + 1}`}>
            {d.next}
          </Link>
        )}
      </nav>
    </section>
  );
}
