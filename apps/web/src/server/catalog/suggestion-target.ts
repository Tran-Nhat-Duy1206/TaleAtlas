import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { works } from "@taleatlas/database/catalog";
import { getDatabase } from "../database";

// This projection deliberately cannot return candidate/private aggregate data.
export async function getSuggestionTarget(
  lookup: { id: string } | { slug: string },
) {
  const id = "id" in lookup ? z.uuid().safeParse(lookup.id) : null;
  const slug =
    "slug" in lookup ? z.string().min(1).max(160).safeParse(lookup.slug) : null;
  if ((id && !id.success) || (slug && !slug.success)) return null;
  const predicate = id?.success
    ? eq(works.id, id.data)
    : slug?.success
      ? eq(works.slug, slug.data)
      : null;
  if (!predicate) return null;
  const [target] = await getDatabase()
    .select({
      id: works.id,
      revision: works.revision,
      slug: works.slug,
      displayTitle: works.primaryTitle,
    })
    .from(works)
    .where(and(predicate, eq(works.visibility, "PUBLISHED")))
    .limit(1);
  return target ?? null;
}
