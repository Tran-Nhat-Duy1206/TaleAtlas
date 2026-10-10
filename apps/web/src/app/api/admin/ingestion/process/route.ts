import { z } from "zod";
import {
  safeJson,
  readJson,
  requireTrustedOrigin,
} from "../../../../../server/http";
import { requireRole } from "../../../../../server/session";
import { processIngestion } from "../../../../../server/ingestion/processor";

export async function POST(request: Request) {
  return safeJson("ingestion.process", async () => {
    await requireRole(["admin"], request.headers);
    requireTrustedOrigin(request);
    return processIngestion(
      await readJson(request, z.unknown(), 65536),
      request.headers,
    );
  });
}
