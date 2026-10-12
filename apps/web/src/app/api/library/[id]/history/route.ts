import { safeJson } from "../../../../../server/http";
import { requireSession } from "../../../../../server/session";
import { libraryEntryHistory } from "../../../../../server/library/service";
import { historyQuerySchema } from "../../../../../features/library/contracts";
import { strictLibrarySearchParams } from "../../../../../features/library/http-contracts";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  return safeJson("library.reading.entry-history", async () => {
    await requireSession(request.headers);
    const query = strictLibrarySearchParams(request.url);
    historyQuerySchema.parse(query);
    const page = await libraryEntryHistory(
      (await context.params).id,
      query,
      request.headers,
    );
    return {
      items: page.items.map((event) => ({
        id: event.id,
        revision: event.revision,
        kind: event.kind,
        recordedAt: event.recordedAt,
      })),
      nextBeforeRevision: page.nextBeforeRevision,
    };
  });
}
