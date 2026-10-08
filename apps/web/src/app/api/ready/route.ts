import { checkDatabaseHealth } from "@/server/database";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const database = await checkDatabaseHealth();
  return Response.json(
    { status: database.status, database: database.status },
    {
      status: database.status === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
