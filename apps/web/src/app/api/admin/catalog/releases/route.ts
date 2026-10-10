import { z } from "zod";
import {
  safeJson,
  requireTrustedOrigin,
  readJson,
} from "../../../../../server/http";
import { requireRole } from "../../../../../server/session";
import { recordVerifiedRelease } from "../../../../../server/catalog/discovery";
export async function POST(request: Request) {
  return safeJson("catalog.release.record", async () => {
    await requireRole(["admin"], request.headers);
    requireTrustedOrigin(request);
    return recordVerifiedRelease(
      await readJson(request, z.unknown(), 65536),
      request.headers,
    );
  });
}
