import { z } from "zod";
import {
  safeJson,
  readJson,
  requireTrustedOrigin,
} from "../../../../../../server/http";
import { requireRole } from "../../../../../../server/session";
import { reviewRequestSummary } from "../../../../../../server/ingestion/request-public";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return safeJson("requests.summary", async () => {
    await requireRole(["admin"], request.headers);
    requireTrustedOrigin(request);
    return reviewRequestSummary(
      (await context.params).id,
      await readJson(request, z.unknown()),
      request.headers,
    );
  });
}
