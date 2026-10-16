import { requireCommunityEnabled } from "../../../../../../server/community/gate";
import { getOwnedCommunityReport } from "../../../../../../server/community/service";
import { safeJson } from "../../../../../../server/http";
import { communityUuidSchema } from "../../../../../../features/community/contracts";
import { validatedCommunityResponse } from "../../../../../../features/community/http-contracts";
import {
  ownedReportSchema,
  parseOwnedReportDetailQuery,
} from "../../../../../../features/community/moderation-http-contracts";
type Context = { params: Promise<{ reportId: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  const response = await safeJson(
    "community.reports.owned.detail",
    async () => {
      requireCommunityEnabled();
      const { reportId } = await context.params;
      const result = validatedCommunityResponse(
        ownedReportSchema,
        await getOwnedCommunityReport(
          reportId,
          async () => parseOwnedReportDetailQuery(request.url),
          request.headers,
        ),
      );
      if (result.id !== communityUuidSchema.parse(reportId))
        throw new Error("Invalid report owner response scope");
      return result;
    },
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
