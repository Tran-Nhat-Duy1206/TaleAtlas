import type { z } from "zod";
import { requireCommunityEnabled } from "../../../../../../../../server/community/gate";
import { revealCommunityContent } from "../../../../../../../../server/community/service";
import {
  HttpError,
  readJson,
  safeJson,
} from "../../../../../../../../server/http";
import { communityUuidSchema } from "../../../../../../../../features/community/contracts";
import {
  discussionRevealSchema,
  discussionHttpReveal,
  requireEmptyCommunityQuery,
} from "../../../../../../../../features/community/http-contracts";

type Context = { params: Promise<{ workId: string; contentId: string }> };
export const runtime = "nodejs";
export async function POST(request: Request, context: Context) {
  return safeJson("community.contents.reveal", async () => {
    requireCommunityEnabled();
    const { workId, contentId } = await context.params;
    let selection: z.infer<typeof discussionRevealSchema> | undefined;
    const result = await revealCommunityContent(async () => {
      const routeWork = communityUuidSchema.parse(workId);
      const routeTarget = communityUuidSchema.parse(contentId);
      requireEmptyCommunityQuery(request.url);
      selection = await readJson(request, discussionRevealSchema);
      if (selection.workId !== routeWork || selection.targetId !== routeTarget)
        throw new HttpError(400, "VALIDATION_ERROR");
      return selection;
    }, request.headers);
    if (!selection) throw new Error("Missing community reveal selection");
    return discussionHttpReveal(result, selection);
  });
}
