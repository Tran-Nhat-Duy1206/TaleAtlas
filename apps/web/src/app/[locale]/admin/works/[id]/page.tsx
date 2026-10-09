import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { catalogDictionary } from "@/lib/catalog-i18n";
import { adminGuard } from "@/components/catalog/AdminGuard";
import { WorkEditor } from "@/components/catalog/WorkEditor";
import { adminInput } from "@/components/catalog/admin-input";
import { adminGetWork } from "@/server/catalog/service";
import { CatalogError } from "@/server/catalog/errors";
import styles from "@/components/catalog/admin.module.css";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function EditWork({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const d = catalogDictionary(locale);
  const requestHeaders = await adminGuard(locale);
  if (!requestHeaders)
    return (
      <section className={styles.page}>
        <h1>{d.denied}</h1>
      </section>
    );
  const work = await adminGetWork(id, requestHeaders).catch(
    (error: unknown) => {
      if (
        error instanceof CatalogError &&
        (error.status === 404 || error.status === 400)
      )
        notFound();
      throw error;
    },
  );
  if (!("revision" in work) || !("visibility" in work))
    throw new Error("Invalid administrator work response");
  return (
    <section className={styles.page}>
      <Link href={`/${locale}/admin/works`}>{d.back}</Link>
      <h1>
        {d.edit}: {work.primaryTitle}
      </h1>
      <p>
        {d.revision}: {work.revision}
      </p>
      <WorkEditor
        locale={locale}
        initial={adminInput(work)}
        id={work.id}
        revision={work.revision}
      />
    </section>
  );
}
