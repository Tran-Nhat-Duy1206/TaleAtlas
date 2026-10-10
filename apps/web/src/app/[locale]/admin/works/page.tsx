import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import {
  catalogDictionary,
  visibilityLabels,
  formatLabels,
} from "@/lib/catalog-i18n";
import { adminGuard } from "@/components/catalog/AdminGuard";
import { adminListWorks } from "@/server/catalog/service";
import { catalogQuerySchema } from "@/features/catalog/contracts";
import styles from "@/components/catalog/admin.module.css";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function AdminWorks({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = catalogDictionary(locale);
  const requestHeaders = await adminGuard(locale);
  if (!requestHeaders)
    return (
      <section className={styles.page}>
        <h1>{d.denied}</h1>
      </section>
    );
  const raw = await searchParams;
  const parsed = catalogQuerySchema.safeParse({
    locale,
    q: typeof raw.q === "string" ? raw.q : "",
    page: typeof raw.page === "string" ? raw.page : 1,
    pageSize: 20,
  });
  const query = parsed.success
    ? parsed.data
    : catalogQuerySchema.parse({ locale });
  const result = await adminListWorks(query, requestHeaders);
  return (
    <section className={styles.page}>
      <h1>{d.admin}</h1>
      <nav
        className={styles.actions}
        aria-label={locale === "vi" ? "Quản trị V2" : "V2 administration"}
      >
        <Link href={`/${locale}/admin/ingestion`}>
          {locale === "vi" ? "Ứng viên và yêu cầu" : "Candidates and requests"}
        </Link>
        <Link href={`/${locale}/admin/edit-suggestions`}>
          {locale === "vi"
            ? "Duyệt đề xuất chỉnh sửa"
            : "Review edit suggestions"}
        </Link>
        <Link href={`/${locale}/admin/releases`}>
          {locale === "vi" ? "Duyệt ngày phát hành" : "Review release dates"}
        </Link>
      </nav>
      <Link
        className="button button-primary"
        href={`/${locale}/admin/works/new`}
      >
        {d.newWork}
      </Link>
      <form className={styles.actions}>
        <label>
          {locale === "vi" ? "Tìm kiếm" : "Search"}{" "}
          <input name="q" defaultValue={query.q} maxLength={200} />
        </label>
        <button className="button button-secondary">
          {locale === "vi" ? "Tìm" : "Search"}
        </button>
      </form>
      {!result.items.length ? (
        <p>{d.empty}</p>
      ) : (
        <ul className={styles.entries}>
          {result.items.map((work) => (
            <li key={work.id} className={styles.entry}>
              <Link href={`/${locale}/admin/works/${work.id}`}>
                {work.displayTitle}
              </Link>
              <span>
                {formatLabels[locale][work.format]} ·{" "}
                {"visibility" in work
                  ? visibilityLabels[locale][work.visibility]
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      <nav
        className={styles.actions}
        aria-label={locale === "vi" ? "Phân trang" : "Pagination"}
      >
        {query.page > 1 && (
          <Link
            href={`?q=${encodeURIComponent(query.q)}&page=${query.page - 1}`}
          >
            {locale === "vi" ? "Trang trước" : "Previous"}
          </Link>
        )}
        {query.page * result.pageSize < result.total &&
          query.page * result.pageSize <= 10000 && (
            <Link
              href={`?q=${encodeURIComponent(query.q)}&page=${query.page + 1}`}
            >
              {locale === "vi" ? "Trang sau" : "Next"}
            </Link>
          )}
      </nav>
    </section>
  );
}
