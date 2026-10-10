import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import { isLocale, type Locale } from "../../../../lib/i18n";
import {
  formatLabels,
  releaseLabels,
  roleLabels,
} from "../../../../lib/catalog-i18n";
import { informationalUrlSchema } from "../../../../features/catalog/contracts";
import { getWorkBySlug } from "../../../../server/catalog/service";
import { CatalogError } from "../../../../server/catalog/errors";
import { WorkCover } from "../../../../components/catalog/WorkCover";
import { publicCopy } from "../../../../components/catalog/query";
import styles from "../../../../components/catalog/catalog.module.css";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; slug: string }> };
const publicWork = cache(async (slug: string, locale: Locale) => {
  try {
    return await getWorkBySlug(slug, locale);
  } catch (error) {
    if (error instanceof CatalogError && error.status === 404) notFound();
    throw error;
  }
});
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const work = await publicWork(slug, locale);
  if (!work) notFound();
  const path = `/works/${encodeURIComponent(work.slug)}`;
  const description = work.descriptions.find(
    (d) => d.language === locale,
  )?.text;
  return {
    title: work.displayTitle,
    description: description?.slice(0, 160),
    alternates: {
      canonical: `/${locale}${path}`,
      languages: { en: `/en${path}`, vi: `/vi${path}` },
    },
  };
}
function InformationLink({
  url,
  children,
}: {
  url: string | undefined;
  children: ReactNode;
}) {
  return url && informationalUrlSchema.safeParse(url).success ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
    >
      {children}
    </a>
  ) : null;
}
export default async function WorkPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const work = await publicWork(slug, locale);
  if (!work) notFound();
  const t = publicCopy[locale];
  const titleKind = {
    PRIMARY: t.primary,
    ORIGINAL: t.original,
    ALIAS: t.alias,
  };
  const relations = {
    ADAPTATION_OF: t.adaptation,
    SEQUEL_OF: t.sequel,
    PREQUEL_OF: t.prequel,
    SPIN_OFF_OF: t.spinOff,
    SIDE_STORY_OF: t.sideStory,
    REMAKE_OF: t.remake,
    SHARED_UNIVERSE: t.shared,
    OTHER: t.other,
  };
  const rights = {
    UNKNOWN: t.unknown,
    LICENSED: t.licensed,
    PUBLIC_DOMAIN: t.publicDomain,
    PERMISSION: t.permission,
  };
  return (
    <section className={styles.catalog}>
      <Link href={`/${locale}/works`}>{t.back}</Link>
      <Link href={`/${locale}/works/${encodeURIComponent(work.slug)}/suggest-edit`}>
        {locale === "vi" ? "Đề xuất chỉnh sửa" : "Suggest a correction"}
      </Link>
      <header className={styles.detailHero}>
        <WorkCover work={work} locale={locale} />
        <div>
          <p className={styles.eyebrow}>{formatLabels[locale][work.format]}</p>
          <h1 lang={work.displayTitleLanguage}>{work.displayTitle}</h1>
          {work.displayTitle !== work.primaryTitle && (
            <p lang={work.primaryTitleLanguage}>{work.primaryTitle}</p>
          )}
          <h2>{t.metadata}</h2>
          <dl className={styles.metadata}>
            <dt>{t.format}</dt>
            <dd>{formatLabels[locale][work.format]}</dd>
            <dt>{t.release}</dt>
            <dd>{releaseLabels[locale][work.releaseStatus]}</dd>
            <dt>{t.language}</dt>
            <dd>{work.originalLanguage ?? t.unavailable}</dd>
            <dt>{t.country}</dt>
            <dd>{work.country ?? t.unavailable}</dd>
            <dt>{t.publication}</dt>
            <dd>
              {[work.publicationYear, work.publicationLabel]
                .filter(Boolean)
                .join(" · ") || t.unavailable}
            </dd>
            <dt>{t.primary}</dt>
            <dd lang={work.primaryTitleLanguage}>
              {work.primaryTitle} ({work.primaryTitleLanguage})
            </dd>
          </dl>
        </div>
      </header>
      <div className={styles.detailSections}>
        <section className={`feature ${styles.section}`}>
          <h2>{t.descriptions}</h2>
          {work.descriptions.length ? (
            work.descriptions.map((d) => (
              <div key={d.language}>
                <h3>{d.language}</h3>
                <p lang={d.language} className={styles.prose}>
                  {d.text}
                </p>
              </div>
            ))
          ) : (
            <p>{t.unavailable}</p>
          )}
        </section>
        <section className={`feature ${styles.section}`}>
          <h2>{t.titles}</h2>
          <ul>
            {work.titles.map((title, i) => (
              <li key={i}>
                <span lang={title.language}>{title.title}</span> ·{" "}
                {title.language} · {titleKind[title.kind]}
              </li>
            ))}
          </ul>
        </section>
        <section className={`feature ${styles.section}`}>
          <h2>{t.creators}</h2>
          {work.creators.length ? (
            <ul>
              {work.creators.map((c, i) => (
                <li key={i}>
                  {c.name} · {roleLabels[locale][c.role]} ·{" "}
                  {c.editionId
                    ? `${t.edition}: ${work.editions.find((e) => e.id === c.editionId)?.title ?? work.editions.findIndex((e) => e.id === c.editionId) + 1}`
                    : t.workCredit}
                </li>
              ))}
            </ul>
          ) : (
            <p>{t.unavailable}</p>
          )}
        </section>
        <section className={`feature ${styles.section}`}>
          <h2>{t.genres}</h2>
          <div className={styles.tags}>
            {work.genres.length
              ? work.genres.map((g) => (
                  <Link
                    key={g.slug}
                    href={`/${locale}/works?genre=${encodeURIComponent(g.slug)}`}
                  >
                    {locale === "vi" ? g.nameVi : g.nameEn}
                  </Link>
                ))
              : t.unavailable}
          </div>
        </section>
        <section className={`feature ${styles.section}`}>
          <h2>{t.editions}</h2>
          {work.editions.length ? (
            work.editions.map((e, i) => (
              <article key={e.id ?? i} className={styles.edition}>
                <h3>{e.title ?? `${t.edition} ${i + 1}`}</h3>
                <dl className={styles.metadata}>
                  <dt>{t.language}</dt>
                  <dd>{e.language ?? t.unavailable}</dd>
                  <dt>{t.publisher}</dt>
                  <dd>{e.publisher ?? t.unavailable}</dd>
                  <dt>{t.format}</dt>
                  <dd>{e.format ?? t.unavailable}</dd>
                  <dt>{t.publication}</dt>
                  <dd>
                    {[e.publicationYear, e.publicationLabel]
                      .filter(Boolean)
                      .join(" · ") || t.unavailable}
                  </dd>
                  <dt>{t.isbn}</dt>
                  <dd>{e.isbn ?? t.unavailable}</dd>
                </dl>
              </article>
            ))
          ) : (
            <p>{t.unavailable}</p>
          )}
        </section>
        <section className={`feature ${styles.section}`}>
          <h2>{t.identifiers}</h2>
          {work.identifiers.length ? (
            <ul>
              {work.identifiers.map((id, i) => (
                <li key={i}>
                  {id.namespace}: {id.value}
                </li>
              ))}
            </ul>
          ) : (
            <p>{t.unavailable}</p>
          )}
        </section>
        {work.relations.length > 0 && (
          <section className={`feature ${styles.section}`}>
            <h2>{t.relations}</h2>
            <p>{t.relationNote}</p>
            <ul>
              {work.relations.map((r) => (
                <li key={`${r.toWorkId}:${r.type}`}>
                  {relations[r.type]} ·{" "}
                  <Link
                    href={`/${locale}/works/${encodeURIComponent(r.slug)}`}
                    lang={r.displayTitleLanguage}
                  >
                    {r.displayTitle}
                  </Link>
                  {r.displayTitleLanguage !== locale && (
                    <> ({r.displayTitleLanguage})</>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className={`feature ${styles.section}`}>
          <h2>{t.source}</h2>
          <h3>{work.source.label}</h3>
          <p className={styles.prose}>{work.source.citation}</p>
          {work.source.consultedAt && (
            <p>
              {t.consulted}:{" "}
              <time dateTime={work.source.consultedAt}>
                {work.source.consultedAt}
              </time>
            </p>
          )}
          <InformationLink url={work.source.url}>
            {t.information}
          </InformationLink>
        </section>
        <section className={`feature ${styles.section}`}>
          <h2>{t.coverRights}</h2>
          {work.cover ? (
            <>
              <p>
                {t.rights}: {rights[work.cover.rights]}
              </p>
              {work.cover.credit && <p>{work.cover.credit}</p>}
              {work.cover.rightsStatement && (
                <p className={styles.prose}>{work.cover.rightsStatement}</p>
              )}
              <InformationLink url={work.cover.licenseUrl}>
                {t.license}
              </InformationLink>
            </>
          ) : (
            <p>{t.placeholder}</p>
          )}
        </section>
      </div>
    </section>
  );
}
