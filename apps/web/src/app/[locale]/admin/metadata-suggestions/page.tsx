import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { suggestionGuard } from "@/server/catalog/suggestion-guard";
import { MetadataSuggestionList } from "@/components/catalog/MetadataSuggestionPages";
import { suggestionCopy } from "@/components/catalog/suggestion-ui";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const headers = await suggestionGuard(locale, true);
  if (!headers)
    return (
      <section className="auth-page">
        <p role="alert">{suggestionCopy[locale].denied}</p>
      </section>
    );
  const query = await searchParams,
    n = Number(query.page),
    page = Number.isInteger(n) && n >= 1 && n <= 501 ? n : 1;
  return (
    <MetadataSuggestionList
      locale={locale}
      page={page}
      headers={headers}
      admin
    />
  );
}
