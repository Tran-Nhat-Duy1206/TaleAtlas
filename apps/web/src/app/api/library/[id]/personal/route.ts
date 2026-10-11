import {
  readJson,
  requireTrustedOrigin,
  safeJson,
} from "../../../../../server/http";
import { requireSession } from "../../../../../server/session";
import {
  getLibraryEntry,
  updateLibraryEntry,
} from "../../../../../server/library/service";
import {
  libraryDetailQuerySchema,
  strictLibrarySearchParams,
} from "../../../../../features/library/http-contracts";
import {
  personalHttpEntry,
  personalHttpPatchSchema,
} from "../../../../../features/library/personal-http-contracts";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  return safeJson("library.personal.detail", async () => {
    await requireSession(request.headers);
    const query = libraryDetailQuerySchema.parse(
      strictLibrarySearchParams(request.url),
    );
    return personalHttpEntry(
      await getLibraryEntry(
        (await context.params).id,
        request.headers,
        query.locale,
      ),
    );
  });
}
export async function PATCH(request: Request, context: Context) {
  return safeJson("library.personal.update", async () => {
    await requireSession(request.headers);
    return personalHttpEntry(
      await updateLibraryEntry(
        (await context.params).id,
        async () => {
          requireTrustedOrigin(request);
          libraryDetailQuerySchema.parse(
            strictLibrarySearchParams(request.url),
          );
          return readJson(request, personalHttpPatchSchema);
        },
        request.headers,
      ),
    );
  });
}
