import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocale } from "../../../../lib/i18n";
import { communityCopy } from "../../../../lib/community-i18n";
import { isCommunityEnabled } from "../../../../server/community/availability";
import { listOwnedCommunityContents } from "../../../../server/community/service";
import { AuthorizationError } from "../../../../server/session";
import { communityOwnedListResponseSchema } from "../../../../features/community/http-contracts";
import { OwnerManage } from "../../../../components/community/OwnerManage";
import { Participation } from "../../../../components/community/Participation";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isCommunityEnabled()) notFound();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return {
    title: communityCopy[locale].manage,
    robots: { index: false, follow: false },
  };
}
export default async function OwnCommunityPage({ params }: Props) {
  if (!isCommunityEnabled()) notFound();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const state = await (async () => {
    try {
      const initial = communityOwnedListResponseSchema.parse(
        await listOwnedCommunityContents(
          { locale },
          new Headers(await headers()),
        ),
      );
      return { initial, participation: "VERIFIED" as const };
    } catch (error) {
      if (
        error instanceof AuthorizationError &&
        (error.status === 401 || error.status === 403)
      )
        return {
          initial: null,
          participation:
            error.status === 401
              ? ("ANONYMOUS" as const)
              : ("UNVERIFIED" as const),
        };
      throw error;
    }
  })();
  return state.initial ? (
    <section>
      <OwnerManage locale={locale} initial={state.initial} />
    </section>
  ) : (
    <section>
      <h1>{communityCopy[locale].manage}</h1>
      <Participation locale={locale} participation={state.participation} />
    </section>
  );
}
