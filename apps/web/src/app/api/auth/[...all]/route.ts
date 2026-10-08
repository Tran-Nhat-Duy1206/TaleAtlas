import { getAuth } from "../../../../server/auth";
import { logServerError } from "../../../../server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  try {
    const response = await getAuth().handler(request);
    if (response.status >= 500) {
      logServerError("auth.backend", null);
      return Response.json(
        { error: "Authentication service unavailable" },
        {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
    return response;
  } catch (error) {
    logServerError("auth.request", error);
    return Response.json(
      { error: "Authentication service unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export const GET = handle;
export const POST = handle;
