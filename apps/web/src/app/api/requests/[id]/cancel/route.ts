import { z } from "zod";
import {
  safeJson,
  readJson,
  requireTrustedOrigin,
} from "../../../../../server/http";
import { requireSession } from "../../../../../server/session";
import { cancelStoryRequest } from "../../../../../server/ingestion/service";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return safeJson("requests.cancel", async () => {
    await requireSession(request.headers);
    requireTrustedOrigin(request);
    return cancelStoryRequest(
      (await context.params).id,
      await readJson(request, z.unknown()),
      request.headers,
    );
  });
}
