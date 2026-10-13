import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocale } from "../../../../lib/i18n";
import { moderationCopy } from "../../../../lib/moderation-i18n";
import { isCommunityEnabled } from "../../../../server/community/availability";
import { listCommunityModerationReports } from "../../../../server/community/service";
import { AuthorizationError } from "../../../../server/session";
import {
  moderationQueueResponseSchema,
  type ModerationQueueDTO,
} from "../../../../features/community/moderation-http-contracts";
import { ModerationQueue } from "../../../../components/community/ModerationQueue";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isCommunityEnabled()) notFound();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return {
    title: moderationCopy[locale].moderation,
    robots: { index: false, follow: false },
  };
}
export default async function CommunityModerationPage({ params }: Props) {
  if (!isCommunityEnabled()) notFound();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  let initial: ModerationQueueDTO;
  try {
    // The private service independently rechecks current persisted verified MODERATOR/ADMIN authority.
    initial = moderationQueueResponseSchema.parse(
      await listCommunityModerationReports(
        { locale },
        new Headers(await headers()),
      ),
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
        <h1>{t.moderation}</h1>
        <p role="alert">{t.deniedModeration}</p>
        {error.status === 401 && <a href={`/${locale}/login`}>{t.login}</a>}
      </section>
    );
  }
  return <ModerationQueue locale={locale} initial={initial} />;
}
