import { z } from "zod";
import { updateWorkSchema } from "@/features/catalog/contracts";
import { adminGetWork, updateWork } from "@/server/catalog/service";
import { requireRole } from "@/server/session";
import {
  safeJson,
  readJson,
  requireTrustedOrigin,
  limitCatalogMutation,
} from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return safeJson("catalog.admin.detail", async () => {
    await requireRole(["admin"], request.headers);
    return adminGetWork(
      z.uuid().parse((await context.params).id),
      request.headers,
    );
  });
}
export function PATCH(request: Request, context: Context) {
  return safeJson("catalog.admin.update", async () => {
    const session = await requireRole(["admin"], request.headers);
    requireTrustedOrigin(request);
    await limitCatalogMutation(session.user.id);
    const id = z.uuid().parse((await context.params).id);
    return updateWork(
      id,
      await readJson(request, updateWorkSchema),
      request.headers,
    );
  });
}
