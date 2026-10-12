import { requireCommunityEnabled } from "../../../../server/community/gate";
import { listOwnedCommunityContents } from "../../../../server/community/service";
import { safeJson } from "../../../../server/http";
import {
  communityOwnedListResponseSchema,
  parseCommunityOwnedQuery,
  validatedCommunityResponse,
} from "../../../../features/community/http-contracts";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const response = await safeJson("community.owned.list", async () => {
    requireCommunityEnabled();
    return validatedCommunityResponse(
      communityOwnedListResponseSchema,
      await listOwnedCommunityContents(
        async () => parseCommunityOwnedQuery(request.url),
        request.headers,
      ),
    );
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
