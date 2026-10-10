import Link from "next/link";
import type { Locale } from "../../lib/i18n";
import type { RequestSummary } from "../../server/ingestion/request-public";
import { requestDictionary } from "../../lib/request-i18n";
import { RequestSummaryCard } from "./RequestSummaryCard";
import styles from "./request.module.css";
export function MissingStoryPrompt({
  locale,
  q,
  format,
  authenticated,
  summaries = [],
  error = false,
}: {
  locale: Locale;
  q: string;
  format?: string;
  authenticated: boolean;
  summaries?: RequestSummary[];
  error?: boolean;
}) {
  if (!q.trim()) return null;
  const t = requestDictionary(locale);
  const params = new URLSearchParams({
    q: q.slice(0, 200),
    format: format ?? "UNKNOWN",
  });
  return (
    <section className={`feature ${styles.card}`}>
      <h2>{t.missing}</h2>
      <Link className="button" href={`/${locale}/requests/new?${params}`}>
        {t.new}
      </Link>
      <p>{t.safe}</p>
      {!authenticated && !error && <p>{t.signIn}</p>}
      {error && <p role="alert">{t.error}</p>}
      {authenticated && summaries.length > 0 && (
        <>
          <h3>{t.reviewed}</h3>
          <div className={styles.list}>
            {summaries.map((request) => (
              <RequestSummaryCard
                key={request.id}
                locale={locale}
                request={request}
                actions
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
