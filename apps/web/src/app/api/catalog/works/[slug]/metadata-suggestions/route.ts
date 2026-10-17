import {
  safeJson,
  requireTrustedOrigin,
  readJson,
} from "../../../../../../server/http";
import { submitMetadataSuggestion } from "../../../../../../server/catalog/metadata-suggestions";
import { submitMetadataProposalSchema } from "../../../../../../features/catalog/metadata-operations";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  return safeJson("metadata-suggestions.submit", async () => {
    requireTrustedOrigin(request);
    // Keep the existing segment name; the service requires a Work UUID, not a public slug.
    return submitMetadataSuggestion(
      (await context.params).slug,
      () => readJson(request, submitMetadataProposalSchema, 65536),
      request.headers,
    );
  });
}
