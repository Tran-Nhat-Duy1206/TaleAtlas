import {
  readJson,
  requireTrustedOrigin,
  safeJson,
} from "../../../../../server/http";
import { requireSession } from "../../../../../server/session";
import { recordReadingProgress } from "../../../../../server/library/service";
import { readingProgressSchema } from "../../../../../features/library/contracts";
import {
  libraryDetailQuerySchema,
  strictLibrarySearchParams,
} from "../../../../../features/library/http-contracts";
import { readingHttpEntry } from "../../../../../features/library/reading-http-contracts";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function POST(request: Request, context: Context) {
  return safeJson("library.reading.progress", async () => {
    await requireSession(request.headers);
    return readingHttpEntry(
      await recordReadingProgress(
        (await context.params).id,
        async () => {
          requireTrustedOrigin(request);
          libraryDetailQuerySchema.parse(
            strictLibrarySearchParams(request.url),
          );
          return readJson(request, readingProgressSchema);
        },
        request.headers,
      ),
    );
  });
}
