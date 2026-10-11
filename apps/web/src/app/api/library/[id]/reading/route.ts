import { safeJson } from "../../../../../server/http";
import { requireSession } from "../../../../../server/session";
import { getLibraryEntry } from "../../../../../server/library/service";
import {
  libraryDetailQuerySchema,
  strictLibrarySearchParams,
} from "../../../../../features/library/http-contracts";
import { readingHttpEntry } from "../../../../../features/library/reading-http-contracts";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  return safeJson("library.reading.detail", async () => {
    await requireSession(request.headers);
    const query = libraryDetailQuerySchema.parse(
      strictLibrarySearchParams(request.url),
    );
    return readingHttpEntry(
      await getLibraryEntry(
        (await context.params).id,
        request.headers,
        query.locale,
      ),
    );
  });
}
