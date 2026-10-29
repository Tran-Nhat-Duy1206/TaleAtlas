import "server-only";
import { sql } from "drizzle-orm";
import { ZodError } from "zod";
import type { Database } from "@taleatlas/database/client";
import {
  READER_PROFILE_BODY_MAX_BYTES,
  ReaderProfileFoundationError,
  readerProfileFoundationBodySchema,
  readerProfileFoundationResponseSchema,
  readerProfileErrorCodeSchema,
  readerProfileErrorStatus,
  requireEmptyReaderProfileQuery,
} from "../../features/reader-profile/http-contracts";
import { isReaderProfileOwnerEnabled } from "./availability";
import type { ReaderProfileAttemptClass } from "./rate-limits";

export type ReaderProfileAuthorityTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
declare const principalBrand: unique symbol;
/** Opaque server-issued capability, not a serializable identity or an input DTO. */
export type ReaderProfilePrincipal = Readonly<{ [principalBrand]: true }>;
type Identity = Readonly<{ accountId: string; sessionId: string }>;
const identities = new WeakMap<ReaderProfilePrincipal, Identity>();
const locked = new WeakMap<
  ReaderProfileAuthorityTransaction,
  WeakSet<ReaderProfilePrincipal>
>();

function enabled(): void {
  if (!isReaderProfileOwnerEnabled())
    throw new ReaderProfileFoundationError("PROFILE_UNAVAILABLE");
}
function identityOf(principal: ReaderProfilePrincipal): Identity {
  const identity =
    typeof principal === "object" && principal !== null
      ? identities.get(principal)
      : undefined;
  if (!identity)
    throw new ReaderProfileFoundationError("AUTHENTICATION_REQUIRED");
  return identity;
}

/** Initial signed authority only; callers MUST subsequently fence their transaction. */
export async function requireReaderProfilePrincipal(
  requestHeaders: Headers,
): Promise<ReaderProfilePrincipal> {
  enabled();
  // Do not initialize auth/database modules at import time or while disabled.
  const { requireSession } = await import("../session");
  const signed = await requireSession(requestHeaders);
  if (signed.user.emailVerified !== true)
    throw new ReaderProfileFoundationError("ACCESS_DENIED");
  const accountId = signed.user.id;
  const sessionId = signed.session.id;
  if (
    typeof accountId !== "string" ||
    accountId.length === 0 ||
    typeof sessionId !== "string" ||
    sessionId.length === 0 ||
    signed.session.userId !== accountId
  )
    throw new ReaderProfileFoundationError("AUTHENTICATION_REQUIRED");
  const principal = Object.freeze({}) as ReaderProfilePrincipal;
  identities.set(principal, Object.freeze({ accountId, sessionId }));
  return principal;
}

async function current(
  tx: ReaderProfileAuthorityTransaction,
  identity: Identity,
): Promise<string> {
  // A separate statement AFTER lock acquisition: neither transaction time nor a
  // pre-wait expiry predicate establishes authority at this check's DB clock.
  const rows = await tx.execute<{ id: string }>(sql`
    /* reader_profile_authority_current */
    select s.id from public.sessions s
    join public.users u on u.id = s.user_id
    where u.id = ${identity.accountId} and u.email_verified = true
      and s.id = ${identity.sessionId} and s.user_id = ${identity.accountId}
      and s.expires_at > clock_timestamp()
  `);
  if (rows.length !== 1 || rows[0]?.id !== identity.sessionId)
    throw new ReaderProfileFoundationError("AUTHENTICATION_REQUIRED");
  return identity.accountId;
}

/**
 * Single-actor foundation, within a caller-owned transaction. User/session locks
 * last until that transaction ends. No role-based ownership override exists.
 * This is NOT the future multi-account block-lock protocol: do not lock an actor
 * first and append an unordered target lock in a later batch.
 */
