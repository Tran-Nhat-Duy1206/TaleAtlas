import { requireCommunityEnabled } from "../../../../../../server/community/gate";
import {
  createCommunityThread,
  listCommunityContents,
} from "../../../../../../server/community/service";
import { readJson, safeJson } from "../../../../../../server/http";
import { communityUuidSchema } from "../../../../../../features/community/contracts";
import {
  discussionThreadCreateSchema,
  discussionListResponseSchema,
  discussionHttpMutation,
  parseDiscussionQuery,
  requireEmptyCommunityQuery,
  requireDiscussionScope,
  validatedCommunityResponse,
} from "../../../../../../features/community/http-contracts";

type Context = { params: Promise<{ workId: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  return safeJson("community.threads.list", async () => {
    requireCommunityEnabled();
    const { workId } = await context.params;
    const result = validatedCommunityResponse(
      discussionListResponseSchema,
      await listCommunityContents(
        workId,
        "THREAD",
        async () => {
          communityUuidSchema.parse(workId);
          return parseDiscussionQuery(request.url);
        },
        undefined,
        request.headers,
      ),
    );
    for (const item of result.items)
      requireDiscussionScope(item, workId, "THREAD");
    return result;
  });
}
export async function POST(request: Request, context: Context) {
  return safeJson("community.threads.create", async () => {
    requireCommunityEnabled();
    const { workId } = await context.params;
    return discussionHttpMutation(
      await createCommunityThread(
        workId,
        async () => {
          communityUuidSchema.parse(workId);
          requireEmptyCommunityQuery(request.url);
          return readJson(request, discussionThreadCreateSchema);
        },
        request.headers,
      ),
      workId,
      "THREAD",
    );
  });
}
