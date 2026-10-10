import { safeJson } from "../../../../server/http";
import { getOwnedEditSuggestion } from "../../../../server/catalog/edit-suggestions";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return safeJson("suggestions.detail", async () =>
    getOwnedEditSuggestion((await context.params).id, request.headers),
  );
}
