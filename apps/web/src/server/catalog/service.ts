import "server-only";
import { z } from "zod";
import { requireRole } from "../session";
import { getDatabase } from "../database";
import {
  workInputSchema,
  updateWorkSchema,
  visibilityInputSchema,
  catalogQuerySchema,
  type CatalogQuery,
} from "../../features/catalog/contracts";
import { CatalogError, sanitizeCatalogError } from "./errors";
import {
  findWorkBySlug,
  searchWorks,
  loadWork,
  saveWork,
  changeVisibility,
} from "./repository";
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new CatalogError(400, "VALIDATION");
  // Leave space for JSONB formatting and immutable provenance in the 64 KiB audit record.
  if (Buffer.byteLength(JSON.stringify(result.data), "utf8") > 60000)
    throw new CatalogError(400, "PAYLOAD_TOO_LARGE");
  return result.data;
}
function id(value: string) {
  return parse(z.string().uuid(), value);
}
async function safe<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    const dbCode =
      (error as { cause?: { code?: string }; code?: string })?.cause?.code ??
      (error as { code?: string })?.code;
    if (dbCode === "23505") throw new CatalogError(409, "CONFLICT");
    throw sanitizeCatalogError(error);
  }
}
export async function listWorks(query: CatalogQuery = {}) {
  return safe(() => searchWorks(parse(catalogQuerySchema, query), false));
}
export async function getWorkBySlug(slug: string, locale: "en" | "vi" = "en") {
  return safe(() =>
    findWorkBySlug(
      parse(z.string().min(1).max(160), slug),
      parse(z.enum(["en", "vi"]), locale),
    ),
  );
}
export async function adminListWorks(query: CatalogQuery, headers: Headers) {
  return safe(async () => {
    await requireRole(["admin"], headers);
    return searchWorks(parse(catalogQuerySchema, query), true);
  });
}
export async function adminGetWork(workId: string, headers: Headers) {
  return safe(async () => {
    await requireRole(["admin"], headers);
    return loadWork(getDatabase(), id(workId), "en", true);
  });
}
export async function createWork(input: unknown, headers: Headers) {
  return safe(async () => {
    const session = await requireRole(["admin"], headers);
    return saveWork(parse(workInputSchema, input), session.user.id);
  });
}
export async function updateWork(
  workId: string,
  input: unknown,
  headers: Headers,
) {
  return safe(async () => {
    const session = await requireRole(["admin"], headers);
    const parsed = parse(updateWorkSchema, input);
    const { revision, ...work } = parsed;
    return saveWork(work, session.user.id, id(workId), revision);
  });
}
export async function setVisibility(
  workId: string,
  input: unknown,
  headers: Headers,
) {
  return safe(async () => {
    const session = await requireRole(["admin"], headers);
    const parsed = parse(visibilityInputSchema, input);
    return changeVisibility(
      id(workId),
      parsed.revision,
      parsed.visibility,
      session.user.id,
      parsed.publicationReviewAcknowledged,
    );
  });
}
