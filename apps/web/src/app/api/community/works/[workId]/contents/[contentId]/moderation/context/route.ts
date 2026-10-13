import type { z } from "zod";
import { requireCommunityEnabled } from "../../../../../../../../../server/community/gate";
import { getCommunityModerationEvidence } from "../../../../../../../../../server/community/service";
import {
  readJson,
  safeJson,
  HttpError,
} from "../../../../../../../../../server/http";
import { communityUuidSchema } from "../../../../../../../../../features/community/contracts";
import { requireEmptyCommunityQuery } from "../../../../../../../../../features/community/http-contracts";
import {
  moderationEvidenceInputSchema,
  moderationHttpEvidence,
} from "../../../../../../../../../features/community/moderation-http-contracts";
type Context = { params: Promise<{ workId: string; contentId: string }> };
export const runtime = "nodejs";
export async function POST(request: Request, context: Context) {
  const response = await safeJson("community.moderation.evidence", async () => {
    requireCommunityEnabled();
    const { workId, contentId } = await context.params;
    let selection: z.infer<typeof moderationEvidenceInputSchema> | undefined;
    const result = await getCommunityModerationEvidence(async () => {
      const work = communityUuidSchema.parse(workId),
        target = communityUuidSchema.parse(contentId);
      requireEmptyCommunityQuery(request.url);
      selection = await readJson(request, moderationEvidenceInputSchema);
      if (selection.workId !== work || selection.targetId !== target)
        throw new HttpError(400, "VALIDATION_ERROR");
      return selection;
    }, request.headers);
    if (!selection) throw new Error("Missing moderation evidence selection");
    return moderationHttpEvidence(result, selection);
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
