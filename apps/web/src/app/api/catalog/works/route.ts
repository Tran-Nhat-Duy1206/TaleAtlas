import { catalogQuerySchema } from "@/features/catalog/contracts";
import { listWorks } from "@/server/catalog/service";
import { safeJson } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return safeJson("catalog.search", async () =>
    listWorks(
      catalogQuerySchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    ),
  );
}
