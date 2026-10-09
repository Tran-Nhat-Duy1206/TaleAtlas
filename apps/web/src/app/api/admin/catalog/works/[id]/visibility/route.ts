import { z } from "zod";
import { visibilityInputSchema } from "@/features/catalog/contracts";
import { setVisibility } from "@/server/catalog/service";
import { requireRole } from "@/server/session";
import {
  safeJson,
  readJson,
  requireTrustedOrigin,
  limitCatalogMutation,
} from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return safeJson("catalog.admin.visibility", async () => {
    const session = await requireRole(["admin"], request.headers);
    requireTrustedOrigin(request);
    await limitCatalogMutation(session.user.id);
    return setVisibility(
      z.uuid().parse((await context.params).id),
      await readJson(request, visibilityInputSchema),
      request.headers,
    );
  });
}
