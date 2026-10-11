import {
  readJson,
  requireTrustedOrigin,
  safeJson,
} from "../../../../../server/http";
import { requireSession } from "../../../../../server/session";
import {
  readingSessionAction,
  readingSessionHistory,
} from "../../../../../server/library/service";
import { historyQuerySchema } from "../../../../../features/library/contracts";
import {
  libraryDetailQuerySchema,
  strictLibrarySearchParams,
} from "../../../../../features/library/http-contracts";
import {
  readingHttpEntry,
  readingHttpSession,
  readingHttpSessionActionSchema,
} from "../../../../../features/library/reading-http-contracts";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  return safeJson("library.reading.sessions", async () => {
    await requireSession(request.headers);
    const query = strictLibrarySearchParams(request.url);
    historyQuerySchema.parse(query);
    const page = await readingSessionHistory(
      (await context.params).id,
      query,
      request.headers,
    );
    return {
      items: page.items.map(readingHttpSession),
      nextBeforeSequence: page.nextBeforeSequence,
    };
  });
}
export async function POST(request: Request, context: Context) {
  return safeJson("library.reading.session-action", async () => {
    await requireSession(request.headers);
    return readingHttpEntry(
      await readingSessionAction(
        (await context.params).id,
        async () => {
          requireTrustedOrigin(request);
          libraryDetailQuerySchema.parse(
            strictLibrarySearchParams(request.url),
          );
          return readJson(request, readingHttpSessionActionSchema);
        },
        request.headers,
      ),
    );
  });
}
