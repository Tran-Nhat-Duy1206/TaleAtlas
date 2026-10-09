import { safeJson } from "../../../../server/http";
import { requireSession } from "../../../../server/session";
import { myFollowedStoryRequests } from "../../../../server/ingestion/request-public";
export async function GET(request: Request) {
  return safeJson("requests.following", async () => {
    await requireSession(request.headers);
    return myFollowedStoryRequests(
      Object.fromEntries(new URL(request.url).searchParams),
      request.headers,
    );
  });
}
