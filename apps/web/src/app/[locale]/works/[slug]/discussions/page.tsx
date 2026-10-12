import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocale } from "../../../../../lib/i18n";
import { communityCopy } from "../../../../../lib/community-i18n";
import { isCommunityEnabled } from "../../../../../server/community/availability";
import { communityParticipation } from "../../../../../server/community/pages";
import { listCommunityContents } from "../../../../../server/community/service";
import { getWorkBySlug } from "../../../../../server/catalog/service";
import { CatalogError } from "../../../../../server/catalog/errors";
import { HttpError } from "../../../../../server/http";
import { communityPublicMetadata } from "../../../../../features/community/projection";
import { discussionListResponseSchema } from "../../../../../features/community/http-contracts";
import { ThreadList } from "../../../../../components/community/ThreadList";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isCommunityEnabled()) notFound();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return communityPublicMetadata(locale);
}
export default async function DiscussionsPage({ params }: Props) {
  if (!isCommunityEnabled()) notFound();
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const { work, initial, participation } = await (async () => {
    try {
      const work = await getWorkBySlug(slug, locale);
      if (!work) notFound();
      const requestHeaders = new Headers(await headers());
      const initial = discussionListResponseSchema.parse(
        await listCommunityContents(
          work.id,
          "THREAD",
          { locale },
          undefined,
          requestHeaders,
        ),
      );
      const participation = await communityParticipation(requestHeaders);
      return { work, initial, participation };
    } catch (error) {
      if (
        (error instanceof CatalogError || error instanceof HttpError) &&
        error.status === 404
      )
        notFound();
      throw error;
    }
  })();
  return (
    <section>
      <Link
        prefetch={false}
        href={`/${locale}/works/${encodeURIComponent(work.slug)}`}
      >
        {communityCopy[locale].back}
      </Link>
      <ThreadList
        locale={locale}
        workId={work.id}
        workSlug={work.slug}
        initial={initial}
        participation={participation}
      />
    </section>
  );
}
