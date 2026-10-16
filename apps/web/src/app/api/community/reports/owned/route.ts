import { requireCommunityEnabled } from "../../../../../server/community/gate";
import { listOwnedCommunityReports } from "../../../../../server/community/service";
import { safeJson } from "../../../../../server/http";
import { validatedCommunityResponse } from "../../../../../features/community/http-contracts";
import {
  ownedReportListResponseSchema,
  parseOwnedReportQuery,
} from "../../../../../features/community/moderation-http-contracts";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const response = await safeJson("community.reports.owned.list", async () => {
    requireCommunityEnabled();
    return validatedCommunityResponse(
      ownedReportListResponseSchema,
      await listOwnedCommunityReports(
        async () => parseOwnedReportQuery(request.url),
        request.headers,
      ),
    );
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
