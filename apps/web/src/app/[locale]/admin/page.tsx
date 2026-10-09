import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { adminGuard } from "@/components/catalog/AdminGuard";
import { catalogDictionary } from "@/lib/catalog-i18n";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function Admin({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (!(await adminGuard(locale)))
    return (
      <section className="feature">
        <h1>{catalogDictionary(locale).denied}</h1>
      </section>
    );
  redirect(`/${locale}/admin/works`);
}
