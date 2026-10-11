import { z } from "zod";
import {
  readJson,
  requireTrustedOrigin,
  safeJson,
} from "../../../../server/http";
import { requireSession } from "../../../../server/session";
import {
  getLibraryEntry,
  removeLibraryEntry,
  updateLibraryEntry,
} from "../../../../server/library/service";
import {
  libraryDetailQuerySchema,
  libraryHttpEntry,
  libraryHttpPatchSchema,
  strictLibrarySearchParams,
} from "../../../../features/library/http-contracts";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  return safeJson("library.detail", async () => {
    await requireSession(request.headers);
    const query = libraryDetailQuerySchema.parse(
      strictLibrarySearchParams(request.url),
    );
    return libraryHttpEntry(
      await getLibraryEntry(
        (await context.params).id,
        request.headers,
        query.locale,
      ),
    );
  });
}
export async function PATCH(request: Request, context: Context) {
  return safeJson("library.update", async () => {
    await requireSession(request.headers);
    return libraryHttpEntry(
      await updateLibraryEntry(
        (await context.params).id,
        async () => {
          requireTrustedOrigin(request);
          libraryDetailQuerySchema.parse(
            strictLibrarySearchParams(request.url),
          );
          return libraryHttpPatchSchema.parse(
            await readJson(request, z.unknown()),
          );
        },
        request.headers,
      ),
    );
  });
}
export async function DELETE(request: Request, context: Context) {
  return safeJson("library.remove", async () => {
    await requireSession(request.headers);
    return libraryHttpEntry(
      await removeLibraryEntry(
        (await context.params).id,
        async () => {
          requireTrustedOrigin(request);
          libraryDetailQuerySchema.parse(
            strictLibrarySearchParams(request.url),
          );
          return readJson(request, z.unknown());
        },
        request.headers,
      ),
    );
  });
}
