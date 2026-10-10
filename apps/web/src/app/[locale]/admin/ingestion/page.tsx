import Link from "next/link";
import { z } from "zod";
import { adminGetWork } from "@/server/catalog/service";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { adminGuard } from "@/components/catalog/AdminGuard";
import {
  adminIngestion,
  adminIngestionPageSchema,
} from "@/server/ingestion/candidates";
import { ingestionDictionary } from "@/components/ingestion/copy";
import { ProcessButton } from "@/components/ingestion/ProcessButton";
import { ReviewForm } from "@/components/ingestion/ReviewForm";
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
  const comparison =
    raw.compareWorkId === undefined
      ? null
      : z.uuid().safeParse(raw.compareWorkId);
  if (comparison && !comparison.success) notFound();
  const comparedWork = comparison?.success
    ? await adminGetWork(comparison.data, headers)
    : null;
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
      {comparedWork && (
        <aside
          aria-label={
            locale === "vi"
              ? "So sánh dữ kiện đã duyệt"
              : "Compare curated metadata"
          }
        >
          <h2>
            {locale === "vi"
              ? "Tác phẩm hiện tại để so sánh thủ công"
              : "Current Work for human comparison"}
          </h2>
          <p>
            {locale === "vi"
              ? "Dữ kiện danh mục khác với gợi ý chưa xác minh. Kiểm tra phiên bản, nguồn và khác biệt; không tự hợp nhất."
              : "Curated facts are distinct from unverified suggestions. Check revision, evidence and conflicts; no automatic merge."}
          </p>
          <pre>{JSON.stringify(comparedWork, null, 2)}</pre>
        </aside>
      )}
      {!result.items.length && <p>{d.empty}</p>}
      {result.items.map(({ request, candidateId, candidate, matches }) => (
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
          {request.state === "NEEDS_REVIEW" && candidateId && (
            <ReviewForm
              locale={locale}
              requestId={request.id}
              revision={request.revision}
              inputRevision={request.inputRevision}
              candidateId={candidateId}
            />
          )}
          <h3>{d.matches}</h3>
          {matches.length ? (
            <>
              <pre>{JSON.stringify(matches, null, 2)}</pre>
              <ul>
                {matches.map((match) => (
                  <li key={match.workId}>
                    <Link
                      href={`?requestId=${request.id}&compareWorkId=${match.workId}`}
                    >
                      {locale === "vi" ? "So sánh tác phẩm" : "Compare Work"}:{" "}
                      {match.workId}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
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
