import { requireCommunityEnabled } from "../../../../../../../../server/community/gate";
import {
  createCommunityReply,
  listCommunityContents,
} from "../../../../../../../../server/community/service";
import {
  HttpError,
  readJson,
  safeJson,
} from "../../../../../../../../server/http";
import { communityUuidSchema } from "../../../../../../../../features/community/contracts";
import {
  discussionReplyCreateSchema,
  discussionListResponseSchema,
  discussionHttpMutation,
  parseDiscussionQuery,
  requireEmptyCommunityQuery,
  requireDiscussionScope,
  validatedCommunityResponse,
} from "../../../../../../../../features/community/http-contracts";

type Context = { params: Promise<{ workId: string; threadId: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  return safeJson("community.replies.list", async () => {
    requireCommunityEnabled();
    const { workId, threadId } = await context.params;
    const result = validatedCommunityResponse(
      discussionListResponseSchema,
      await listCommunityContents(
        workId,
        "THREAD",
        async () => {
          communityUuidSchema.parse(workId);
          communityUuidSchema.parse(threadId);
          return parseDiscussionQuery(request.url);
        },
        threadId,
        request.headers,
      ),
    );
    for (const item of result.items)
      requireDiscussionScope(item, workId, "REPLY", undefined, threadId);
    return result;
  });
}
export async function POST(request: Request, context: Context) {
  return safeJson("community.replies.create", async () => {
    requireCommunityEnabled();
    const { workId, threadId } = await context.params;
    return discussionHttpMutation(
      await createCommunityReply(
        workId,
        async () => {
          communityUuidSchema.parse(workId);
          const routeThread = communityUuidSchema.parse(threadId);
          requireEmptyCommunityQuery(request.url);
          const input = await readJson(request, discussionReplyCreateSchema);
          if (input.threadId !== routeThread)
            throw new HttpError(400, "VALIDATION_ERROR");
          return input;
        },
        request.headers,
      ),
      workId,
      "REPLY",
      undefined,
      threadId,
    );
  });
}
