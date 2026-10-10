import { z } from "zod";
import {
  safeJson,
  readJson,
  requireTrustedOrigin,
} from "../../../../../server/http";
import { requireSession } from "../../../../../server/session";
import {
  supportStoryRequest,
  unsupportStoryRequest,
} from "../../../../../server/ingestion/request-public";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return safeJson("requests.support", async () => {
    await requireSession(request.headers);
    requireTrustedOrigin(request);
    return supportStoryRequest(
      (await context.params).id,
      await readJson(request, z.unknown()),
      request.headers,
    );
  });
}
export async function DELETE(request: Request, context: Context) {
  return safeJson("requests.unsupport", async () => {
    await requireSession(request.headers);
    requireTrustedOrigin(request);
    return unsupportStoryRequest((await context.params).id, request.headers);
  });
}
