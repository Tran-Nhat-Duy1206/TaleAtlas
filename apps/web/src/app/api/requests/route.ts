import { z } from "zod";
import { safeJson, readJson, requireTrustedOrigin } from "../../../server/http";
import { requireSession } from "../../../server/session";
import {
  createStoryRequest,
  myStoryRequests,
} from "../../../server/ingestion/service";
export async function GET(request: Request) {
  return safeJson("requests.list", async () => {
    await requireSession(request.headers);
    const u = new URL(request.url);
    return myStoryRequests(Object.fromEntries(u.searchParams), request.headers);
  });
}
export async function POST(request: Request) {
  return safeJson("requests.create", async () => {
    await requireSession(request.headers);
    requireTrustedOrigin(request);
    return createStoryRequest(
      await readJson(request, z.unknown()),
      request.headers,
    );
  });
}
