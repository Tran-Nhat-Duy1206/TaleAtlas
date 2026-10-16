import { requireCommunityEnabled } from "../../../../../../../../../server/community/gate";
import { getCommunityModerationMetadata } from "../../../../../../../../../server/community/service";
import { safeJson } from "../../../../../../../../../server/http";
import { validatedCommunityResponse } from "../../../../../../../../../features/community/http-contracts";
import {
  moderationTargetSchema,
  parseModerationMetadataQuery,
  requireModerationScope,
} from "../../../../../../../../../features/community/moderation-http-contracts";
import type { CommunityContentKind } from "@taleatlas/database/community-types";
type Context = { params: Promise<{ workId: string; contentId: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  const response = await safeJson("community.moderation.metadata", async () => {
    requireCommunityEnabled();
    const { workId, contentId } = await context.params;
    let kind: CommunityContentKind | undefined;
    const result = validatedCommunityResponse(
      moderationTargetSchema,
      await getCommunityModerationMetadata(
        workId,
        contentId,
        async () => {
          const query = parseModerationMetadataQuery(request.url);
          kind = query.kind;
          return query;
        },
        request.headers,
      ),
    );
    if (!kind) throw new Error("Missing moderation metadata selection");
    requireModerationScope(result, workId, contentId, kind);
    return result;
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
