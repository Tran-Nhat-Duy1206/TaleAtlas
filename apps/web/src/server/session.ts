import "server-only";
import { headers } from "next/headers";
import type { UserRole } from "@taleatlas/database/schema";
import { getAuth } from "./auth";
import { logServerError } from "./logger";
export class AuthenticationUnavailableError extends Error {
  readonly status = 503;
  constructor() {
    super("Authentication service unavailable");
    this.name = "AuthenticationUnavailableError";
  }
}

export class AuthorizationError extends Error {
  readonly status: 401 | 403;
  constructor(status: 401 | 403) {
    super(status === 401 ? "Authentication required" : "Access denied");
    this.name = "AuthorizationError";
    this.status = status;
  }
}
export async function getSession(requestHeaders?: Headers) {
  try {
    return await getAuth().api.getSession({
      headers: requestHeaders ?? (await headers()),
    });
  } catch (error) {
    // Database/adapter errors can contain query parameters (including session tokens).
    // Never let Next's default server error reporter serialize them.
    logServerError("auth.session", error);
    throw new AuthenticationUnavailableError();
  }
}
export async function requireSession(requestHeaders?: Headers) {
  const session = await getSession(requestHeaders);
  if (!session) throw new AuthorizationError(401);
  return session;
}
export async function requireRole(
  allowed: readonly UserRole[],
  requestHeaders?: Headers,
) {
  const session = await requireSession(requestHeaders);
  if (!allowed.some((role) => role === session.user.role))
    throw new AuthorizationError(403);
  return session;
}
export async function revokeAllSessions(requestHeaders?: Headers) {
  const currentHeaders = requestHeaders ?? (await headers());
  await requireSession(currentHeaders);
  return getAuth().api.revokeSessions({ headers: currentHeaders });
}
export async function changePassword(
  currentPassword: string,
  newPassword: string,
  requestHeaders?: Headers,
) {
  const currentHeaders = requestHeaders ?? (await headers());
  await requireSession(currentHeaders);
  return getAuth().api.changePassword({
    headers: currentHeaders,
    body: { currentPassword, newPassword, revokeOtherSessions: true },
  });
}
