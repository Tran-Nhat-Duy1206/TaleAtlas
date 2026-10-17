import {
  safeJson,
  requireTrustedOrigin,
  readJson,
} from "../../../../../../server/http";
import { reviewMetadataSuggestion } from "../../../../../../server/catalog/metadata-suggestions";
import { reviewMetadataProposalSchema } from "../../../../../../features/catalog/metadata-operations";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return safeJson("metadata-suggestions.review", async () => {
    requireTrustedOrigin(request);
    return reviewMetadataSuggestion(
      (await context.params).id,
      () => readJson(request, reviewMetadataProposalSchema, 65536),
      request.headers,
    );
  });
}
