import { z } from "zod";
import {
  safeJson,
  readJson,
  requireTrustedOrigin,
} from "../../../../../../server/http";
import { requireRole } from "../../../../../../server/session";
import { reviewStoryRequest } from "../../../../../../server/ingestion/moderation";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return safeJson("requests.review", async () => {
    await requireRole(["admin"], request.headers);
    requireTrustedOrigin(request);
    const { id } = await context.params;
    return reviewStoryRequest(
      id,
      await readJson(request, z.unknown(), 65536),
      request.headers,
    );
  });
}
