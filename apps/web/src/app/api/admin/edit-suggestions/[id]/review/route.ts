import { z } from "zod";
import {
  safeJson,
  requireTrustedOrigin,
  readJson,
} from "../../../../../../server/http";
import { reviewEditSuggestion } from "../../../../../../server/catalog/edit-suggestions";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return safeJson("suggestions.review", async () => {
    requireTrustedOrigin(request);
    return reviewEditSuggestion(
      (await context.params).id,
      () => readJson(request, z.unknown()),
      request.headers,
    );
  });
}
