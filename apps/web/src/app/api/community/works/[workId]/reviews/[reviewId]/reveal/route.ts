import type { z } from "zod";
import { requireCommunityEnabled } from "../../../../../../../../server/community/gate";
import { revealCommunityContent } from "../../../../../../../../server/community/service";
import {
  HttpError,
  readJson,
  safeJson,
} from "../../../../../../../../server/http";
import { communityUuidSchema } from "../../../../../../../../features/community/contracts";
import { requireEmptyCommunityQuery } from "../../../../../../../../features/community/http-contracts";
import {
  reviewRevealSchema,
  reviewHttpReveal,
} from "../../../../../../../../features/community/review-http-contracts";
type Context = { params: Promise<{ workId: string; reviewId: string }> };
export const runtime = "nodejs";
export async function POST(request: Request, context: Context) {
  return safeJson("community.reviews.reveal", async () => {
    requireCommunityEnabled();
    const { workId, reviewId } = await context.params;
    let selection: z.infer<typeof reviewRevealSchema> | undefined;
    const result = await revealCommunityContent(async () => {
      const routeWork = communityUuidSchema.parse(workId),
        routeTarget = communityUuidSchema.parse(reviewId);
      requireEmptyCommunityQuery(request.url);
      selection = await readJson(request, reviewRevealSchema);
      if (selection.workId !== routeWork || selection.targetId !== routeTarget)
        throw new HttpError(400, "VALIDATION_ERROR");
      return selection;
    }, request.headers);
    if (!selection) throw new Error("Missing review reveal selection");
    return reviewHttpReveal(result, selection);
  });
}
