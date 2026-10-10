import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { isLocale } from "@/lib/i18n";
import { catalogDictionary } from "@/lib/catalog-i18n";
import { adminGuard } from "@/components/catalog/AdminGuard";
import { ReleaseForm } from "@/components/catalog/ReleaseForm";
import { adminGetWork } from "@/server/catalog/service";
import { CatalogError } from "@/server/catalog/errors";
import styles from "@/components/catalog/admin.module.css";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
const copy = {
  en: {
    title: "Record an exact verified release",
    id: "Published work UUID",
    load: "Load published work",
    back: "Back to works",
    note: "Load the actual published work and current revision before reviewing release evidence.",
  },
  vi: {
    title: "Ghi nhận ngày phát hành chính xác đã xác minh",
    id: "UUID tác phẩm đã xuất bản",
    load: "Tải tác phẩm đã xuất bản",
    back: "Quay lại tác phẩm",
    note: "Tải tác phẩm thực tế đã xuất bản và phiên bản hiện tại trước khi đối chiếu dẫn chứng phát hành.",
  },
} as const;
export default async function Releases({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ workId?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const requestHeaders = await adminGuard(locale);
  if (!requestHeaders)
    return (
      <section className={styles.page}>
        <h1>{catalogDictionary(locale).denied}</h1>
      </section>
    );
  const { workId } = await searchParams;
  const d = copy[locale];
  let work;
  if (workId !== undefined) {
    const parsed = z.uuid().safeParse(workId);
    if (!parsed.success) notFound();
    work = await adminGetWork(parsed.data, requestHeaders).catch(
      (error: unknown) => {
        if (
          error instanceof CatalogError &&
          (error.status === 404 || error.status === 400)
        )
          notFound();
        throw error;
      },
    );
    if (
      !("revision" in work) ||
      !("visibility" in work) ||
      work.visibility !== "PUBLISHED"
    )
      notFound();
  }
  return (
    <section className={styles.page}>
      <Link href={`/${locale}/admin/works`}>{d.back}</Link>
      <h1>{d.title}</h1>
      <p>{d.note}</p>
      <form
        method="GET"
        action={`/${locale}/admin/releases`}
        className={styles.form}
      >
        <label className={styles.field}>
          {d.id}
          <input name="workId" required defaultValue={work?.id ?? ""} />
        </label>
        <button type="submit">{d.load}</button>
      </form>
      {work && "revision" in work && (
        <ReleaseForm
          key={`${work.id}:${work.revision}`}
          locale={locale}
          work={{
            id: work.id,
            revision: work.revision,
            title: work.displayTitle,
            source: work.source,
          }}
        />
      )}
    </section>
  );
}
