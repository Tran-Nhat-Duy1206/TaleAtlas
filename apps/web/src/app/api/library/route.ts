import { z } from "zod";
import { readJson, requireTrustedOrigin, safeJson } from "../../../server/http";
import { requireSession } from "../../../server/session";
import {
  addLibraryEntry,
  listLibraryEntries,
} from "../../../server/library/service";
import {
  libraryHttpEntry,
  libraryDetailQuerySchema,
  strictLibrarySearchParams,
} from "../../../features/library/http-contracts";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return safeJson("library.list", async () => {
    await requireSession(request.headers);
    const result = await listLibraryEntries(
      strictLibrarySearchParams(request.url),
      request.headers,
    );
    return { ...result, items: result.items.map(libraryHttpEntry) };
  });
}
export async function POST(request: Request) {
  return safeJson("library.add", async () => {
    await requireSession(request.headers);
    return libraryHttpEntry(
      await addLibraryEntry(async () => {
        requireTrustedOrigin(request);
        libraryDetailQuerySchema.parse(strictLibrarySearchParams(request.url));
        return readJson(request, z.unknown());
      }, request.headers),
    );
  });
}
