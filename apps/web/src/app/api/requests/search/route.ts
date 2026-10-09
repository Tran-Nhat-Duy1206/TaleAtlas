import { safeJson } from "../../../../server/http";
import { requireSession } from "../../../../server/session";
import { findRequestSummaries } from "../../../../server/ingestion/request-public";
export async function GET(request: Request) {
  return safeJson("requests.search", async () => {
    await requireSession(request.headers);
    return findRequestSummaries(
      Object.fromEntries(new URL(request.url).searchParams),
      request.headers,
    );
  });
}
