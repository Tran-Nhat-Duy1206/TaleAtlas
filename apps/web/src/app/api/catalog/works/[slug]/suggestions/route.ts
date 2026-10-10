import { z } from "zod";
import {
  safeJson,
  requireTrustedOrigin,
  readJson,
} from "../../../../../../server/http";
import { submitEditSuggestion } from "../../../../../../server/catalog/edit-suggestions";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  return safeJson("suggestions.submit", async () => {
    requireTrustedOrigin(request);
    // Existing dynamic segment name is slug; this endpoint deliberately requires a work UUID.
    const { slug } = await context.params;
    return submitEditSuggestion(
      slug,
      () => readJson(request, z.unknown()),
      request.headers,
    );
  });
}
