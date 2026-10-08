"use client";
import { useParams } from "next/navigation";
import { dictionary, isLocale } from "@/lib/i18n";
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ locale: string }>();
  const t = dictionary(isLocale(params.locale) ? params.locale : "en");
  return (
    <section className="auth-page" role="alert">
      <h1>{t.genericError}</h1>
      <button className="button primary" onClick={reset}>
        {t.retry}
      </button>
    </section>
  );
}
