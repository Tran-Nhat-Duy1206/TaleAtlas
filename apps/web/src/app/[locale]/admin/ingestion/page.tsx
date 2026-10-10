import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { adminGuard } from "@/components/catalog/AdminGuard";
import {
  adminIngestion,
  adminIngestionPageSchema,
} from "@/server/ingestion/candidates";
import { ingestionDictionary } from "@/components/ingestion/copy";
import { ProcessButton } from "@/components/ingestion/ProcessButton";
import styles from "@/components/ingestion/ingestion.module.css";
import { OFFLINE_DISABLED_PROVIDER_DESCRIPTORS } from "@/features/ingestion/provider-records";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function AdminIngestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = ingestionDictionary(locale);
  // Backend role enforcement precedes every private queue fetch.
  const headers = await adminGuard(locale);
  if (!headers)
    return (
      <section className={styles.page}>
        <h1>{d.denied}</h1>
      </section>
    );
  const raw = await searchParams;
  const parsed = adminIngestionPageSchema.safeParse({
    page: raw.page ?? 1,
    pageSize: 20,
    requestId: raw.requestId,
  });
  if (!parsed.success) notFound();
  const query = parsed.data;
  const result = await adminIngestion(query, headers);
  const href = (page: number) =>
    `?page=${page}${query.requestId ? `&requestId=${encodeURIComponent(query.requestId)}` : ""}`;
  return (
    <section className={styles.page}>
      <h1>{d.title}</h1>
      <p>{d.notice}</p>
      <ul
        aria-label={
          locale === "vi" ? "Nhà cung cấp bị tắt" : "Disabled providers"
        }
      >
        {OFFLINE_DISABLED_PROVIDER_DESCRIPTORS.map((provider) => (
          <li key={provider.providerId}>
            {provider.providerId}:{" "}
            {locale === "vi"
              ? "Đã tắt · không có quyền truy xuất"
              : "Disabled · no retrieval permission"}
          </li>
        ))}
      </ul>
      {query.requestId && (
        <label>
          {d.selected}
          <input readOnly value={query.requestId} />
        </label>
      )}
      {!result.items.length && <p>{d.empty}</p>}
      {result.items.map(({ request, candidate, matches }) => (
        <article key={request.id}>
          <h2>{request.details.title}</h2>
          <p>{request.id}</p>
          <p>
            {d.state}:{" "}
            <span data-testid="ingestion-state">{request.state}</span> ·{" "}
            {d.revision}: {request.revision} · {d.inputRevision}:{" "}
            {request.inputRevision}
          </p>
          {!query.requestId && (
            <Link href={`?requestId=${request.id}`}>{d.choose}</Link>
          )}
          {query.requestId === request.id && (
            <ProcessButton locale={locale} requestId={request.id} />
          )}
          <h3>{d.input}</h3>
          <pre>
            {JSON.stringify(
              Object.fromEntries(
                Object.entries(request.details).filter(
                  ([field]) => field !== "notes",
                ),
              ),
              null,
              2,
            )}
          </pre>
          <h3>{d.candidate}</h3>
          {candidate ? (
            <pre data-testid="ingestion-candidate">
              {JSON.stringify(candidate, null, 2)}
            </pre>
          ) : (
            <p>{d.pending}</p>
          )}
          <h3>{d.matches}</h3>
          {matches.length ? (
            <pre>{JSON.stringify(matches, null, 2)}</pre>
          ) : (
            <p>{d.noMatches}</p>
          )}
        </article>
      ))}
      <nav className={styles.pagination} aria-label={d.pagination}>
        {result.page > 1 && (
          <Link href={href(result.page - 1)}>{d.previous}</Link>
        )}
        <span>
          {d.page} {result.page}
        </span>
        {result.hasMore && <Link href={href(result.page + 1)}>{d.next}</Link>}
      </nav>
    </section>
  );
}
