import Link from "next/link";
import type { AggregateWork } from "../../features/catalog/contracts";
import type { Locale } from "../../lib/i18n";
import {
  formatLabels,
  releaseLabels,
  roleLabels,
} from "../../lib/catalog-i18n";
import { WorkCover } from "./WorkCover";
import styles from "./catalog.module.css";
export function WorkCard({
  work,
  locale,
}: {
  work: AggregateWork;
  locale: Locale;
}) {
  return (
    <article className={`feature ${styles.card}`}>
      <WorkCover work={work} locale={locale} />
      <div className={styles.cardBody}>
        <p className={styles.eyebrow}>{formatLabels[locale][work.format]}</p>
        <h2>
          <Link
            href={`/${locale}/works/${encodeURIComponent(work.slug)}`}
            lang={work.displayTitleLanguage}
          >
            {work.displayTitle}
          </Link>
        </h2>
        {work.displayTitle !== work.primaryTitle && (
          <p lang={work.primaryTitleLanguage}>{work.primaryTitle}</p>
        )}
        <p>
          {releaseLabels[locale][work.releaseStatus]}
          {work.publicationYear ? ` · ${work.publicationYear}` : ""}
        </p>
        <ul className={styles.plainList}>
          {work.creators
            .filter((c) => !c.editionId)
            .slice(0, 3)
            .map((c, i) => (
              <li key={i}>
                {c.name} · {roleLabels[locale][c.role]}
              </li>
            ))}
        </ul>
        <div className={styles.tags}>
          {work.genres.map((g) => (
            <span key={g.slug}>{locale === "vi" ? g.nameVi : g.nameEn}</span>
          ))}
        </div>
      </div>
    </article>
  );
}
