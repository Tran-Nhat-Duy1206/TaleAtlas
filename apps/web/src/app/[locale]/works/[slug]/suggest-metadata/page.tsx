import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { suggestionGuard } from "@/server/catalog/suggestion-guard";
import { getSuggestionTarget } from "@/server/catalog/suggestion-target";
import { getMetadataTarget } from "@/server/catalog/metadata-suggestions";
import { metadataTargetSchema } from "@/features/catalog/metadata-suggestion-contracts";
import { MetadataSuggestionForm } from "@/components/catalog/MetadataSuggestionForm";
import { suggestionCopy } from "@/components/catalog/suggestion-ui";
import { metadataCopy } from "@/components/catalog/metadata-suggestion-ui";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const t = { ...suggestionCopy[locale], ...metadataCopy[locale] },
    headers = await suggestionGuard(locale);
  if (!headers)
    return (
      <section className="auth-page">
        <p role="alert">{t.denied}</p>
      </section>
    );
  const work = await getSuggestionTarget({ slug }).catch(() => null);
  const target = work
    ? await getMetadataTarget(work.id, headers)
        .then((r) => metadataTargetSchema.parse(r))
        .catch(() => null)
    : null;
  if (!target)
    return (
      <section className="auth-page">
        <p role="alert">{t.unavailable}</p>
      </section>
    );
  return (
    <section
      className="auth-page"
      style={{ width: "100%", maxWidth: "60rem", overflowWrap: "anywhere" }}
    >
      <h1>{t.heading}</h1>
      <h2>{target.work.primaryTitle}</h2>
      <nav
        aria-label={t.heading}
        style={{ display: "flex", flexWrap: "wrap", gap: ".75rem" }}
      >
        <Link href={`/${locale}/works/${encodeURIComponent(target.work.slug)}`}>
          {t.back}
        </Link>
        <Link
          href={`/${locale}/works/${encodeURIComponent(target.work.slug)}/suggest-edit`}
        >
          {t.legacy}
        </Link>
        <Link href={`/${locale}/metadata-suggestions`}>{t.mine}</Link>
      </nav>
      <MetadataSuggestionForm locale={locale} target={target} />
    </section>
  );
}
