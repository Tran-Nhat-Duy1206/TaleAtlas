import { requireCommunityEnabled } from "../../../../../../../server/community/gate";
import { getCommunityReviewSlot } from "../../../../../../../server/community/service";
import { safeJson } from "../../../../../../../server/http";
import { validatedCommunityResponse } from "../../../../../../../features/community/http-contracts";
import {
  reviewSlotResponseSchema,
  parseReviewSlotQuery,
  requireReviewScope,
} from "../../../../../../../features/community/review-http-contracts";
type Context = { params: Promise<{ workId: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  const response = await safeJson("community.reviews.owned.slot", async () => {
    requireCommunityEnabled();
    const { workId } = await context.params;
    const result = validatedCommunityResponse(
      reviewSlotResponseSchema,
      await getCommunityReviewSlot(async () => {
        parseReviewSlotQuery(request.url);
        return workId;
      }, request.headers),
    );
    if (result.item) requireReviewScope(result.item, workId);
    return result;
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
