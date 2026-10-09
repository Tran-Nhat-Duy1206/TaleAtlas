import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocale } from "../../../lib/i18n";
import {
  requestDictionary,
  requestStateLabel,
} from "../../../lib/request-i18n";
import { getSession } from "../../../server/session";
import { myStoryRequests } from "../../../server/ingestion/service";
import { myFollowedStoryRequests } from "../../../server/ingestion/request-public";
import { RequestNotice } from "../../../components/requests/RequestNotice";
import { RequestSummaryCard } from "../../../components/requests/RequestSummaryCard";
import styles from "../../../components/requests/request.module.css";
export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: string | string[];
    followedPage?: string | string[];
  }>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return {
    title: requestDictionary(locale).mine,
    robots: { index: false, follow: false },
  };
}
function pageNumber(value: string | string[] | undefined) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
}
export default async function MyRequestsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = requestDictionary(locale);
  const query = await searchParams;
  const page = pageNumber(query.page);
  const followedPage = pageNumber(query.followedPage);
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
        returnTo={`/${locale}/requests?page=${page}&followedPage=${followedPage}`}
      />
    );
  const [owned, followed] = await Promise.all([
    myStoryRequests({ page, pageSize: 20 }, h).catch(() => null),
    myFollowedStoryRequests({ page: followedPage, pageSize: 20 }, h).catch(
      () => null,
    ),
  ]);
  function pagination(
    current: number,
    total: number,
    kind: "page" | "followedPage",
  ) {
    const pages = Math.max(1, Math.ceil(total / 20));
    function href(n: number) {
      return `/${locale}/requests?page=${kind === "page" ? n : page}&followedPage=${kind === "followedPage" ? n : followedPage}`;
    }
    return (
      <nav
        className={styles.actions}
        aria-label={`${kind === "page" ? t.owned : t.followed}: ${t.page}`}
      >
        {current > 1 && <Link href={href(current - 1)}>{t.previous}</Link>}
        <span>
          {t.page} {current} / {pages}
        </span>
        {current < pages && current < 1000 && (
          <Link href={href(current + 1)}>{t.next}</Link>
        )}
      </nav>
    );
  }
  return (
    <section className={styles.module}>
      <h1>{t.mine}</h1>
      <Link className="button" href={`/${locale}/requests/new`}>
        {t.new}
      </Link>
      <section>
        <h2>{t.owned}</h2>
        {!owned ? (
          <p role="alert">{t.error}</p>
        ) : (
          <>
            {owned.items.length ? (
              <ul className={styles.list}>
                {owned.items.map((request) => (
                  <li className={`feature ${styles.card}`} key={request.id}>
                    <h3>
                      <Link href={`/${locale}/requests/${request.id}`}>
                        {request.details.title}
                      </Link>
                    </h3>
                    <p>{requestStateLabel(request.state, locale)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t.empty}</p>
            )}
            {pagination(owned.page, owned.total, "page")}
          </>
        )}
      </section>
      <section>
        <h2>{t.followed}</h2>
        {!followed ? (
          <p role="alert">{t.error}</p>
        ) : (
          <>
            {followed.items.length ? (
              <ul className={styles.list}>
                {followed.items.map((request) => (
                  <li key={request.id}>
                    <RequestSummaryCard
                      request={request}
                      locale={locale}
                      actions
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t.empty}</p>
            )}
            {pagination(followed.page, followed.total, "followedPage")}
          </>
        )}
      </section>
    </section>
  );
}
