import { z } from "zod";
import {
  safeJson,
  readJson,
  requireTrustedOrigin,
} from "../../../../server/http";
import { requireSession } from "../../../../server/session";
import { amendStoryRequest } from "../../../../server/ingestion/service";
import { visibleStoryRequest } from "../../../../server/ingestion/request-public";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return safeJson("requests.get", async () => {
    await requireSession(request.headers);
    return visibleStoryRequest((await context.params).id, request.headers);
  });
}
export async function PATCH(request: Request, context: Context) {
  return safeJson("requests.amend", async () => {
    await requireSession(request.headers);
    requireTrustedOrigin(request);
    return amendStoryRequest(
      (await context.params).id,
      await readJson(request, z.unknown()),
      request.headers,
    );
  });
}
