import { requireCommunityEnabled } from "../../../../../../../../../server/community/gate";
import { listCommunityModerationHistory } from "../../../../../../../../../server/community/service";
import { safeJson } from "../../../../../../../../../server/http";
import { validatedCommunityResponse } from "../../../../../../../../../features/community/http-contracts";
import {
  moderationHistoryResponseSchema,
  parseModerationHistoryQuery,
  requireModerationScope,
} from "../../../../../../../../../features/community/moderation-http-contracts";
type Context = { params: Promise<{ workId: string; contentId: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  const response = await safeJson("community.moderation.history", async () => {
    requireCommunityEnabled();
    const { workId, contentId } = await context.params;
    let selection: ReturnType<typeof parseModerationHistoryQuery> | undefined;
    const result = validatedCommunityResponse(
      moderationHistoryResponseSchema,
      await listCommunityModerationHistory(
        workId,
        contentId,
        async () => {
          selection = parseModerationHistoryQuery(request.url);
          return selection;
        },
        request.headers,
      ),
    );
    if (!selection) throw new Error("Missing moderation history selection");
    requireModerationScope(result.content, workId, contentId, selection.kind);
    if (
      result.content.revision !== selection.expectedRevision ||
      result.stream !== selection.stream
    )
      throw new Error("Invalid moderation history response scope");
    return result;
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
