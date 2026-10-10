import { safeJson } from "../../../../server/http";
import { requireRole } from "../../../../server/session";
import { adminIngestion } from "../../../../server/ingestion/candidates";

export async function GET(request: Request) {
  return safeJson("ingestion.list", async () => {
    await requireRole(["admin"], request.headers);
    const params = new URL(request.url).searchParams;
    return adminIngestion(Object.fromEntries(params), request.headers);
  });
}
