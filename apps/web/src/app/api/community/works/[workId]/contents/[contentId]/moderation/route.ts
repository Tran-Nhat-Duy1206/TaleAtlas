import type { z } from "zod";
import { requireCommunityEnabled } from "../../../../../../../../server/community/gate";
import { moderateCommunityContent } from "../../../../../../../../server/community/service";
import { readJson, safeJson } from "../../../../../../../../server/http";
import { communityUuidSchema } from "../../../../../../../../features/community/contracts";
import { requireEmptyCommunityQuery } from "../../../../../../../../features/community/http-contracts";
import {
  moderationCommandSchema,
  communityHttpCommand,
} from "../../../../../../../../features/community/moderation-http-contracts";
type Context = { params: Promise<{ workId: string; contentId: string }> };
export const runtime = "nodejs";
export async function POST(request: Request, context: Context) {
  const response = await safeJson("community.moderation.command", async () => {
    requireCommunityEnabled();
    const { workId, contentId } = await context.params;
    let selection: z.infer<typeof moderationCommandSchema> | undefined;
    const result = await moderateCommunityContent(
      workId,
      contentId,
      async () => {
        communityUuidSchema.parse(workId);
        communityUuidSchema.parse(contentId);
        requireEmptyCommunityQuery(request.url);
        selection = await readJson(request, moderationCommandSchema);
        return selection;
      },
      request.headers,
    );
    if (!selection) throw new Error("Missing moderation command selection");
    return communityHttpCommand(
      result,
      workId,
      contentId,
      selection,
      "MODERATION",
    );
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
