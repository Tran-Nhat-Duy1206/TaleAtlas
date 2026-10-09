import Link from "next/link";
import {
  ACTIVE_REQUEST_STATES,
  type RequestSummary,
} from "../../features/ingestion/support";
import type { Locale } from "../../lib/i18n";
import { formatLabels } from "../../lib/catalog-i18n";
import { requestDictionary, requestStateLabel } from "../../lib/request-i18n";
import { RequestActions } from "./RequestActions";
import styles from "./request.module.css";
export function RequestSummaryCard({
  request,
  locale,
  actions = false,
}: {
  request: RequestSummary;
  locale: Locale;
  actions?: boolean;
}) {
  const t = requestDictionary(locale);
  return (
    <article className={`feature ${styles.card}`}>
      <h3>
        <Link href={`/${locale}/requests/${request.id}`}>
          {request.title ?? t.unknown}
        </Link>
      </h3>
      <p>
        {request.format && request.format in formatLabels[locale]
          ? formatLabels[locale][request.format as keyof typeof formatLabels.en]
          : t.unknown}{" "}
        · {requestStateLabel(request.state, locale)}
      </p>
      <p>
        {t.supporters}: {request.supporterCount}
      </p>
      {request.work && (
        <Link href={`/${locale}/works/${request.work.slug}`}>{t.view}</Link>
      )}
      {actions &&
        (request.following ||
          (request.title !== null &&
            ACTIVE_REQUEST_STATES.includes(request.state))) && (
          <RequestActions
            key={`${request.id}:${request.revision}:${request.following}`}
            locale={locale}
            id={request.id}
            following={request.following}
          />
        )}
    </article>
  );
}
