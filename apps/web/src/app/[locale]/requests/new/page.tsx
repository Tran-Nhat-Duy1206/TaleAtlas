import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocale } from "../../../../lib/i18n";
import { requestDictionary } from "../../../../lib/request-i18n";
import { getSession } from "../../../../server/session";
import { NewRequestForm } from "../../../../components/requests/NewRequestForm";
import { REQUEST_FORMATS } from "@taleatlas/database/ingestion-types";
import { RequestNotice } from "../../../../components/requests/RequestNotice";
import styles from "../../../../components/requests/request.module.css";
export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[]; format?: string | string[] }>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return {
    title: requestDictionary(locale).new,
    robots: { index: false, follow: false },
  };
}
export default async function NewRequestPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.slice(0, 200) : "";
  const preserved = new URLSearchParams({
    q,
    format:
      typeof query.format === "string" ? query.format.slice(0, 40) : "UNKNOWN",
  });
  let session;
  try {
    session = await getSession(await headers());
  } catch {
    return <RequestNotice locale={locale} />;
  }
  if (!session)
    return (
      <RequestNotice
        locale={locale}
        signIn
        returnTo={`/${locale}/requests/new?${preserved}`}
      />
    );
  const format =
    REQUEST_FORMATS.find((value) => value === query.format) ?? "UNKNOWN";
  return (
    <section className={styles.module}>
      <h1>{requestDictionary(locale).new}</h1>
      <NewRequestForm
        locale={locale}
        prefillTitle={q}
        initialDetails={{ title: q, format, alternativeTitles: [] }}
      />
    </section>
  );
}
