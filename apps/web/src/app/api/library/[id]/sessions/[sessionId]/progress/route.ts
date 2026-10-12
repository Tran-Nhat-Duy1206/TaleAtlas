import { safeJson } from "../../../../../../../server/http";
import { requireSession } from "../../../../../../../server/session";
import { readingProgressHistory } from "../../../../../../../server/library/service";
import { historyQuerySchema } from "../../../../../../../features/library/contracts";
import { strictLibrarySearchParams } from "../../../../../../../features/library/http-contracts";
import { readingHttpProgressEvent } from "../../../../../../../features/library/reading-http-contracts";

type Context = { params: Promise<{ id: string; sessionId: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  return safeJson("library.reading.progress-history", async () => {
    await requireSession(request.headers);
    const query = strictLibrarySearchParams(request.url);
    historyQuerySchema.parse(query);
    const { id, sessionId } = await context.params;
    const page = await readingProgressHistory(
      id,
      sessionId,
      query,
      request.headers,
    );
    return {
      items: page.items.map(readingHttpProgressEvent),
      nextBeforeRevision: page.nextBeforeRevision,
    };
  });
}
