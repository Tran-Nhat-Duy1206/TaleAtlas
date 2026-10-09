import { z } from "zod";
import { getWorkBySlug } from "@/server/catalog/service";
import { safeJson } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  return safeJson("catalog.detail", async () => {
    const { slug } = await context.params;
    const locale = z
      .enum(["en", "vi"])
      .parse(new URL(request.url).searchParams.get("locale") ?? "en");
    return getWorkBySlug(
      z
        .string()
        .min(1)
        .max(160)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .parse(slug),
      locale,
    );
  });
}
