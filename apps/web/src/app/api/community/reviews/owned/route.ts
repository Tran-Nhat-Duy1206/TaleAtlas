import { requireCommunityEnabled } from "../../../../../server/community/gate";
import { listOwnedCommunityReviews } from "../../../../../server/community/service";
import { safeJson } from "../../../../../server/http";
import { validatedCommunityResponse } from "../../../../../features/community/http-contracts";
import {
  reviewOwnedListResponseSchema,
  parseReviewOwnedQuery,
} from "../../../../../features/community/review-http-contracts";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const response = await safeJson("community.reviews.owned.list", async () => {
    requireCommunityEnabled();
    return validatedCommunityResponse(
      reviewOwnedListResponseSchema,
      await listOwnedCommunityReviews(
        async () => parseReviewOwnedQuery(request.url),
        request.headers,
      ),
    );
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
