import { notFound, redirect } from "next/navigation";
import { Settings } from "@/components/settings";
import { isLocale } from "@/lib/i18n";
import { privateMetadata } from "@/lib/page-metadata";
import { getSession } from "@/server/session";
import { isCommunityEnabled } from "@/server/community/availability";
import { communityCopy } from "@/lib/community-i18n";
import { reviewCopy } from "@/lib/review-i18n";
import { ModerationNavigation } from "@/components/community/ModerationNavigation";
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return privateMetadata(locale, "settings");
}
export default async function Page({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const session = await getSession();
  if (!session) redirect(`/${locale}/login`);
  return (
    <>
      <Settings locale={locale} />
      {isCommunityEnabled() && (
        <nav
          aria-label={
            locale === "vi"
              ? "Nội dung công khai của tôi"
              : "My public contributions"
          }
        >
          <a href={`/${locale}/community/manage`}>
            {communityCopy[locale].manage}
          </a>
          <a href={`/${locale}/community/reviews/manage`}>
            {reviewCopy[locale].manage}
          </a>
          <ModerationNavigation
            locale={locale}
            verified={session.user.emailVerified}
            moderator={
              session.user.role === "moderator" || session.user.role === "admin"
            }
          />
        </nav>
      )}
    </>
  );
}
