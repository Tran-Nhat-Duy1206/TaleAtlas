import { z } from "zod";
import { readerProfilePlainDataSchema } from "./contracts";

export const READER_PROFILE_BODY_MAX_BYTES = 8192;

/** Transport handshake only; no profile lifecycle command is approved here. */
export const readerProfileFoundationBodySchema =
  readerProfilePlainDataSchema.pipe(z.object({}).strict());
export const readerProfileFoundationResponseSchema = z
  .object({ ok: z.literal(true) })
  .strict();

export const readerProfileErrorCodeSchema = z.enum([
  "PROFILE_UNAVAILABLE",
  "AUTHENTICATION_REQUIRED",
  "ACCESS_DENIED",
  "UNTRUSTED_ORIGIN",
  "JSON_REQUIRED",
  "BODY_TOO_LARGE",
  "INVALID_JSON",
  "VALIDATION_ERROR",
  "AUTHENTICATION_UNAVAILABLE",
  "SERVICE_UNAVAILABLE",
  "RATE_LIMITED",
]);
export type ReaderProfileErrorCode = z.infer<
  typeof readerProfileErrorCodeSchema
>;
export const readerProfileErrorStatus = Object.freeze({
  PROFILE_UNAVAILABLE: 404,
  AUTHENTICATION_REQUIRED: 401,
  ACCESS_DENIED: 403,
  UNTRUSTED_ORIGIN: 403,
  JSON_REQUIRED: 415,
  BODY_TOO_LARGE: 413,
  INVALID_JSON: 400,
  VALIDATION_ERROR: 400,
  AUTHENTICATION_UNAVAILABLE: 503,
  SERVICE_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
} as const satisfies Readonly<Record<ReaderProfileErrorCode, number>>);
export const readerProfileErrorResponseSchema = z
  .object({ error: readerProfileErrorCodeSchema })
  .strict();

export class ReaderProfileFoundationError extends Error {
  readonly code: ReaderProfileErrorCode;
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(code: ReaderProfileErrorCode, retryAfterSeconds?: number) {
    const parsed = readerProfileErrorCodeSchema.safeParse(code);
    const boundedRetry =
      Number.isInteger(retryAfterSeconds) &&
      retryAfterSeconds! >= 1 &&
      retryAfterSeconds! <= 60;
    const safeCode =
      parsed.success &&
      (parsed.data !== "RATE_LIMITED" || boundedRetry) &&
      (retryAfterSeconds === undefined ||
        (parsed.data === "RATE_LIMITED" && boundedRetry))
        ? parsed.data
        : "SERVICE_UNAVAILABLE";
    super(safeCode);
    this.code = safeCode;
    this.status = readerProfileErrorStatus[safeCode];
    if (safeCode === "RATE_LIMITED") this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** No query inputs are approved, including duplicate or empty-valued keys. */
export function requireEmptyReaderProfileQuery(url: URL): void {
  if (url.href.length > 8192 || url.searchParams.size > 0)
    throw new ReaderProfileFoundationError("VALIDATION_ERROR");
}
