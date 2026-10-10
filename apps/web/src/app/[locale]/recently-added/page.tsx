import { notFound } from "next/navigation";
import { isLocale } from "../../../lib/i18n";
import { Discovery } from "../../../components/catalog/Discovery";
import {
  discoveryCopy,
  discoveryQuerySchema,
} from "../../../features/catalog/discovery";
import { recentlyAdded } from "../../../server/catalog/discovery";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return {
    title: discoveryCopy[locale].recent,
    alternates: {
      canonical: `/${locale}/recently-added`,
      languages: { en: "/en/recently-added", vi: "/vi/recently-added" },
    },
  };
}
export default async function RecentlyAddedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const raw = await searchParams;
  const parsed = discoveryQuerySchema.safeParse({
    page: raw.page ?? 1,
    pageSize: 20,
    locale,
  });
  if (!parsed.success) notFound();
  return (
    <Discovery locale={locale} recent={await recentlyAdded(parsed.data)} />
  );
}
