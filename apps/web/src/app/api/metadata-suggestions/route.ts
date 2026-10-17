import { safeJson } from "../../../server/http";
import { listMetadataSuggestions } from "../../../server/catalog/metadata-suggestions";
import { metadataSuggestionPageSchema } from "../../../features/catalog/metadata-suggestion-contracts";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return safeJson("metadata-suggestions.owned", () =>
    listMetadataSuggestions(
      metadataSuggestionPageSchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
      request.headers,
    ),
  );
}
