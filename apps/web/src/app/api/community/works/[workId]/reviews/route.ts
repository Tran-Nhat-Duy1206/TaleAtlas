import { requireCommunityEnabled } from "../../../../../../server/community/gate";
import {
  createCommunityReview,
  listCommunityReviews,
} from "../../../../../../server/community/service";
import { readJson, safeJson } from "../../../../../../server/http";
import { communityUuidSchema } from "../../../../../../features/community/contracts";
import {
  requireEmptyCommunityQuery,
  validatedCommunityResponse,
} from "../../../../../../features/community/http-contracts";
import {
  reviewCreateSchema,
  reviewListResponseSchema,
  reviewHttpMutation,
  parseReviewQuery,
  requireReviewScope,
} from "../../../../../../features/community/review-http-contracts";
type Context = { params: Promise<{ workId: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  return safeJson("community.reviews.list", async () => {
    requireCommunityEnabled();
    const { workId } = await context.params;
    const result = validatedCommunityResponse(
      reviewListResponseSchema,
      await listCommunityReviews(
        workId,
        async () => parseReviewQuery(request.url),
        request.headers,
      ),
    );
    for (const item of result.items) requireReviewScope(item, workId);
    return result;
  });
}
export async function POST(request: Request, context: Context) {
  return safeJson("community.reviews.create", async () => {
    requireCommunityEnabled();
    const { workId } = await context.params;
    return reviewHttpMutation(
      await createCommunityReview(
        workId,
        async () => {
          communityUuidSchema.parse(workId);
          requireEmptyCommunityQuery(request.url);
          return readJson(request, reviewCreateSchema);
        },
        request.headers,
      ),
      workId,
    );
  });
}
