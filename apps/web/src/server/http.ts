import "server-only";
import { ZodError, type ZodType } from "zod";
import { getAuthEnv } from "./env";
import { getDatabaseConnection } from "./database";
import { AuthorizationError, AuthenticationUnavailableError } from "./session";
import { logServerError } from "./logger";
import { CatalogError } from "./catalog/errors";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
export async function safeJson(
  operation: string,
  run: () => Promise<unknown>,
): Promise<Response> {
  try {
    return Response.json(await run(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof HttpError || error instanceof CatalogError) {
      return Response.json(
        { error: error.code },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (error instanceof AuthorizationError) {
      return Response.json(
        {
          error:
            error.status === 401 ? "AUTHENTICATION_REQUIRED" : "ACCESS_DENIED",
        },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (error instanceof ZodError) {
      return Response.json(
        { error: "VALIDATION_ERROR" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    logServerError(operation, error);
    return Response.json(
      {
        error:
          error instanceof AuthenticationUnavailableError
            ? "AUTHENTICATION_UNAVAILABLE"
            : "SERVICE_UNAVAILABLE",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export function requireTrustedOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== getAuthEnv().APP_ORIGIN)
    throw new HttpError(403, "UNTRUSTED_ORIGIN");
}
export async function readJson<T>(
  request: Request,
  schema: ZodType<T>,
  maxBytes = 65536,
): Promise<T> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    throw new HttpError(415, "JSON_REQUIRED");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes))
    throw new HttpError(413, "BODY_TOO_LARGE");
  if (!request.body) throw new HttpError(400, "INVALID_JSON");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let data: unknown;
  try {
    data = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    throw new HttpError(400, "INVALID_JSON");
  }
  return schema.parse(data);
}
// Independent from Better Auth's endpoint limiter. Database time avoids host clock skew.
export async function limitCatalogMutation(userId: string): Promise<void> {
  const sql = getDatabaseConnection().client;
  const key = `catalog.write:${userId}`;
  const rows = await sql<{ count: number }[]>`
    insert into rate_limits (id, key, count, last_request)
    values (${crypto.randomUUID()}, ${key}, 1, (extract(epoch from now()) * 1000)::bigint)
    on conflict (key) do update set
      count = case when rate_limits.last_request < (extract(epoch from now()) * 1000)::bigint - 60000 then 1 else rate_limits.count + 1 end,
      last_request = case when rate_limits.last_request < (extract(epoch from now()) * 1000)::bigint - 60000 then (extract(epoch from now()) * 1000)::bigint else rate_limits.last_request end
    returning count
  `;
  if (!rows[0] || rows[0].count > 30) throw new HttpError(429, "RATE_LIMITED");
}
