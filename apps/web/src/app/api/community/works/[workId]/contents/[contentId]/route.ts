import { requireCommunityEnabled } from "../../../../../../../server/community/gate";
import { editCommunityContent } from "../../../../../../../server/community/service";
import { readJson, safeJson } from "../../../../../../../server/http";
import { communityUuidSchema } from "../../../../../../../features/community/contracts";
import {
  discussionEditSchema,
  discussionHttpMutation,
  requireEmptyCommunityQuery,
} from "../../../../../../../features/community/http-contracts";

type Context = { params: Promise<{ workId: string; contentId: string }> };
export const runtime = "nodejs";
export async function PATCH(request: Request, context: Context) {
  return safeJson("community.contents.edit", async () => {
    requireCommunityEnabled();
    const { workId, contentId } = await context.params;
    let selectedKind: "THREAD" | "REPLY" | undefined;
    const result = await editCommunityContent(
      workId,
      contentId,
      async () => {
        communityUuidSchema.parse(workId);
        communityUuidSchema.parse(contentId);
        requireEmptyCommunityQuery(request.url);
        const input = await readJson(request, discussionEditSchema);
        selectedKind = input.contentKind;
        return input;
      },
      request.headers,
    );
    if (!selectedKind) throw new Error("Missing community mutation selection");
    return discussionHttpMutation(result, workId, selectedKind, contentId);
  });
}
