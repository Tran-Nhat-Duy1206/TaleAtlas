import { z } from "zod";
import { safeJson } from "../../../../../server/http";
import { requireSession } from "../../../../../server/session";
import { getOwnWorkLibraryState } from "../../../../../server/library/service";
import { strictLibrarySearchParams } from "../../../../../features/library/http-contracts";

export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ workId: string }> },
) {
  return safeJson("library.work-state", async () => {
    await requireSession(request.headers);
    z.object({}).strict().parse(strictLibrarySearchParams(request.url));
    return getOwnWorkLibraryState(
      (await context.params).workId,
      request.headers,
    );
  });
}
