import type { Metadata } from "next";
import Link from "next/link";
import { discoveryCopy } from "../../../features/catalog/discovery";
import { headers } from "next/headers";
import { getSession } from "../../../server/session";
import {
  findRequestSummaries,
  type RequestSummary,
} from "../../../server/ingestion/request-public";
import { MissingStoryPrompt } from "../../../components/requests/MissingStoryPrompt";
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
  let authenticated = false;
  let requestError = false;
  let summaries: RequestSummary[] = [];
  if (query.q.trim()) {
    try {
      const requestHeaders = await headers();
      authenticated = Boolean(await getSession(requestHeaders));
      if (authenticated) {
        summaries = (
          await findRequestSummaries(
            { q: query.q, page: 1, pageSize: 5 },
            requestHeaders,
          )
        ).items;
      }
    } catch {
      requestError = true;
    }
  }
  return (
    <>
      <nav aria-label={locale === "vi" ? "Khám phá" : "Discovery"}>
        <Link href={`/${locale}/recently-added`}>
          {discoveryCopy[locale].recent}
        </Link>
        {" · "}
        <Link href={`/${locale}/releases`}>
          {discoveryCopy[locale].releases}
        </Link>
      </nav>
      <PublicCatalog
        locale={locale}
        query={query}
        result={result}
        requestPrompt={
          <MissingStoryPrompt
            locale={locale}
            q={query.q}
            format={query.format}
            authenticated={authenticated}
            summaries={summaries}
            error={requestError}
          />
        }
      />
    </>
  );
}
