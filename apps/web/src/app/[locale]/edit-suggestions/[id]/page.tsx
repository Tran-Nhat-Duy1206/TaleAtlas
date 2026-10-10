import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { isLocale } from "@/lib/i18n";
import { suggestionGuard } from "@/server/catalog/suggestion-guard";
import { getOwnedEditSuggestion } from "@/server/catalog/edit-suggestions";
import { SuggestionMetadata } from "@/components/catalog/EditSuggestionReview";
import { suggestionCopy } from "@/components/catalog/suggestion-ui";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function SuggestionHistoryPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const t = suggestionCopy[locale],
    h = await suggestionGuard(locale);
  if (!h)
    return (
      <section className="auth-page">
        <p role="alert">{t.denied}</p>
      </section>
    );
  if (!z.uuid().safeParse(id).success) notFound();
  const suggestion = await getOwnedEditSuggestion(id, h).catch(() => null);
  if (!suggestion)
    return (
      <section className="auth-page">
        <p role="alert">{t.unavailable}</p>
      </section>
    );
  return (
    <section className="auth-page">
      <h1>{t.history}</h1>
      <Link href={`/${locale}/edit-suggestions`}>{t.mine}</Link>
      <p>
        {t.state}: {suggestion.state}
      </p>
      <p>
        {t.base}: {suggestion.baseWorkRevision}
      </p>
      <SuggestionMetadata locale={locale} suggestion={suggestion} />
      {suggestion.reviewReason && (
        <section>
          <h2>{t.reasonSaved}</h2>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {suggestion.reviewReason}
          </p>
        </section>
      )}
      {suggestion.appliedWorkRevision !== null && (
        <p>
          {t.applied}: {suggestion.appliedWorkRevision}
        </p>
      )}
      <h2>{t.history}</h2>
      <ol>
        {suggestion.events.map((e) => (
          <li key={e.revision}>
            {e.revision} · {e.fromState ? `${e.fromState} → ` : ""}
            {e.toState} · <time dateTime={e.createdAt}>{e.createdAt}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}
