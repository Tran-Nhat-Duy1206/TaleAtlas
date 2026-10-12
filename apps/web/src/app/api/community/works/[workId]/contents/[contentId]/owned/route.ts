import { requireCommunityEnabled } from "../../../../../../../../server/community/gate";
import { getOwnedCommunityContent } from "../../../../../../../../server/community/service";
import { safeJson } from "../../../../../../../../server/http";
import { communityUuidSchema } from "../../../../../../../../features/community/contracts";
import {
  communityOwnedSchema,
  parseCommunityOwnedContextQuery,
  requireDiscussionScope,
  validatedCommunityResponse,
} from "../../../../../../../../features/community/http-contracts";

type Context = { params: Promise<{ workId: string; contentId: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  const response = await safeJson("community.owned.context", async () => {
    requireCommunityEnabled();
    const { workId, contentId } = await context.params;
    let selectedKind: "THREAD" | "REPLY" | undefined;
    const content = await getOwnedCommunityContent(
      workId,
      contentId,
      async () => {
        communityUuidSchema.parse(workId);
        communityUuidSchema.parse(contentId);
        const query = parseCommunityOwnedContextQuery(request.url);
        selectedKind = query.contentKind;
        return query;
      },
      request.headers,
    );
    if (!selectedKind) throw new Error("Missing community owner selection");
    const result = validatedCommunityResponse(communityOwnedSchema, content);
    requireDiscussionScope(result, workId, selectedKind, contentId);
    return result;
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
