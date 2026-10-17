import { safeJson } from "../../../../server/http";
import { getMetadataSuggestion } from "../../../../server/catalog/metadata-suggestions";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return safeJson("metadata-suggestions.detail", async () =>
    getMetadataSuggestion((await context.params).id, request.headers),
  );
}
