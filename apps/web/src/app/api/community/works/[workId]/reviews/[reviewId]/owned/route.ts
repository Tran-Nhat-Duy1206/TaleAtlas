import { requireCommunityEnabled } from "../../../../../../../../server/community/gate";
import { getOwnedCommunityReview } from "../../../../../../../../server/community/service";
import { safeJson } from "../../../../../../../../server/http";
import { validatedCommunityResponse } from "../../../../../../../../features/community/http-contracts";
import {
  reviewOwnedSchema,
  parseReviewOwnedContextQuery,
  requireReviewScope,
} from "../../../../../../../../features/community/review-http-contracts";
type Context = { params: Promise<{ workId: string; reviewId: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  const response = await safeJson(
    "community.reviews.owned.context",
    async () => {
      requireCommunityEnabled();
      const { workId, reviewId } = await context.params;
      const result = validatedCommunityResponse(
        reviewOwnedSchema,
        await getOwnedCommunityReview(
          workId,
          reviewId,
          async () => parseReviewOwnedContextQuery(request.url),
          request.headers,
        ),
      );
      requireReviewScope(result, workId, reviewId);
      return result;
    },
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
