import {
  catalogQuerySchema,
  workInputSchema,
} from "@/features/catalog/contracts";
import { adminListWorks, createWork } from "@/server/catalog/service";
import { requireRole } from "@/server/session";
import {
  safeJson,
  readJson,
  requireTrustedOrigin,
  limitCatalogMutation,
} from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return safeJson("catalog.admin.list", async () => {
    await requireRole(["admin"], request.headers);
    return adminListWorks(
      catalogQuerySchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
      request.headers,
    );
  });
}
export function POST(request: Request) {
  return safeJson("catalog.admin.create", async () => {
    const session = await requireRole(["admin"], request.headers);
    requireTrustedOrigin(request);
    await limitCatalogMutation(session.user.id);
    return createWork(
      await readJson(request, workInputSchema),
      request.headers,
    );
  });
}
