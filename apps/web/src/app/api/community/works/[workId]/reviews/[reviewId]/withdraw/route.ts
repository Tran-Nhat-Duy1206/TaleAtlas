import { requireCommunityEnabled } from "../../../../../../../../server/community/gate";
import { withdrawCommunityContent } from "../../../../../../../../server/community/service";
import { readJson, safeJson } from "../../../../../../../../server/http";
import { communityUuidSchema } from "../../../../../../../../features/community/contracts";
import { requireEmptyCommunityQuery } from "../../../../../../../../features/community/http-contracts";
import {
  reviewWithdrawSchema,
  reviewHttpMutation,
} from "../../../../../../../../features/community/review-http-contracts";
type Context = { params: Promise<{ workId: string; reviewId: string }> };
export const runtime = "nodejs";
export async function POST(request: Request, context: Context) {
  return safeJson("community.reviews.withdraw", async () => {
    requireCommunityEnabled();
    const { workId, reviewId } = await context.params;
    return reviewHttpMutation(
      await withdrawCommunityContent(
        workId,
        reviewId,
        async () => {
          communityUuidSchema.parse(workId);
          communityUuidSchema.parse(reviewId);
          requireEmptyCommunityQuery(request.url);
          return readJson(request, reviewWithdrawSchema);
        },
        request.headers,
      ),
      workId,
      reviewId,
    );
  });
}
