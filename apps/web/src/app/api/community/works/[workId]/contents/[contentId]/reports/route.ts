import type { z } from "zod";
import { requireCommunityEnabled } from "../../../../../../../../server/community/gate";
import { reportCommunityContent } from "../../../../../../../../server/community/service";
import { readJson, safeJson } from "../../../../../../../../server/http";
import { communityUuidSchema } from "../../../../../../../../features/community/contracts";
import { requireEmptyCommunityQuery } from "../../../../../../../../features/community/http-contracts";
import {
  reportCreateSchema,
  communityHttpCommand,
} from "../../../../../../../../features/community/moderation-http-contracts";
type Context = { params: Promise<{ workId: string; contentId: string }> };
export const runtime = "nodejs";
export async function POST(request: Request, context: Context) {
  const response = await safeJson("community.reports.create", async () => {
    requireCommunityEnabled();
    const { workId, contentId } = await context.params;
    let selection: z.infer<typeof reportCreateSchema> | undefined;
    const result = await reportCommunityContent(
      workId,
      contentId,
      async () => {
        communityUuidSchema.parse(workId);
        communityUuidSchema.parse(contentId);
        requireEmptyCommunityQuery(request.url);
        selection = await readJson(request, reportCreateSchema);
        return selection;
      },
      request.headers,
    );
    if (!selection) throw new Error("Missing report command selection");
    return communityHttpCommand(result, workId, contentId, selection, "REPORT");
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
