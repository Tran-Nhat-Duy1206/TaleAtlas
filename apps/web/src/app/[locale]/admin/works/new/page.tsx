import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { catalogDictionary } from "@/lib/catalog-i18n";
import { adminGuard } from "@/components/catalog/AdminGuard";
import { WorkEditor } from "@/components/catalog/WorkEditor";
import styles from "@/components/catalog/admin.module.css";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function NewWork({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = catalogDictionary(locale);
  if (!(await adminGuard(locale)))
    return (
      <section className={styles.page}>
        <h1>{d.denied}</h1>
      </section>
    );
  return (
    <section className={styles.page}>
      <Link href={`/${locale}/admin/works`}>{d.back}</Link>
      <h1>{d.newWork}</h1>
      <WorkEditor locale={locale} />
    </section>
  );
}
