import { safeJson } from "../../../../server/http";
import { listEditSuggestions } from "../../../../server/catalog/edit-suggestions";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return safeJson("suggestions.admin", () =>
    listEditSuggestions(
      Object.fromEntries(new URL(request.url).searchParams),
      request.headers,
      true,
    ),
  );
}
