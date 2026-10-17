import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { isLocale } from "@/lib/i18n";
import { suggestionGuard } from "@/server/catalog/suggestion-guard";
import { MetadataSuggestionDetail } from "@/components/catalog/MetadataSuggestionPages";
import { suggestionCopy } from "@/components/catalog/suggestion-ui";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const headers = await suggestionGuard(locale, true);
  if (!headers)
    return (
      <section className="auth-page">
        <p role="alert">{suggestionCopy[locale].denied}</p>
      </section>
    );
  if (!z.uuid().safeParse(id).success) notFound();
  return (
    <MetadataSuggestionDetail locale={locale} id={id} headers={headers} admin />
  );
}
