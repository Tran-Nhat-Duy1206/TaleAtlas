export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(
    { status: "ok", service: "taleatlas-web" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
