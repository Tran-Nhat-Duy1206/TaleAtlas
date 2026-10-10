import { notFound } from "next/navigation";
import { isLocale } from "../../../lib/i18n";
import { Discovery } from "../../../components/catalog/Discovery";
import {
  discoveryCopy,
  releaseQuerySchema,
} from "../../../features/catalog/discovery";
import { verifiedReleases } from "../../../server/catalog/discovery";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return {
    title: discoveryCopy[locale].releases,
    alternates: {
      canonical: `/${locale}/releases`,
      languages: { en: "/en/releases", vi: "/vi/releases" },
    },
  };
}
export default async function ReleasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const raw = await searchParams;
  const parsed = releaseQuerySchema.safeParse({
    page: raw.page ?? 1,
    pageSize: 20,
    locale,
    from: raw.from,
    to: raw.to,
  });
  if (!parsed.success) notFound();
  return (
    <Discovery locale={locale} releases={await verifiedReleases(parsed.data)} />
  );
}
