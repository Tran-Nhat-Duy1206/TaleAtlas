import { requireCommunityEnabled } from "../../../../../../../server/community/gate";
import { getCommunityContent } from "../../../../../../../server/community/service";
import { HttpError, safeJson } from "../../../../../../../server/http";
import {
  discussionPublicSchema,
  requireDiscussionScope,
  requireEmptyCommunityQuery,
  validatedCommunityResponse,
} from "../../../../../../../features/community/http-contracts";

type Context = { params: Promise<{ workId: string; threadId: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  return safeJson("community.threads.detail", async () => {
    requireCommunityEnabled();
    const { workId, threadId } = await context.params;
    const content = await getCommunityContent(
      workId,
      threadId,
      request.headers,
    );
    // The foundation detail service is generic; B thread paths must not expose replies/reviews.
    if (content.kind !== "THREAD")
      throw new HttpError(404, "COMMUNITY_NOT_FOUND");
    requireEmptyCommunityQuery(request.url);
    const result = validatedCommunityResponse(discussionPublicSchema, content);
    requireDiscussionScope(result, workId, "THREAD", threadId);
    return result;
  });
}
