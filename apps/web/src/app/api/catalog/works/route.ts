import { parseCatalogSearchParams } from "@/features/catalog/contracts";
import { listWorks } from "@/server/catalog/service";
import { safeJson } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return safeJson("catalog.search", async () =>
    listWorks(parseCatalogSearchParams(new URL(request.url).searchParams)),
  );
}
