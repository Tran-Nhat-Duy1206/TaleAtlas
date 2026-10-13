import { requireCommunityEnabled } from "../../../../../server/community/gate";
import { listCommunityModerationReports } from "../../../../../server/community/service";
import { safeJson } from "../../../../../server/http";
import { validatedCommunityResponse } from "../../../../../features/community/http-contracts";
import {
  moderationQueueResponseSchema,
  parseModerationQueueQuery,
} from "../../../../../features/community/moderation-http-contracts";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const response = await safeJson("community.moderation.queue", async () => {
    requireCommunityEnabled();
    return validatedCommunityResponse(
      moderationQueueResponseSchema,
      await listCommunityModerationReports(
        async () => parseModerationQueueQuery(request.url),
        request.headers,
      ),
    );
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
