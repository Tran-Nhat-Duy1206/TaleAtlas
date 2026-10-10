import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocale } from "../../../../lib/i18n";
import { formatLabels } from "../../../../lib/catalog-i18n";
import {
  requestDictionary,
  requestStateLabel,
  requestEventLabel,
} from "../../../../lib/request-i18n";
import { getSession } from "../../../../server/session";
import { visibleStoryRequest } from "../../../../server/ingestion/request-public";
import {
  EDITABLE_REQUEST_STATES,
  CANCELLABLE_REQUEST_STATES,
} from "../../../../features/ingestion/contracts";
import { NewRequestForm } from "../../../../components/requests/NewRequestForm";
import { RequestNotice } from "../../../../components/requests/RequestNotice";
import { RequestActions } from "../../../../components/requests/RequestActions";
import { RequestSummaryCard } from "../../../../components/requests/RequestSummaryCard";
import styles from "../../../../components/requests/request.module.css";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return {
    title: requestDictionary(locale).mine,
    robots: { index: false, follow: false },
  };
}
export default async function RequestDetailPage({ params }: Props) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const t = requestDictionary(locale);
  const h = await headers();
  let session;
  try {
    session = await getSession(h);
  } catch {
    return <RequestNotice locale={locale} />;
  }
  if (!session)
    return (
      <RequestNotice
        locale={locale}
        signIn
        returnTo={`/${locale}/requests/${encodeURIComponent(id)}`}
      />
    );
  let visible;
  try {
    visible = await visibleStoryRequest(id, h);
  } catch {
    return <RequestNotice locale={locale} />;
  }
  if (!visible)
    return (
      <section className={styles.module}>
        <p>{t.unavailable}</p>
      </section>
    );
  if (visible.kind === "FOLLOWED")
    return (
      <section className={styles.module}>
        <Link href={`/${locale}/requests`}>{t.mine}</Link>
        <h1>{t.followed}</h1>
        <RequestSummaryCard locale={locale} request={visible.request} actions />
      </section>
    );
  const request = visible.request;
  return (
    <section className={styles.module}>
      <Link href={`/${locale}/requests`}>{t.mine}</Link>
      <h1>{request.details.title}</h1>
      <p>{requestStateLabel(request.state, locale)}</p>
      <p>
        {t.supporters}: {visible.supporterCount}
      </p>
      {visible.work && (
        <Link className="button" href={`/${locale}/works/${visible.work.slug}`}>
          {t.view}
        </Link>
      )}
      <dl className={`feature ${styles.card}`}>
        {Object.entries(request.details).map(([key, value]) => (
          <div key={key}>
            <dt>{key in t ? t[key as keyof typeof t] : t.unknown}</dt>
            <dd>
              {Array.isArray(value)
                ? value.join(" · ")
                : key === "format"
                  ? String(value) in formatLabels[locale]
                    ? formatLabels[locale][
                        String(value) as keyof typeof formatLabels.en
                      ]
                    : t.unknown
                  : String(value)}
            </dd>
          </div>
        ))}
      </dl>
      {EDITABLE_REQUEST_STATES.includes(request.state) && (
        <section>
          <h2>{t.edit}</h2>
          <NewRequestForm
            key={request.revision}
            locale={locale}
            initialDetails={request.details}
            requestId={request.id}
            revision={request.revision}
          />
        </section>
      )}
      {CANCELLABLE_REQUEST_STATES.includes(request.state) && (
        <RequestActions
          locale={locale}
          id={id}
          revision={request.revision}
          cancel
        />
      )}
      <section>
        <h2>{t.history}</h2>
        <ol className={styles.history}>
          {request.events.map((event, index) => (
            <li key={`${event.revision}:${index}`}>
              <strong>{requestEventLabel(event.eventKind, locale)}</strong>
              <p>
                {event.fromState && (
                  <>{requestStateLabel(event.fromState, locale)} → </>
                )}
                {requestStateLabel(event.toState, locale)}
              </p>
              {["MODERATED", "SUMMARY_REVIEWED", "REVIEWED"].includes(
                event.eventKind,
              ) &&
                typeof event.payload.reason === "string" && (
                  <p>{event.payload.reason}</p>
                )}
              <time dateTime={event.createdAt}>
                {new Date(event.createdAt).toLocaleString(locale)}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
