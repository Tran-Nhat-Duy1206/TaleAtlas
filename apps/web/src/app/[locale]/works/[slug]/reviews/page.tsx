import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocale } from "../../../../../lib/i18n";
import { reviewCopy } from "../../../../../lib/review-i18n";
import { isCommunityEnabled } from "../../../../../server/community/availability";
import { communityParticipation } from "../../../../../server/community/pages";
import { listCommunityReviews } from "../../../../../server/community/service";
import { getWorkBySlug } from "../../../../../server/catalog/service";
import { CatalogError } from "../../../../../server/catalog/errors";
import { HttpError } from "../../../../../server/http";
import { reviewListResponseSchema } from "../../../../../features/community/review-http-contracts";
import { ReviewList } from "../../../../../components/community/ReviewList";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isCommunityEnabled()) notFound();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return {
    title: reviewCopy[locale].reviews,
    robots: { index: false, follow: false },
  };
}
export default async function ReviewsPage({ params }: Props) {
  if (!isCommunityEnabled()) notFound();
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const { work, initial, participation } = await (async () => {
    try {
      const work = await getWorkBySlug(slug, locale);
      if (!work) notFound();
      const requestHeaders = new Headers(await headers());
      const initial = reviewListResponseSchema.parse(
        await listCommunityReviews(work.id, { locale }, requestHeaders),
      );
      if (initial.items.some((item) => item.workId !== work.id))
        throw new Error("Invalid community review scope");
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
      <a href={`/${locale}/works/${encodeURIComponent(work.slug)}`}>
        {reviewCopy[locale].back}
      </a>
      <ReviewList
        locale={locale}
        workId={work.id}
        workSlug={work.slug}
        initial={initial}
        participation={participation}
      />
    </section>
  );
}
