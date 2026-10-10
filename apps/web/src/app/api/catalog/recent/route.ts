import { safeJson } from "../../../../server/http";
import { recentlyAdded } from "../../../../server/catalog/discovery";
export async function GET(request: Request) {
  return safeJson("catalog.recent", () =>
    recentlyAdded(Object.fromEntries(new URL(request.url).searchParams)),
  );
}