export async function lockReaderProfilePrincipal(
  tx: ReaderProfileAuthorityTransaction,
  principal: ReaderProfilePrincipal,
): Promise<string> {
  enabled();
  const identity = identityOf(principal);
  const users = await tx.execute<{ id: string; verified: boolean }>(sql`
    /* reader_profile_authority_user */
    select id, email_verified as verified from public.users
    where id = ${identity.accountId} for no key update
  `);
  if (
    users.length !== 1 ||
    users[0]?.id !== identity.accountId ||
    users[0]?.verified !== true
  )
    throw new ReaderProfileFoundationError("ACCESS_DENIED");
  const sessions = await tx.execute<{ id: string }>(sql`
    /* reader_profile_authority_session */
    select id from public.sessions
    where id = ${identity.sessionId} and user_id = ${identity.accountId}
    for share
  `);
  if (sessions.length !== 1 || sessions[0]?.id !== identity.sessionId)
    throw new ReaderProfileFoundationError("AUTHENTICATION_REQUIRED");
  const accountId = await current(tx, identity);
  let principals = locked.get(tx);
  if (!principals) {
    principals = new WeakSet();
    locked.set(tx, principals);
  }
  principals.add(principal);
  return accountId;
}

/**
 * Recheck after ANY later lock wait and immediately before the future operation's
 * authorization/SQL linearization point. Locks prevent revocation/deletion races,
 * not wall-clock expiry. This does not promise authority until response delivery.
 */
export async function assertReaderProfilePrincipalCurrent(
  tx: ReaderProfileAuthorityTransaction,
  principal: ReaderProfilePrincipal,
): Promise<string> {
  enabled();
  const identity = identityOf(principal);
  if (!locked.get(tx)?.has(principal))
    throw new ReaderProfileFoundationError("AUTHENTICATION_REQUIRED");
  return current(tx, identity);
}

/** Empty foundation transport only; no profile command or live route is added. */
export async function readReaderProfileFoundationJson(
  request: Request,
  // Trusted internal dispatch only; this is never read from HTTP inputs.
  attemptClass: ReaderProfileAttemptClass = "ordinary",
) {
  enabled();
  requireEmptyReaderProfileQuery(new URL(request.url));
  const { requireTrustedOrigin, readJson } = await import("../http");
  requireTrustedOrigin(request);
  const principal = await requireReaderProfilePrincipal(request.headers);
  const { chargeReaderProfileAttempt } = await import("./rate-limits");
  // Admission commits independently before reading any body or business work.
  await chargeReaderProfileAttempt(principal, attemptClass);
  const body = await readJson(
    request,
    readerProfileFoundationBodySchema,
    READER_PROFILE_BODY_MAX_BYTES,
  );
  return { principal, body };
}

/** Closed foundation response only; disabled execution never invokes the callback. */
export async function readerProfileFoundationJson(
  run: () => unknown | Promise<unknown>,
): Promise<Response> {
  if (!isReaderProfileOwnerEnabled())
    return Response.json(
      { error: "PROFILE_UNAVAILABLE" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  const { safeJson, HttpError } = await import("../http");
  const { AuthorizationError, AuthenticationUnavailableError } =
    await import("../session");
  let retryAfterSeconds: number | undefined;
  const response = await safeJson("reader-profile.foundation", async () => {
    try {
      const parsed = readerProfileFoundationResponseSchema.safeParse(
        await run(),
      );
      if (!parsed.success)
        throw new ReaderProfileFoundationError("SERVICE_UNAVAILABLE");
      return parsed.data;
    } catch (error) {
      if (
        error instanceof ReaderProfileFoundationError ||
        error instanceof HttpError
      ) {
        const code = readerProfileErrorCodeSchema.safeParse(error.code);
        if (
          code.success &&
          readerProfileErrorStatus[code.data] === error.status
        ) {
          if (code.data === "RATE_LIMITED") {
            const retry =
              error instanceof ReaderProfileFoundationError
                ? error.retryAfterSeconds
                : undefined;
            if (!Number.isInteger(retry) || retry! < 1 || retry! > 60)
              throw new HttpError(503, "SERVICE_UNAVAILABLE");
            retryAfterSeconds = retry;
          }
          throw new HttpError(error.status, code.data);
        }
      }
      if (error instanceof AuthorizationError) {
        if (error.status === 401)
          throw new HttpError(401, "AUTHENTICATION_REQUIRED");
        if (error.status === 403) throw new HttpError(403, "ACCESS_DENIED");
      }
      if (error instanceof AuthenticationUnavailableError)
        throw new HttpError(503, "AUTHENTICATION_UNAVAILABLE");
      if (error instanceof ZodError)
        throw new HttpError(400, "VALIDATION_ERROR");
      // Foreign feature errors and unexpected exceptions cannot supply response
      // codes, messages or raw objects to the shared logger/response adapter.
      throw new Error("Reader profile operation failed");
    }
  });
  if (response.status === 429 && retryAfterSeconds !== undefined)
    response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}
