import { safeJson } from "../../../../../../server/http";
import { getMetadataTarget } from "../../../../../../server/catalog/metadata-suggestions";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  return safeJson("metadata-suggestions.target", async () =>
    getMetadataTarget((await context.params).slug, request.headers),
  );
}
