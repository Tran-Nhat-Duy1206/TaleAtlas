import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { suggestionGuard } from "@/server/catalog/suggestion-guard";
import { getSuggestionTarget } from "@/server/catalog/suggestion-target";
import { EditSuggestionForm } from "@/components/catalog/EditSuggestionForm";
import { suggestionCopy } from "@/components/catalog/suggestion-ui";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function SuggestEditPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const t = suggestionCopy[locale];
  const h = await suggestionGuard(locale);
  if (!h)
    return (
      <section className="auth-page">
        <p role="alert">{t.denied}</p>
        <Link href={`/${locale}/settings`}>{t.settings}</Link>
      </section>
    );
  const target = await getSuggestionTarget({ slug }).catch(() => null);
  if (!target)
    return (
      <section className="auth-page">
        <p role="alert">{t.unavailable}</p>
      </section>
    );
  return (
    <section className="auth-page">
      <h1>{t.heading}</h1>
      <Link href={`/${locale}/works/${encodeURIComponent(target.slug)}`}>
        {t.back}
      </Link>
      <EditSuggestionForm locale={locale} target={target} />
    </section>
  );
}
