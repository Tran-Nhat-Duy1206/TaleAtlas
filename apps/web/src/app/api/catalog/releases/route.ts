import { safeJson } from "../../../../server/http";
import { verifiedReleases } from "../../../../server/catalog/discovery";
export async function GET(request: Request) {
  return safeJson("catalog.releases", () =>
    verifiedReleases(Object.fromEntries(new URL(request.url).searchParams)),
  );
}
