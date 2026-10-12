import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ZodError } from "zod";
import { isLocale } from "../../../../../../lib/i18n";
import { communityCopy } from "../../../../../../lib/community-i18n";
import { isCommunityEnabled } from "../../../../../../server/community/availability";
import { communityParticipation } from "../../../../../../server/community/pages";
import {
  getCommunityContent,
  listCommunityContents,
} from "../../../../../../server/community/service";
import { getWorkBySlug } from "../../../../../../server/catalog/service";
import { CatalogError } from "../../../../../../server/catalog/errors";
import { HttpError } from "../../../../../../server/http";
import { communityPublicMetadata } from "../../../../../../features/community/projection";
import {
  discussionPublicSchema,
  discussionListResponseSchema,
} from "../../../../../../features/community/http-contracts";
import { ThreadDetail } from "../../../../../../components/community/ThreadDetail";

export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ locale: string; slug: string; threadId: string }>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isCommunityEnabled()) notFound();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return communityPublicMetadata(locale);
}
export default async function DiscussionPage({ params }: Props) {
  if (!isCommunityEnabled()) notFound();
  const { locale, slug, threadId } = await params;
  if (!isLocale(locale)) notFound();
  const { work, initialThread, initialReplies, participation } =
    await (async () => {
      try {
        const work = await getWorkBySlug(slug, locale);
        if (!work) notFound();
        const requestHeaders = new Headers(await headers());
        const initialThread = discussionPublicSchema.parse(
          await getCommunityContent(work.id, threadId, requestHeaders),
        );
        if (initialThread.kind !== "THREAD") notFound();
        const initialReplies = discussionListResponseSchema.parse(
          await listCommunityContents(
            work.id,
            "THREAD",
            { locale },
            threadId,
            requestHeaders,
          ),
        );
        const participation = await communityParticipation(requestHeaders);
        return { work, initialThread, initialReplies, participation };
      } catch (error) {
        if (
          error instanceof ZodError ||
          ((error instanceof CatalogError || error instanceof HttpError) &&
            error.status === 404)
        )
          notFound();
        throw error;
      }
    })();
  return (
    <section>
      <Link
        prefetch={false}
        href={`/${locale}/works/${encodeURIComponent(work.slug)}/discussions`}
      >
        {communityCopy[locale].all}
      </Link>
      <ThreadDetail
        locale={locale}
        workId={work.id}
        workSlug={work.slug}
        initialThread={initialThread}
        initialReplies={initialReplies}
        participation={participation}
      />
    </section>
  );
}
