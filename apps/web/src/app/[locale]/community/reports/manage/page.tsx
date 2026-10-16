import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocale } from "../../../../../lib/i18n";
import { moderationCopy } from "../../../../../lib/moderation-i18n";
import { isCommunityEnabled } from "../../../../../server/community/availability";
import { listOwnedCommunityReports } from "../../../../../server/community/service";
import { AuthorizationError } from "../../../../../server/session";
import {
  ownedReportListResponseSchema,
  type OwnedReportListResponseDTO,
} from "../../../../../features/community/moderation-http-contracts";
import { ReportOwnerManage } from "../../../../../components/community/ReportOwnerManage";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isCommunityEnabled()) notFound();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return {
    title: moderationCopy[locale].reports,
    robots: { index: false, follow: false },
  };
}
export default async function OwnReportsPage({ params }: Props) {
  if (!isCommunityEnabled()) notFound();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  let initial: OwnedReportListResponseDTO;
  try {
    initial = ownedReportListResponseSchema.parse(
      await listOwnedCommunityReports({ locale }, new Headers(await headers())),
    );
  } catch (error) {
    if (
      !(error instanceof AuthorizationError) ||
      (error.status !== 401 && error.status !== 403)
    )
      throw error;
    const t = moderationCopy[locale];
    return (
      <section>
        <h1>{t.reports}</h1>
        <p>{t.reportNotice}</p>
        <a
          href={`/${locale}/${error.status === 401 ? "login" : "verify-email"}`}
        >
          {error.status === 401 ? t.login : t.verify}
        </a>
      </section>
    );
  }
  return <ReportOwnerManage locale={locale} initial={initial} />;
}
