import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "../../../lib/i18n";
import { listWorks } from "../../../server/catalog/service";
import { PublicCatalog } from "../../../components/catalog/PublicCatalog";
import {
  publicCatalogQuery,
  publicCopy,
  type PublicSearchParams,
} from "../../../components/catalog/query";
export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<PublicSearchParams>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return {
    title: publicCopy[locale].title,
    description: publicCopy[locale].intro,
    alternates: {
      canonical: `/${locale}/works`,
      languages: { en: "/en/works", vi: "/vi/works" },
    },
  };
}
export default async function WorksPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const query = publicCatalogQuery(await searchParams, locale);
  const result = await listWorks(query);
  return <PublicCatalog locale={locale} query={query} result={result} />;
}
